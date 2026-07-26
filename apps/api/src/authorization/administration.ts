import type { PrismaClient } from "@event-hub/database";
import {
  GLOBAL_ROLE_SCOPE_KEY,
  Prisma,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "@event-hub/database";

const maximumTransactionAttempts = 4;
type UserStatus = "ACTIVE" | "DISABLED";

export class AuthorizationModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationModelError";
  }
}

export class LastAdministratorError extends AuthorizationModelError {
  constructor() {
    super("The last active administrator cannot be removed.");
    this.name = "LastAdministratorError";
  }
}

export class ProtectedAdministratorRoleError extends AuthorizationModelError {
  constructor() {
    super(
      "A protected administrator role must retain the system administrator capability.",
    );
    this.name = "ProtectedAdministratorRoleError";
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

  throw new Error("Authorization transaction retry limit exceeded.");
}

async function hasEffectiveAdministrator(
  transaction: Prisma.TransactionClient,
) {
  const administrators = await transaction.user.findMany({
    where: {
      status: "ACTIVE",
      roleAssignments: {
        some: {
          firId: null,
          role: {
            capabilities: {
              some: {
                capabilityKey: SYSTEM_ADMINISTRATOR_CAPABILITY,
              },
            },
          },
        },
      },
    },
    select: { id: true },
    take: 1,
  });

  return administrators.length > 0;
}

function uniqueCapabilityKeys(capabilityKeys: readonly string[]) {
  return [...new Set(capabilityKeys)];
}

export type RoleAssignmentRecord = Readonly<{
  id: string;
  userId: string;
  roleId: string;
  firId: string | null;
  scopeKey: string;
}>;

export type RoleCapabilityMatrix = Readonly<{
  id: string;
  key: string;
  capabilities: readonly Readonly<{
    capabilityKey: string;
  }>[];
}>;

export type UserStatusRecord = Readonly<{
  id: string;
  status: UserStatus;
}>;

export interface AuthorizationAdministration {
  assignRole(input: {
    userId: string;
    roleKey: string;
    firIcaoCode?: string;
  }): Promise<RoleAssignmentRecord>;
  revokeAssignment(assignmentId: string): Promise<boolean>;
  replaceRoleCapabilities(
    roleKey: string,
    capabilityKeys: readonly string[],
  ): Promise<RoleCapabilityMatrix>;
  setUserStatus(
    userId: string,
    status: UserStatus,
  ): Promise<UserStatusRecord>;
}

export function createAuthorizationAdministration(
  database: PrismaClient,
): AuthorizationAdministration {
  return {
    async assignRole(input: {
      userId: string;
      roleKey: string;
      firIcaoCode?: string;
    }) {
      return serializableTransaction(database, async (transaction) => {
        const role = await transaction.role.findUnique({
          where: { key: input.roleKey },
          select: { id: true, scope: true },
        });

        if (role === null) {
          throw new AuthorizationModelError("Role not found.");
        }

        if (role.scope === "GLOBAL" && input.firIcaoCode !== undefined) {
          throw new AuthorizationModelError(
            "Global roles cannot have FIR scope.",
          );
        }

        if (role.scope === "FIR" && input.firIcaoCode === undefined) {
          throw new AuthorizationModelError(
            "FIR-scoped roles require a FIR.",
          );
        }

        const fir =
          input.firIcaoCode === undefined
            ? null
            : await transaction.fir.findUnique({
                where: { icaoCode: input.firIcaoCode },
                select: { id: true },
              });

        if (input.firIcaoCode !== undefined && fir === null) {
          throw new AuthorizationModelError("FIR not found.");
        }

        const scopeKey = fir?.id ?? GLOBAL_ROLE_SCOPE_KEY;

        return transaction.userRoleAssignment.upsert({
          where: {
            userId_roleId_scopeKey: {
              userId: input.userId,
              roleId: role.id,
              scopeKey,
            },
          },
          update: {},
          create: {
            userId: input.userId,
            roleId: role.id,
            scopeKey,
            ...(fir === null ? {} : { firId: fir.id }),
          },
        });
      });
    },

    async revokeAssignment(assignmentId: string) {
      return serializableTransaction(database, async (transaction) => {
        const assignment =
          await transaction.userRoleAssignment.findUnique({
            where: { id: assignmentId },
            select: {
              id: true,
              firId: true,
              user: { select: { status: true } },
              role: {
                select: {
                  capabilities: {
                    where: {
                      capabilityKey:
                        SYSTEM_ADMINISTRATOR_CAPABILITY,
                    },
                    select: { capabilityKey: true },
                  },
                },
              },
            },
          });

        if (assignment === null) {
          return false;
        }

        const removesAdministrator =
          assignment.firId === null &&
          assignment.user.status === "ACTIVE" &&
          assignment.role.capabilities.length > 0;

        await transaction.userRoleAssignment.delete({
          where: { id: assignment.id },
        });

        if (
          removesAdministrator &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        return true;
      });
    },

    async replaceRoleCapabilities(
      roleKey: string,
      capabilityKeys: readonly string[],
    ) {
      const requestedKeys = uniqueCapabilityKeys(capabilityKeys);

      return serializableTransaction(database, async (transaction) => {
        const role = await transaction.role.findUnique({
          where: { key: roleKey },
          select: {
            id: true,
            scope: true,
            protected: true,
            capabilities: {
              select: { capabilityKey: true },
            },
          },
        });

        if (role === null) {
          throw new AuthorizationModelError("Role not found.");
        }

        const capabilities = await transaction.capability.findMany({
          where: { key: { in: requestedKeys } },
          select: { key: true, scope: true },
        });

        if (capabilities.length !== requestedKeys.length) {
          throw new AuthorizationModelError(
            "One or more capabilities were not found.",
          );
        }

        if (
          role.scope === "FIR" &&
          capabilities.some(
            (capability) => capability.scope === "GLOBAL_ONLY",
          )
        ) {
          throw new AuthorizationModelError(
            "FIR roles cannot receive global-only capabilities.",
          );
        }

        const previouslyAdministrative = role.capabilities.some(
          (grant) =>
            grant.capabilityKey ===
            SYSTEM_ADMINISTRATOR_CAPABILITY,
        );
        const remainsAdministrative = requestedKeys.includes(
          SYSTEM_ADMINISTRATOR_CAPABILITY,
        );

        if (
          role.protected &&
          previouslyAdministrative &&
          !remainsAdministrative
        ) {
          throw new ProtectedAdministratorRoleError();
        }

        await transaction.roleCapability.deleteMany({
          where: { roleId: role.id },
        });
        await transaction.roleCapability.createMany({
          data: requestedKeys.map((capabilityKey) => ({
            roleId: role.id,
            capabilityKey,
          })),
        });

        if (
          previouslyAdministrative &&
          !remainsAdministrative &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        return transaction.role.findUniqueOrThrow({
          where: { id: role.id },
          include: { capabilities: true },
        });
      });
    },

    async setUserStatus(userId: string, status: UserStatus) {
      return serializableTransaction(database, async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            status: true,
            roleAssignments: {
              where: {
                firId: null,
                role: {
                  capabilities: {
                    some: {
                      capabilityKey:
                        SYSTEM_ADMINISTRATOR_CAPABILITY,
                    },
                  },
                },
              },
              select: { id: true },
            },
          },
        });

        if (user === null) {
          throw new AuthorizationModelError("User not found.");
        }

        const disablesAdministrator =
          user.status === "ACTIVE" &&
          status === "DISABLED" &&
          user.roleAssignments.length > 0;

        const updated = await transaction.user.update({
          where: { id: userId },
          data: { status },
        });

        if (
          disablesAdministrator &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        return updated;
      });
    },
  };
}
