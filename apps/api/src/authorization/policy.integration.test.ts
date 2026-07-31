import { Value } from "@sinclair/typebox/value";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ApiErrorResponseSchema,
} from "@event-hub/contracts";
import {
  ADMINISTRATOR_ROLE_KEY,
  createDatabaseClient,
  EVENTS_MANAGE_CAPABILITY,
  EVENTS_PARTICIPATE_CAPABILITY,
  EVENT_COORDINATOR_ROLE_KEY,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createIdentitySessionRepository } from "../auth/repository.js";
import { ApiError } from "../errors.js";
import { AuthorizationApiGuard } from "./api-guard.js";
import {
  AuthorizationPolicy,
  AuthorizationPolicyDeniedError,
  DERIVED_CONTROLLER_CAPABILITY,
  canManageEvent,
  canReadEvent,
  evaluateAuthorization,
  hasControllerEligibility,
  hasFirCapability,
  type EventCollaborationAction,
} from "./policy.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const now = new Date("2026-07-26T12:00:00.000Z");
const sessionToken = "A".repeat(43);
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;
const apps: ReturnType<typeof buildApp>[] = [];

async function clearAuthorizationState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.auditRecord.deleteMany();
  await database.controllerEndorsement.deleteMany();
  await database.controllerEligibilitySnapshot.deleteMany();
  await database.firMembership.deleteMany();
  await database.userRoleAssignment.deleteMany();
  await database.roleCapability.deleteMany();
  await database.role.deleteMany();
  await database.capability.deleteMany();
  await database.user.deleteMany();
}

async function createCoordinator(
  cid: string,
  firIcaoCode: string,
) {
  const [user, role, fir] = await Promise.all([
    database.user.create({
      data: { cid },
      select: { id: true, cid: true },
    }),
    database.role.findUniqueOrThrow({
      where: { key: EVENT_COORDINATOR_ROLE_KEY },
      select: { id: true },
    }),
    database.fir.findUniqueOrThrow({
      where: { icaoCode: firIcaoCode },
      select: { id: true },
    }),
  ]);

  await database.userRoleAssignment.create({
    data: {
      userId: user.id,
      roleId: role.id,
      firId: fir.id,
      scopeKey: fir.id,
    },
  });

  return user;
}

beforeEach(async () => {
  await clearAuthorizationState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database, "10000001");
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

afterAll(async () => {
  try {
    await clearAuthorizationState();
  } finally {
    await database.$disconnect();
  }
});

describe("central authorization policy", () => {
  it("evaluates the default Pilot grant and protected administrator capabilities", async () => {
    const repository = createIdentitySessionRepository(database);
    const pilot = await repository.synchronizeVatsimIdentity({
      cid: "10000002",
      displayName: "Default Pilot",
      synchronizedAt: now,
    });
    const administrator = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
      select: { id: true },
    });
    const policy = new AuthorizationPolicy(database, () => now);

    const pilotAuthorization = await policy.evaluate(pilot.id);
    const administratorAuthorization =
      await policy.requireAdministrator(administrator.id);

    expect(pilotAuthorization).toMatchObject({
      globalCapabilityKeys: [EVENTS_PARTICIPATE_CAPABILITY],
      firCapabilities: [],
      controllerEligible: false,
      controllerFirIcaoCodes: [],
    });
    expect(
      administratorAuthorization.globalCapabilityKeys,
    ).toContain(EVENTS_MANAGE_CAPABILITY);
    await expect(
      policy.requireAdministrator(pilot.id),
    ).rejects.toBeInstanceOf(AuthorizationPolicyDeniedError);
  });

  it("denies cross-FIR coordinator access while allowing anonymous published reads", async () => {
    const coordinator = await createCoordinator("10000002", "EKDK");
    const authorization = await evaluateAuthorization(
      database,
      coordinator.id,
      now,
    );

    expect(
      hasFirCapability(
        authorization,
        EVENTS_MANAGE_CAPABILITY,
        "EKDK",
      ),
    ).toBe(true);
    expect(
      hasFirCapability(
        authorization,
        EVENTS_MANAGE_CAPABILITY,
        "EFIN",
      ),
    ).toBe(false);
    expect(
      canReadEvent(null, {
        owningFirIcaoCode: "EFIN",
        participatingFirIcaoCodes: [],
        published: true,
      }),
    ).toBe(true);
    expect(
      canReadEvent(null, {
        owningFirIcaoCode: "EFIN",
        participatingFirIcaoCodes: [],
        published: false,
      }),
    ).toBe(false);
    expect(
      canReadEvent(authorization, {
        owningFirIcaoCode: "EKDK",
        participatingFirIcaoCodes: [],
        published: false,
      }),
    ).toBe(true);
    expect(
      canReadEvent(authorization, {
        owningFirIcaoCode: "EFIN",
        participatingFirIcaoCodes: [],
        published: false,
      }),
    ).toBe(false);
  });

  it("applies every invited-FIR collaboration and owner-only restriction", async () => {
    const [owner, invitedOne, invitedTwo, outsider] =
      await Promise.all([
        createCoordinator("10000002", "EKDK"),
        createCoordinator("10000003", "EFIN"),
        createCoordinator("10000004", "EFIN"),
        createCoordinator("10000005", "ESAA"),
      ]);
    const [
      ownerAuthorization,
      invitedOneAuthorization,
      invitedTwoAuthorization,
      outsiderAuthorization,
    ] = await Promise.all(
      [owner, invitedOne, invitedTwo, outsider].map((user) =>
        evaluateAuthorization(database, user.id, now),
      ),
    );
    const event = {
      owningFirIcaoCode: "EKDK",
      participatingFirIcaoCodes: ["EKDK", "EFIN"],
    } as const;
    const collaborativeActions: readonly EventCollaborationAction[] =
      [
        { kind: "view-draft" },
        { kind: "edit-content" },
        { kind: "manage-occurrences" },
        { kind: "manage-resources" },
        { kind: "manage-routings" },
        { kind: "manage-roster" },
      ];
    const ownerOnlyActions: readonly EventCollaborationAction[] = [
      { kind: "add-participating-fir" },
      {
        kind: "remove-participating-fir",
        targetFirIcaoCode: "EFIN",
      },
      {
        kind: "transfer-ownership",
        targetFirIcaoCode: "EFIN",
      },
      { kind: "cancel-series" },
      { kind: "delete-series" },
    ];

    for (const action of collaborativeActions) {
      expect(
        canManageEvent(ownerAuthorization, event, action),
      ).toBe(true);
      expect(
        canManageEvent(invitedOneAuthorization, event, action),
      ).toBe(true);
      expect(
        canManageEvent(invitedTwoAuthorization, event, action),
      ).toBe(true);
      expect(
        canManageEvent(outsiderAuthorization, event, action),
      ).toBe(false);
    }

    for (const action of ownerOnlyActions) {
      expect(
        canManageEvent(ownerAuthorization, event, action),
      ).toBe(true);
      expect(
        canManageEvent(invitedOneAuthorization, event, action),
      ).toBe(false);
      expect(
        canManageEvent(invitedTwoAuthorization, event, action),
      ).toBe(false);
      expect(
        canManageEvent(outsiderAuthorization, event, action),
      ).toBe(false);
    }

    expect(
      canManageEvent(ownerAuthorization, event, {
        kind: "remove-participating-fir",
        targetFirIcaoCode: "EKDK",
      }),
    ).toBe(false);
    expect(
      canManageEvent(ownerAuthorization, event, {
        kind: "transfer-ownership",
        targetFirIcaoCode: "EKDK",
      }),
    ).toBe(false);
    expect(
      canManageEvent(ownerAuthorization, event, {
        kind: "transfer-ownership",
        targetFirIcaoCode: "ESAA",
      }),
    ).toBe(false);

    const transferredEvent = {
      owningFirIcaoCode: "EFIN",
      participatingFirIcaoCodes: ["EKDK", "EFIN"],
    } as const;
    expect(
      canManageEvent(ownerAuthorization, transferredEvent, {
        kind: "edit-content",
      }),
    ).toBe(true);
    expect(
      canManageEvent(ownerAuthorization, transferredEvent, {
        kind: "cancel-series",
      }),
    ).toBe(false);
    expect(
      canManageEvent(
        invitedOneAuthorization,
        transferredEvent,
        { kind: "cancel-series" },
      ),
    ).toBe(true);
    expect(
      canManageEvent(
        invitedOneAuthorization,
        transferredEvent,
        {
          kind: "remove-participating-fir",
          targetFirIcaoCode: "EKDK",
        },
      ),
    ).toBe(true);

    const formerOwnerRemovedEvent = {
      owningFirIcaoCode: "EFIN",
      participatingFirIcaoCodes: ["EFIN"],
    } as const;
    expect(
      canManageEvent(
        ownerAuthorization,
        formerOwnerRemovedEvent,
        { kind: "edit-content" },
      ),
    ).toBe(false);
  });

  it("derives controller access only from active usable evidence", async () => {
    const user = await database.user.create({
      data: { cid: "10000002" },
      select: { id: true },
    });
    const [bird, ekdk, efin] = await Promise.all([
      database.fir.findUniqueOrThrow({
        where: { icaoCode: "BIRD" },
        select: { id: true },
      }),
      database.fir.findUniqueOrThrow({
        where: { icaoCode: "EKDK" },
        select: { id: true },
      }),
      database.fir.findUniqueOrThrow({
        where: { icaoCode: "EFIN" },
        select: { id: true },
      }),
    ]);

    await database.firMembership.createMany({
      data: [
        {
          userId: user.id,
          firId: bird.id,
          source: "MANUAL",
          status: "ACTIVE",
          reason: "Temporary verified controller access.",
          activeSince: new Date("2026-07-25T10:00:00.000Z"),
        },
        {
          userId: user.id,
          firId: ekdk.id,
          source: "AUTOMATIC",
          status: "ACTIVE",
          sourceProvider: "control-center",
          providerFreshUntil: new Date(
            "2026-07-26T11:59:59.000Z",
          ),
          activeSince: new Date("2026-07-25T10:00:00.000Z"),
        },
        {
          userId: user.id,
          firId: efin.id,
          source: "AUTOMATIC",
          status: "ACTIVE",
          sourceProvider: "control-center",
          providerFreshUntil: new Date(
            "2026-07-26T12:30:00.000Z",
          ),
          activeSince: new Date("2026-07-25T10:00:00.000Z"),
        },
      ],
    });
    await database.controllerEligibilitySnapshot.create({
      data: {
        userId: user.id,
        provider: "VATEUD",
        rostered: true,
        fetchedAt: new Date("2026-07-26T11:00:00.000Z"),
        freshUntil: new Date("2026-07-26T12:30:00.000Z"),
      },
    });

    const authorization = await evaluateAuthorization(
      database,
      user.id,
      now,
    );

    expect(authorization).toMatchObject({
      globalCapabilityKeys: [DERIVED_CONTROLLER_CAPABILITY],
      controllerEligible: true,
      controllerFirIcaoCodes: ["BIRD", "EFIN"],
    });
    expect(hasControllerEligibility(authorization)).toBe(true);
    expect(hasControllerEligibility(authorization, "BIRD")).toBe(
      true,
    );
    expect(hasControllerEligibility(authorization, "EKDK")).toBe(
      false,
    );

    await database.controllerEligibilitySnapshot.deleteMany({
      where: { userId: user.id },
    });
    const membershipOnlyAuthorization =
      await evaluateAuthorization(database, user.id, now);

    expect(
      membershipOnlyAuthorization?.globalCapabilityKeys,
    ).not.toContain(DERIVED_CONTROLLER_CAPABILITY);
    expect(membershipOnlyAuthorization?.firCapabilities).toEqual([
      {
        firIcaoCode: "BIRD",
        capabilityKeys: [DERIVED_CONTROLLER_CAPABILITY],
      },
      {
        firIcaoCode: "EFIN",
        capabilityKeys: [DERIVED_CONTROLLER_CAPABILITY],
      },
    ]);
  });

  it("uses reusable API guards and the standard denial contract", async () => {
    const coordinator = await createCoordinator("10000002", "EKDK");
    const policy = new AuthorizationPolicy(database, () => now);
    const guard = new AuthorizationApiGuard(
      {
        async authenticateActor(token) {
          return token === sessionToken
            ? {
                id: coordinator.id,
                cid: coordinator.cid,
                displayName: "Coordinator",
              }
            : null;
        },
      },
      policy,
      sessionConfiguration,
    );
    const app = buildApp({ sessionConfiguration });
    apps.push(app);

    app.get<{ Params: { firIcaoCode: string } }>(
      "/test/manage/:firIcaoCode",
      async (request) => {
        await guard.requireFir(
          request,
          EVENTS_MANAGE_CAPABILITY,
          request.params.firIcaoCode,
        );
        return { allowed: true };
      },
    );
    app.get<{ Params: { visibility: string } }>(
      "/test/events/:visibility",
      async (request) => {
        const readable = await guard.canReadEvent(request, {
          owningFirIcaoCode: "EKDK",
          participatingFirIcaoCodes: [],
          published: request.params.visibility === "published",
        });
        if (!readable) {
          throw new ApiError(404, "NOT_FOUND", "Event not found.");
        }
        return { readable: true };
      },
    );
    app.get<{ Params: { action: string } }>(
      "/test/collaboration/:action",
      async (request) => {
        await guard.requireEvent(
          request,
          {
            owningFirIcaoCode: "EFIN",
            participatingFirIcaoCodes: ["EKDK", "EFIN"],
          },
          request.params.action === "cancel"
            ? { kind: "cancel-series" }
            : { kind: "edit-content" },
        );
        return { allowed: true };
      },
    );
    await app.ready();

    const anonymousDenial = await app.inject({
      method: "GET",
      url: "/test/manage/EKDK",
    });
    const crossFirDenial = await app.inject({
      method: "GET",
      url: "/test/manage/EFIN",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });
    const ownFir = await app.inject({
      method: "GET",
      url: "/test/manage/EKDK",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });
    const publicEvent = await app.inject({
      method: "GET",
      url: "/test/events/published",
    });
    const anonymousDraft = await app.inject({
      method: "GET",
      url: "/test/events/draft",
    });
    const invitedEdit = await app.inject({
      method: "GET",
      url: "/test/collaboration/edit",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });
    const invitedCancellation = await app.inject({
      method: "GET",
      url: "/test/collaboration/cancel",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });

    expect(anonymousDenial.statusCode).toBe(401);
    expect(Value.Check(
      ApiErrorResponseSchema,
      anonymousDenial.json(),
    )).toBe(true);
    expect(anonymousDenial.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    expect(crossFirDenial.statusCode).toBe(403);
    expect(Value.Check(
      ApiErrorResponseSchema,
      crossFirDenial.json(),
    )).toBe(true);
    expect(crossFirDenial.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(ownFir.statusCode).toBe(200);
    expect(publicEvent.statusCode).toBe(200);
    expect(anonymousDraft.statusCode).toBe(404);
    expect(anonymousDraft.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(invitedEdit.statusCode).toBe(200);
    expect(invitedCancellation.statusCode).toBe(403);
    expect(Value.Check(
      ApiErrorResponseSchema,
      invitedCancellation.json(),
    )).toBe(true);
    expect(invitedCancellation.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You cannot manage this event.",
      },
    });
  });

  it("fails closed for disabled accounts even when assignments remain", async () => {
    const coordinator = await createCoordinator("10000002", "EKDK");
    await database.user.update({
      where: { id: coordinator.id },
      data: { status: "DISABLED" },
    });

    expect(
      await evaluateAuthorization(database, coordinator.id, now),
    ).toBeNull();
  });

  it("keeps the protected Administrator role global", async () => {
    const administratorRole = await database.role.findUniqueOrThrow({
      where: { key: ADMINISTRATOR_ROLE_KEY },
      select: { scope: true },
    });

    expect(administratorRole.scope).toBe("GLOBAL");
  });
});
