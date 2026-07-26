import type {
  FirMembership,
  FirMembershipOverview,
  FirMembershipUser,
} from "@event-hub/contracts";
import type { PrismaClient } from "@event-hub/database";
import {
  FIR_MEMBERSHIPS_MANAGE_CAPABILITY,
  Prisma,
} from "@event-hub/database";

const maximumTransactionAttempts = 4;
const vatsimIdentityProvider = "vatsim";

export class FirMembershipModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirMembershipModelError";
  }
}

export class FirMembershipDeniedError extends FirMembershipModelError {
  constructor() {
    super("FIR membership management permission is required.");
    this.name = "FirMembershipDeniedError";
  }
}

export class FirMembershipNotFoundError extends FirMembershipModelError {
  constructor(message: string) {
    super(message);
    this.name = "FirMembershipNotFoundError";
  }
}

async function serializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maximumTransactionAttempts;
    attempt += 1
  ) {
    try {
      return await database.$transaction(operation, {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (!retryable || attempt === maximumTransactionAttempts) {
        throw error;
      }
    }
  }

  throw new Error("FIR membership transaction retry limit exceeded.");
}

async function assertMembershipManager(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
) {
  const actor = await transaction.user.findFirst({
    where: {
      id: actorUserId,
      status: "ACTIVE",
      roleAssignments: {
        some: {
          firId: null,
          role: {
            capabilities: {
              some: {
                capabilityKey: FIR_MEMBERSHIPS_MANAGE_CAPABILITY,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (actor === null) {
    throw new FirMembershipDeniedError();
  }
}

function displayName(
  user: Readonly<{
    cid: string;
    identities: readonly Readonly<{ displayName: string }>[];
  }>,
) {
  return user.identities[0]?.displayName ?? user.cid;
}

function membershipSource(source: "AUTOMATIC" | "MANUAL") {
  return source === "AUTOMATIC" ? "automatic" : "manual";
}

function membershipStatus(status: "ACTIVE" | "REVOKED") {
  return status === "ACTIVE" ? "active" : "revoked";
}

type MembershipRecord = Readonly<{
  id: string;
  source: "AUTOMATIC" | "MANUAL";
  status: "ACTIVE" | "REVOKED";
  sourceProvider: string | null;
  providerFreshUntil: Date | null;
  reason: string | null;
  activeSince: Date;
  revokedAt: Date | null;
  updatedAt: Date;
  fir: Readonly<{
    icaoCode: string;
    name: string;
    active: boolean;
  }>;
  changedBy: Readonly<{
    cid: string;
    identities: readonly Readonly<{ displayName: string }>[];
  }> | null;
}>;

function mapMembership(membership: MembershipRecord): FirMembership {
  return {
    id: membership.id,
    fir: membership.fir,
    source: membershipSource(membership.source),
    status: membershipStatus(membership.status),
    sourceProvider: membership.sourceProvider,
    providerFreshUntil:
      membership.providerFreshUntil?.toISOString() ?? null,
    reason: membership.reason,
    changedBy:
      membership.changedBy === null
        ? null
        : {
            cid: membership.changedBy.cid,
            displayName: displayName(membership.changedBy),
          },
    activeSince: membership.activeSince.toISOString(),
    revokedAt: membership.revokedAt?.toISOString() ?? null,
    updatedAt: membership.updatedAt.toISOString(),
  };
}

function membershipState(membership: FirMembership) {
  return {
    firIcaoCode: membership.fir.icaoCode,
    source: membership.source,
    status: membership.status,
    sourceProvider: membership.sourceProvider,
    providerFreshUntil: membership.providerFreshUntil,
    reason: membership.reason,
    changedByCid: membership.changedBy?.cid ?? null,
    activeSince: membership.activeSince,
    revokedAt: membership.revokedAt,
  };
}

function mapUser(
  user: Readonly<{
    id: string;
    cid: string;
    status: "ACTIVE" | "DISABLED";
    identities: readonly Readonly<{ displayName: string }>[];
    firMemberships: readonly MembershipRecord[];
  }>,
): FirMembershipUser {
  return {
    id: user.id,
    cid: user.cid,
    displayName: displayName(user),
    status: user.status === "ACTIVE" ? "active" : "disabled",
    memberships: user.firMemberships.map(mapMembership),
  };
}

const membershipSelection = {
  id: true,
  source: true,
  status: true,
  sourceProvider: true,
  providerFreshUntil: true,
  reason: true,
  activeSince: true,
  revokedAt: true,
  updatedAt: true,
  fir: {
    select: {
      icaoCode: true,
      name: true,
      active: true,
    },
  },
  changedBy: {
    select: {
      cid: true,
      identities: {
        where: { provider: vatsimIdentityProvider },
        take: 1,
        select: { displayName: true },
      },
    },
  },
} as const;

function normalizedReason(reason: string) {
  const value = reason.trim();

  if (value.length < 3) {
    throw new FirMembershipModelError(
      "A manual FIR membership reason must contain at least 3 characters.",
    );
  }

  if (value.length > 500) {
    throw new FirMembershipModelError(
      "A manual FIR membership reason must contain at most 500 characters.",
    );
  }

  return value;
}

export interface FirMembershipAdministration {
  getOverview(actorUserId: string): Promise<FirMembershipOverview>;
  listUsers(
    actorUserId: string,
    input: {
      query?: string;
      afterCid?: string;
      limit: number;
    },
  ): Promise<{
    items: FirMembershipUser[];
    hasNextPage: boolean;
  }>;
  assignManual(
    actorUserId: string,
    input: {
      userId: string;
      firIcaoCode: string;
      reason: string;
    },
  ): Promise<FirMembership>;
  revokeManual(
    actorUserId: string,
    input: {
      userId: string;
      firIcaoCode: string;
      reason: string;
    },
  ): Promise<FirMembership>;
}

export function createFirMembershipAdministration(
  database: PrismaClient,
): FirMembershipAdministration {
  return {
    async getOverview(actorUserId) {
      return database.$transaction(async (transaction) => {
        await assertMembershipManager(transaction, actorUserId);

        const [firs, recentAuditRecords] = await Promise.all([
          transaction.fir.findMany({
            select: {
              icaoCode: true,
              name: true,
              active: true,
            },
            orderBy: { icaoCode: "asc" },
          }),
          transaction.authorizationAuditRecord.findMany({
            where: { targetKind: "fir-membership" },
            include: {
              actor: {
                select: {
                  cid: true,
                  identities: {
                    where: { provider: vatsimIdentityProvider },
                    take: 1,
                    select: { displayName: true },
                  },
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 25,
          }),
        ]);

        return {
          firs,
          recentAuditRecords: recentAuditRecords.map((record) => ({
            id: record.id,
            action: record.action,
            actor: {
              cid: record.actor.cid,
              displayName: displayName(record.actor),
            },
            targetKind: record.targetKind,
            targetKey: record.targetKey,
            summary: record.summary,
            createdAt: record.createdAt.toISOString(),
          })),
        };
      });
    },

    async listUsers(actorUserId, input) {
      return database.$transaction(async (transaction) => {
        await assertMembershipManager(transaction, actorUserId);

        const normalizedQuery = input.query?.trim();
        const userWhere: Prisma.UserWhereInput | undefined =
          normalizedQuery === undefined || normalizedQuery === ""
            ? undefined
            : {
                OR: [
                  { cid: { contains: normalizedQuery } },
                  {
                    identities: {
                      some: {
                        provider: vatsimIdentityProvider,
                        displayName: { contains: normalizedQuery },
                      },
                    },
                  },
                ],
              };
        const users = await transaction.user.findMany({
          ...(userWhere === undefined ? {} : { where: userWhere }),
          ...(input.afterCid === undefined
            ? {}
            : {
                cursor: { cid: input.afterCid },
                skip: 1,
              }),
          take: input.limit + 1,
          orderBy: { cid: "asc" },
          select: {
            id: true,
            cid: true,
            status: true,
            identities: {
              where: { provider: vatsimIdentityProvider },
              take: 1,
              select: { displayName: true },
            },
            firMemberships: {
              orderBy: { fir: { icaoCode: "asc" } },
              select: membershipSelection,
            },
          },
        });

        return {
          items: users.slice(0, input.limit).map(mapUser),
          hasNextPage: users.length > input.limit,
        };
      });
    },

    async assignManual(actorUserId, input) {
      const reason = normalizedReason(input.reason);

      return serializableTransaction(database, async (transaction) => {
        await assertMembershipManager(transaction, actorUserId);

        const [user, fir] = await Promise.all([
          transaction.user.findUnique({
            where: { id: input.userId },
            select: { id: true, cid: true },
          }),
          transaction.fir.findUnique({
            where: { icaoCode: input.firIcaoCode },
            select: { id: true, icaoCode: true, name: true, active: true },
          }),
        ]);

        if (user === null) {
          throw new FirMembershipNotFoundError("User not found.");
        }

        if (fir === null) {
          throw new FirMembershipNotFoundError("FIR not found.");
        }

        if (!fir.active) {
          throw new FirMembershipModelError(
            "Manual membership requires an active FIR.",
          );
        }

        const existing = await transaction.firMembership.findUnique({
          where: {
            userId_firId: {
              userId: user.id,
              firId: fir.id,
            },
          },
          select: membershipSelection,
        });

        if (
          existing !== null &&
          existing.status === "ACTIVE" &&
          existing.source === "MANUAL"
        ) {
          return mapMembership(existing);
        }

        const changedAt = new Date();
        const membership = await transaction.firMembership.upsert({
          where: {
            userId_firId: {
              userId: user.id,
              firId: fir.id,
            },
          },
          update: {
            source: "MANUAL",
            status: "ACTIVE",
            sourceProvider: null,
            providerFreshUntil: null,
            reason,
            changedByUserId: actorUserId,
            activeSince: changedAt,
            revokedAt: null,
          },
          create: {
            userId: user.id,
            firId: fir.id,
            source: "MANUAL",
            status: "ACTIVE",
            sourceProvider: null,
            providerFreshUntil: null,
            reason,
            changedByUserId: actorUserId,
            activeSince: changedAt,
          },
          select: membershipSelection,
        });
        const mapped = mapMembership(membership);
        const action =
          existing === null
            ? "fir-membership.assigned"
            : existing.status === "REVOKED"
              ? "fir-membership.reactivated"
              : "fir-membership.overridden";

        await transaction.authorizationAuditRecord.create({
          data: {
            actorUserId,
            action,
            targetKind: "fir-membership",
            targetKey: `${user.cid}:${fir.icaoCode}`,
            summary: `Granted CID ${user.cid} membership in ${fir.icaoCode}: ${reason}`,
            ...(existing === null
              ? {}
              : { beforeState: membershipState(mapMembership(existing)) }),
            afterState: membershipState(mapped),
          },
        });

        return mapped;
      });
    },

    async revokeManual(actorUserId, input) {
      const reason = normalizedReason(input.reason);

      return serializableTransaction(database, async (transaction) => {
        await assertMembershipManager(transaction, actorUserId);

        const fir = await transaction.fir.findUnique({
          where: { icaoCode: input.firIcaoCode },
          select: { id: true, icaoCode: true },
        });

        if (fir === null) {
          throw new FirMembershipNotFoundError("FIR not found.");
        }

        const existing = await transaction.firMembership.findUnique({
          where: {
            userId_firId: {
              userId: input.userId,
              firId: fir.id,
            },
          },
          select: {
            ...membershipSelection,
            user: { select: { cid: true } },
          },
        });

        if (existing === null) {
          throw new FirMembershipNotFoundError(
            "FIR membership not found.",
          );
        }

        if (
          existing.status === "REVOKED" &&
          existing.source === "MANUAL"
        ) {
          return mapMembership(existing);
        }

        const beforeState = membershipState(mapMembership(existing));
        const membership = await transaction.firMembership.update({
          where: { id: existing.id },
          data: {
            source: "MANUAL",
            status: "REVOKED",
            sourceProvider: null,
            providerFreshUntil: null,
            reason,
            changedByUserId: actorUserId,
            revokedAt: new Date(),
          },
          select: membershipSelection,
        });
        const mapped = mapMembership(membership);

        await transaction.authorizationAuditRecord.create({
          data: {
            actorUserId,
            action: "fir-membership.revoked",
            targetKind: "fir-membership",
            targetKey: `${existing.user.cid}:${fir.icaoCode}`,
            summary: `Revoked CID ${existing.user.cid} membership in ${fir.icaoCode}: ${reason}`,
            beforeState,
            afterState: membershipState(mapped),
          },
        });

        return mapped;
      });
    },
  };
}
