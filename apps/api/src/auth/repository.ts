import type { PrismaClient } from "@event-hub/database";
import {
  GLOBAL_ROLE_SCOPE_KEY,
  PILOT_ROLE_KEY,
  Prisma,
} from "@event-hub/database";

import {
  type IdentitySessionRepository,
  type NormalizedVatsimIdentity,
  type StoredSession,
  type SynchronizedUser,
  VATSIM_IDENTITY_PROVIDER,
} from "./session-service.js";

export function createIdentitySessionRepository(
  database: PrismaClient,
): IdentitySessionRepository {
  return {
    async synchronizeVatsimIdentity(
      identity: NormalizedVatsimIdentity,
    ): Promise<SynchronizedUser> {
      return database.$transaction(async (transaction) => {
        const user = await transaction.user.upsert({
          where: { cid: identity.cid },
          update: {},
          create: { cid: identity.cid },
          select: {
            id: true,
            cid: true,
            status: true,
          },
        });
        const externalIdentity = await transaction.externalIdentity.upsert({
          where: {
            userId_provider: {
              userId: user.id,
              provider: VATSIM_IDENTITY_PROVIDER,
            },
          },
          update: {
            subject: identity.cid,
            displayName: identity.displayName,
            givenName: identity.givenName ?? null,
            familyName: identity.familyName ?? null,
            email: identity.email ?? null,
            lastSyncedAt: identity.synchronizedAt,
          },
          create: {
            provider: VATSIM_IDENTITY_PROVIDER,
            subject: identity.cid,
            displayName: identity.displayName,
            lastSyncedAt: identity.synchronizedAt,
            userId: user.id,
            ...(identity.givenName === undefined
              ? {}
              : { givenName: identity.givenName }),
            ...(identity.familyName === undefined
              ? {}
              : { familyName: identity.familyName }),
            ...(identity.email === undefined
              ? {}
              : { email: identity.email }),
          },
          select: {
            displayName: true,
          },
        });
        const pilotRole = await transaction.role.findUnique({
          where: { key: PILOT_ROLE_KEY },
          select: { id: true, scope: true },
        });

        if (pilotRole?.scope !== "GLOBAL") {
          throw new Error(
            "Authorization seed data is missing the global Pilot role.",
          );
        }

        await transaction.userRoleAssignment.upsert({
          where: {
            userId_roleId_scopeKey: {
              userId: user.id,
              roleId: pilotRole.id,
              scopeKey: GLOBAL_ROLE_SCOPE_KEY,
            },
          },
          update: {},
          create: {
            userId: user.id,
            roleId: pilotRole.id,
            scopeKey: GLOBAL_ROLE_SCOPE_KEY,
          },
        });

        return {
          ...user,
          displayName: externalIdentity.displayName,
        };
      });
    },

    async createSessionForActiveUser({
      userId,
      tokenHash,
      expiresAt,
      authenticatedAt,
    }) {
      return database.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id: userId },
            select: { status: true },
          });

          if (user?.status !== "ACTIVE") {
            return false;
          }

          await transaction.session.create({
            data: {
              tokenHash,
              expiresAt,
              userId,
            },
          });
          await transaction.user.update({
            where: { id: userId },
            data: { lastAuthenticatedAt: authenticatedAt },
          });

          return true;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    },

    async findSessionByTokenHash(tokenHash): Promise<StoredSession | null> {
      const session = await database.session.findUnique({
        where: { tokenHash },
        select: {
          expiresAt: true,
          revokedAt: true,
          user: {
            select: {
              id: true,
              cid: true,
              status: true,
              identities: {
                where: { provider: VATSIM_IDENTITY_PROVIDER },
                take: 1,
                select: { displayName: true },
              },
            },
          },
        },
      });

      if (session === null) {
        return null;
      }

      return {
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        user: {
          id: session.user.id,
          cid: session.user.cid,
          status: session.user.status,
          displayName:
            session.user.identities[0]?.displayName ?? session.user.cid,
        },
      };
    },

    async revokeSessionByTokenHash(tokenHash, revokedAt) {
      await database.session.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: { revokedAt },
      });
    },
  };
}
