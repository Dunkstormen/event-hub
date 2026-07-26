import type { Prisma, PrismaClient } from "@event-hub/database";
import {
  EVENTS_MANAGE_CAPABILITY,
  ROSTERS_MANAGE_CAPABILITY,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "@event-hub/database";

export const DERIVED_CONTROLLER_CAPABILITY =
  "controllers.participate";

export type EffectiveAuthorization = Readonly<{
  actorUserId: string;
  globalCapabilityKeys: readonly string[];
  firCapabilities: readonly Readonly<{
    firIcaoCode: string;
    capabilityKeys: readonly string[];
  }>[];
  controllerEligible: boolean;
  controllerFirIcaoCodes: readonly string[];
}>;

export type EventCollaborationTarget = Readonly<{
  owningFirIcaoCode: string;
  participatingFirIcaoCodes: readonly string[];
}>;

export type EventReadTarget = EventCollaborationTarget &
  Readonly<{
    published: boolean;
  }>;

export type EventCollaborationAction =
  | Readonly<{
      kind:
        | "view-draft"
        | "edit-content"
        | "manage-occurrences"
        | "manage-resources"
        | "manage-routings"
        | "manage-roster"
        | "add-participating-fir"
        | "cancel-series"
        | "delete-series";
    }>
  | Readonly<{
      kind: "remove-participating-fir" | "transfer-ownership";
      targetFirIcaoCode: string;
    }>;

type AuthorizationDataSource = Pick<
  Prisma.TransactionClient,
  "user"
>;

export class AuthorizationPolicyDeniedError extends Error {
  constructor() {
    super("The actor does not have the required permission.");
    this.name = "AuthorizationPolicyDeniedError";
  }
}

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizeIcaoCode(icaoCode: string) {
  return icaoCode.trim().toUpperCase();
}

export async function evaluateAuthorization(
  database: AuthorizationDataSource,
  actorUserId: string,
  now: Date = new Date(),
): Promise<EffectiveAuthorization | null> {
  const actor = await database.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      status: true,
      roleAssignments: {
        select: {
          fir: {
            select: {
              active: true,
              icaoCode: true,
            },
          },
          role: {
            select: {
              capabilities: {
                select: { capabilityKey: true },
              },
            },
          },
        },
      },
      firMemberships: {
        where: { status: "ACTIVE" },
        select: {
          source: true,
          providerFreshUntil: true,
          fir: {
            select: {
              active: true,
              icaoCode: true,
            },
          },
        },
      },
      eligibilitySnapshots: {
        where: {
          rostered: true,
          freshUntil: { gt: now },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (actor?.status !== "ACTIVE") {
    return null;
  }

  const globalCapabilities = new Set<string>();
  const firCapabilities = new Map<string, Set<string>>();

  for (const assignment of actor.roleAssignments) {
    if (assignment.fir === null) {
      for (const grant of assignment.role.capabilities) {
        globalCapabilities.add(grant.capabilityKey);
      }
      continue;
    }

    if (!assignment.fir.active) {
      continue;
    }

    const capabilityKeys =
      firCapabilities.get(assignment.fir.icaoCode) ??
      new Set<string>();
    for (const grant of assignment.role.capabilities) {
      if (!globalCapabilities.has(grant.capabilityKey)) {
        capabilityKeys.add(grant.capabilityKey);
      }
    }
    firCapabilities.set(assignment.fir.icaoCode, capabilityKeys);
  }

  for (const capabilityKey of globalCapabilities) {
    for (const capabilityKeys of firCapabilities.values()) {
      capabilityKeys.delete(capabilityKey);
    }
  }

  const controllerFirIcaoCodes = new Set<string>();
  for (const membership of actor.firMemberships) {
    const evidenceIsUsable =
      membership.source === "MANUAL" ||
      (membership.providerFreshUntil !== null &&
        membership.providerFreshUntil > now);

    if (membership.fir.active && evidenceIsUsable) {
      controllerFirIcaoCodes.add(membership.fir.icaoCode);
    }
  }

  const controllerEligible =
    actor.eligibilitySnapshots.length > 0 ||
    controllerFirIcaoCodes.size > 0;
  if (actor.eligibilitySnapshots.length > 0) {
    globalCapabilities.add(DERIVED_CONTROLLER_CAPABILITY);
  } else {
    for (const firIcaoCode of controllerFirIcaoCodes) {
      const capabilityKeys =
        firCapabilities.get(firIcaoCode) ?? new Set<string>();
      capabilityKeys.add(DERIVED_CONTROLLER_CAPABILITY);
      firCapabilities.set(firIcaoCode, capabilityKeys);
    }
  }

  return {
    actorUserId: actor.id,
    globalCapabilityKeys: sorted(globalCapabilities),
    firCapabilities: [...firCapabilities.entries()]
      .filter(([, capabilityKeys]) => capabilityKeys.size > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([firIcaoCode, capabilityKeys]) => ({
        firIcaoCode,
        capabilityKeys: sorted(capabilityKeys),
      })),
    controllerEligible,
    controllerFirIcaoCodes: sorted(controllerFirIcaoCodes),
  };
}

export function hasGlobalCapability(
  authorization: EffectiveAuthorization | null,
  capabilityKey: string,
) {
  return (
    authorization?.globalCapabilityKeys.includes(capabilityKey) ??
    false
  );
}

export function hasFirCapability(
  authorization: EffectiveAuthorization | null,
  capabilityKey: string,
  firIcaoCode: string,
) {
  if (hasGlobalCapability(authorization, capabilityKey)) {
    return true;
  }

  const canonicalIcaoCode = normalizeIcaoCode(firIcaoCode);
  return (
    authorization?.firCapabilities
      .find(
        (capabilities) =>
          capabilities.firIcaoCode === canonicalIcaoCode,
      )
      ?.capabilityKeys.includes(capabilityKey) ?? false
  );
}

function hasParticipatingFirCapability(
  authorization: EffectiveAuthorization | null,
  capabilityKey: string,
  event: EventCollaborationTarget,
) {
  const participatingFirs = new Set(
    event.participatingFirIcaoCodes.map(normalizeIcaoCode),
  );
  participatingFirs.add(
    normalizeIcaoCode(event.owningFirIcaoCode),
  );

  return [...participatingFirs].some((firIcaoCode) =>
    hasFirCapability(
      authorization,
      capabilityKey,
      firIcaoCode,
    ),
  );
}

export function canManageEvent(
  authorization: EffectiveAuthorization | null,
  event: EventCollaborationTarget,
  action: EventCollaborationAction,
) {
  const owningFirIcaoCode = normalizeIcaoCode(
    event.owningFirIcaoCode,
  );
  const ownsEventScope = hasFirCapability(
    authorization,
    EVENTS_MANAGE_CAPABILITY,
    owningFirIcaoCode,
  );

  switch (action.kind) {
    case "view-draft":
    case "edit-content":
    case "manage-occurrences":
    case "manage-resources":
    case "manage-routings":
      return hasParticipatingFirCapability(
        authorization,
        EVENTS_MANAGE_CAPABILITY,
        event,
      );
    case "manage-roster":
      return hasParticipatingFirCapability(
        authorization,
        ROSTERS_MANAGE_CAPABILITY,
        event,
      );
    case "add-participating-fir":
    case "cancel-series":
    case "delete-series":
      return ownsEventScope;
    case "remove-participating-fir":
      return (
        ownsEventScope &&
        normalizeIcaoCode(action.targetFirIcaoCode) !==
          owningFirIcaoCode
      );
    case "transfer-ownership": {
      const targetFirIcaoCode = normalizeIcaoCode(
        action.targetFirIcaoCode,
      );
      return (
        ownsEventScope &&
        targetFirIcaoCode !== owningFirIcaoCode &&
        event.participatingFirIcaoCodes
          .map(normalizeIcaoCode)
          .includes(targetFirIcaoCode)
      );
    }
  }
}

export async function requireGlobalCapability(
  database: AuthorizationDataSource,
  actorUserId: string,
  capabilityKey: string,
  now: Date = new Date(),
) {
  const authorization = await evaluateAuthorization(
    database,
    actorUserId,
    now,
  );

  if (!hasGlobalCapability(authorization, capabilityKey)) {
    throw new AuthorizationPolicyDeniedError();
  }

  return authorization;
}

export async function requireFirCapability(
  database: AuthorizationDataSource,
  actorUserId: string,
  capabilityKey: string,
  firIcaoCode: string,
  now: Date = new Date(),
) {
  const authorization = await evaluateAuthorization(
    database,
    actorUserId,
    now,
  );

  if (
    !hasFirCapability(
      authorization,
      capabilityKey,
      firIcaoCode,
    )
  ) {
    throw new AuthorizationPolicyDeniedError();
  }

  return authorization;
}

export function hasControllerEligibility(
  authorization: EffectiveAuthorization | null,
  firIcaoCode?: string,
) {
  if (authorization === null) {
    return false;
  }

  if (firIcaoCode === undefined) {
    return authorization.controllerEligible;
  }

  return authorization.controllerFirIcaoCodes.includes(
    normalizeIcaoCode(firIcaoCode),
  );
}

export async function requireControllerEligibility(
  database: AuthorizationDataSource,
  actorUserId: string,
  firIcaoCode?: string,
  now: Date = new Date(),
) {
  const authorization = await evaluateAuthorization(
    database,
    actorUserId,
    now,
  );

  if (!hasControllerEligibility(authorization, firIcaoCode)) {
    throw new AuthorizationPolicyDeniedError();
  }

  return authorization;
}

export function canReadEvent(
  authorization: EffectiveAuthorization | null,
  event: EventReadTarget,
) {
  return (
    event.published ||
    canManageEvent(
      authorization,
      event,
      { kind: "view-draft" },
    )
  );
}

export async function requireEventCollaboration(
  database: AuthorizationDataSource,
  actorUserId: string,
  event: EventCollaborationTarget,
  action: EventCollaborationAction,
  now: Date = new Date(),
) {
  const authorization = await evaluateAuthorization(
    database,
    actorUserId,
    now,
  );

  if (!canManageEvent(authorization, event, action)) {
    throw new AuthorizationPolicyDeniedError();
  }

  return authorization;
}

export async function requireAdministrator(
  database: AuthorizationDataSource,
  actorUserId: string,
  now: Date = new Date(),
) {
  return requireGlobalCapability(
    database,
    actorUserId,
    SYSTEM_ADMINISTRATOR_CAPABILITY,
    now,
  );
}

export class AuthorizationPolicy {
  readonly #clock: () => Date;
  readonly #database: PrismaClient;

  constructor(
    database: PrismaClient,
    clock: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#clock = clock;
  }

  evaluate(actorUserId: string) {
    return evaluateAuthorization(
      this.#database,
      actorUserId,
      this.#clock(),
    );
  }

  requireGlobal(actorUserId: string, capabilityKey: string) {
    return requireGlobalCapability(
      this.#database,
      actorUserId,
      capabilityKey,
      this.#clock(),
    );
  }

  requireFir(
    actorUserId: string,
    capabilityKey: string,
    firIcaoCode: string,
  ) {
    return requireFirCapability(
      this.#database,
      actorUserId,
      capabilityKey,
      firIcaoCode,
      this.#clock(),
    );
  }

  requireAdministrator(actorUserId: string) {
    return requireAdministrator(
      this.#database,
      actorUserId,
      this.#clock(),
    );
  }

  requireController(actorUserId: string, firIcaoCode?: string) {
    return requireControllerEligibility(
      this.#database,
      actorUserId,
      firIcaoCode,
      this.#clock(),
    );
  }

  requireEvent(
    actorUserId: string,
    event: EventCollaborationTarget,
    action: EventCollaborationAction,
  ) {
    return requireEventCollaboration(
      this.#database,
      actorUserId,
      event,
      action,
      this.#clock(),
    );
  }
}
