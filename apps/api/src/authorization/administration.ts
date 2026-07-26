import type {
  AuthorizationAssignment,
  AuthorizationOverview,
  AuthorizationRole,
  AuthorizationRoleScope,
  AuthorizationUser,
  CreateAuthorizationRole,
  UpdateAuthorizationRole,
} from "@event-hub/contracts";
import type { PrismaClient } from "@event-hub/database";
import {
  AUTHORIZATION_MANAGE_CAPABILITY,
  GLOBAL_ROLE_SCOPE_KEY,
  Prisma,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "@event-hub/database";

const maximumTransactionAttempts = 4;
const vatsimIdentityProvider = "vatsim";
const protectedAdministratorCapabilities = [
  SYSTEM_ADMINISTRATOR_CAPABILITY,
  AUTHORIZATION_MANAGE_CAPABILITY,
] as const;
type UserStatus = "ACTIVE" | "DISABLED";

export class AuthorizationModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationModelError";
  }
}

export class AuthorizationDeniedError extends AuthorizationModelError {
  constructor() {
    super("Authorization management permission is required.");
    this.name = "AuthorizationDeniedError";
  }
}

export class AuthorizationNotFoundError extends AuthorizationModelError {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationNotFoundError";
  }
}

export class AuthorizationConflictError extends AuthorizationModelError {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationConflictError";
  }
}

export class LastAdministratorError extends AuthorizationConflictError {
  constructor() {
    super("The last active administrator cannot be removed.");
    this.name = "LastAdministratorError";
  }
}

export class ProtectedAdministratorRoleError extends AuthorizationConflictError {
  constructor() {
    super(
      "A protected administrator role must retain its administrator management capabilities.",
    );
    this.name = "ProtectedAdministratorRoleError";
  }
}

export class ProtectedRoleError extends AuthorizationConflictError {
  constructor() {
    super("Protected roles cannot be deleted.");
    this.name = "ProtectedRoleError";
  }
}

export class RoleInUseError extends AuthorizationConflictError {
  constructor() {
    super("A role with active assignments cannot be deleted.");
    this.name = "RoleInUseError";
  }
}

export class RoleAlreadyExistsError extends AuthorizationConflictError {
  constructor() {
    super("A role with this key already exists.");
    this.name = "RoleAlreadyExistsError";
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

async function assertAuthorizationManager(
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
                capabilityKey: AUTHORIZATION_MANAGE_CAPABILITY,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (actor === null) {
    throw new AuthorizationDeniedError();
  }
}

async function hasEffectiveAdministrator(
  transaction: Prisma.TransactionClient,
) {
  const administrator = await transaction.user.findFirst({
    where: {
      status: "ACTIVE",
      AND: protectedAdministratorCapabilities.map((capabilityKey) => ({
        roleAssignments: {
          some: {
            firId: null,
            role: {
              capabilities: {
                some: {
                  capabilityKey,
                },
              },
            },
          },
        },
      })),
    },
    select: { id: true },
  });

  return administrator !== null;
}

function uniqueSortedCapabilityKeys(
  capabilityKeys: readonly string[],
) {
  return [...new Set(capabilityKeys)].sort();
}

function roleScope(scope: "GLOBAL" | "FIR"): AuthorizationRoleScope {
  return scope === "GLOBAL" ? "global" : "fir";
}

function capabilityState(
  role: Readonly<{
    key: string;
    name: string;
    description: string;
    scope: "GLOBAL" | "FIR";
    protected: boolean;
    capabilities: readonly Readonly<{
      capabilityKey: string;
    }>[];
  }>,
) {
  return {
    key: role.key,
    name: role.name,
    description: role.description,
    scope: roleScope(role.scope),
    protected: role.protected,
    capabilityKeys: uniqueSortedCapabilityKeys(
      role.capabilities.map((grant) => grant.capabilityKey),
    ),
  };
}

function mapRole(
  role: Readonly<{
    key: string;
    name: string;
    description: string;
    scope: "GLOBAL" | "FIR";
    protected: boolean;
    capabilities: readonly Readonly<{
      capabilityKey: string;
    }>[];
    _count: Readonly<{ assignments: number }>;
  }>,
): AuthorizationRole {
  return {
    ...capabilityState(role),
    assignmentCount: role._count.assignments,
  };
}

function mapAssignment(
  assignment: Readonly<{
    id: string;
    createdAt: Date;
    role: Readonly<{
      key: string;
      name: string;
      scope: "GLOBAL" | "FIR";
    }>;
    fir: Readonly<{
      icaoCode: string;
      name: string;
      active: boolean;
    }> | null;
  }>,
): AuthorizationAssignment {
  return {
    id: assignment.id,
    roleKey: assignment.role.key,
    roleName: assignment.role.name,
    roleScope: roleScope(assignment.role.scope),
    fir:
      assignment.fir === null
        ? null
        : {
            icaoCode: assignment.fir.icaoCode,
            name: assignment.fir.name,
            active: assignment.fir.active,
          },
    createdAt: assignment.createdAt.toISOString(),
  };
}

function effectiveCapabilities(
  assignments: readonly Readonly<{
    fir: Readonly<{ icaoCode: string }> | null;
    role: Readonly<{
      capabilities: readonly Readonly<{
        capabilityKey: string;
      }>[];
    }>;
  }>[],
) {
  const capabilities = new Map<
    string,
    { global: boolean; firIcaoCodes: Set<string> }
  >();

  for (const assignment of assignments) {
    for (const grant of assignment.role.capabilities) {
      const effective = capabilities.get(grant.capabilityKey) ?? {
        global: false,
        firIcaoCodes: new Set<string>(),
      };

      if (assignment.fir === null) {
        effective.global = true;
      } else if (!effective.global) {
        effective.firIcaoCodes.add(assignment.fir.icaoCode);
      }

      capabilities.set(grant.capabilityKey, effective);
    }
  }

  return [...capabilities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capabilityKey, effective]) => ({
      capabilityKey,
      global: effective.global,
      firIcaoCodes: effective.global
        ? []
        : [...effective.firIcaoCodes].sort(),
    }));
}

function displayName(
  user: Readonly<{
    cid: string;
    identities: readonly Readonly<{ displayName: string }>[];
  }>,
) {
  return user.identities[0]?.displayName ?? user.cid;
}

function mapUser(
  user: Readonly<{
    id: string;
    cid: string;
    status: "ACTIVE" | "DISABLED";
    identities: readonly Readonly<{ displayName: string }>[];
    roleAssignments: readonly Readonly<{
      id: string;
      createdAt: Date;
      fir: Readonly<{
        icaoCode: string;
        name: string;
        active: boolean;
      }> | null;
      role: Readonly<{
        key: string;
        name: string;
        scope: "GLOBAL" | "FIR";
        capabilities: readonly Readonly<{
          capabilityKey: string;
        }>[];
      }>;
    }>[];
  }>,
): AuthorizationUser {
  return {
    id: user.id,
    cid: user.cid,
    displayName: displayName(user),
    status: user.status === "ACTIVE" ? "active" : "disabled",
    assignments: user.roleAssignments.map(mapAssignment),
    effectiveCapabilities: effectiveCapabilities(user.roleAssignments),
  };
}

type AuditInput = Readonly<{
  actorUserId: string;
  action: string;
  targetKind: string;
  targetKey: string;
  summary: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
}>;

async function createAuditRecord(
  transaction: Prisma.TransactionClient,
  input: AuditInput,
) {
  await transaction.authorizationAuditRecord.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetKind: input.targetKind,
      targetKey: input.targetKey,
      summary: input.summary,
      ...(input.beforeState === undefined
        ? {}
        : { beforeState: input.beforeState }),
      ...(input.afterState === undefined
        ? {}
        : { afterState: input.afterState }),
    },
  });
}

async function validatedCapabilities(
  transaction: Prisma.TransactionClient,
  scope: "GLOBAL" | "FIR",
  capabilityKeys: readonly string[],
) {
  const requestedKeys = uniqueSortedCapabilityKeys(capabilityKeys);
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
    scope === "FIR" &&
    capabilities.some(
      (capability) => capability.scope === "GLOBAL_ONLY",
    )
  ) {
    throw new AuthorizationModelError(
      "FIR roles cannot receive global-only capabilities.",
    );
  }

  return requestedKeys;
}

async function roleWithCapabilities(
  transaction: Prisma.TransactionClient,
  roleId: string,
) {
  return transaction.role.findUniqueOrThrow({
    where: { id: roleId },
    include: {
      capabilities: true,
      _count: { select: { assignments: true } },
    },
  });
}

export interface AuthorizationAdministration {
  getOverview(actorUserId: string): Promise<AuthorizationOverview>;
  listUsers(
    actorUserId: string,
    input: {
      query?: string;
      afterCid?: string;
      limit: number;
    },
  ): Promise<{
    items: AuthorizationUser[];
    hasNextPage: boolean;
  }>;
  createRole(
    actorUserId: string,
    input: CreateAuthorizationRole,
  ): Promise<AuthorizationRole>;
  updateRole(
    actorUserId: string,
    roleKey: string,
    input: UpdateAuthorizationRole,
  ): Promise<AuthorizationRole>;
  deleteRole(actorUserId: string, roleKey: string): Promise<boolean>;
  assignRole(
    actorUserId: string,
    input: {
      userId: string;
      roleKey: string;
      firIcaoCode?: string;
    },
  ): Promise<AuthorizationAssignment>;
  revokeAssignment(
    actorUserId: string,
    assignmentId: string,
  ): Promise<boolean>;
  setUserStatus(
    actorUserId: string,
    userId: string,
    status: UserStatus,
  ): Promise<Readonly<{ id: string; status: UserStatus }>>;
}

export function createAuthorizationAdministration(
  database: PrismaClient,
): AuthorizationAdministration {
  return {
    async getOverview(actorUserId) {
      return database.$transaction(async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const [capabilities, roles, firs, recentAuditRecords] =
          await Promise.all([
            transaction.capability.findMany({
              orderBy: { key: "asc" },
            }),
            transaction.role.findMany({
              include: {
                capabilities: true,
                _count: { select: { assignments: true } },
              },
              orderBy: [{ protected: "desc" }, { name: "asc" }],
            }),
            transaction.fir.findMany({
              select: {
                icaoCode: true,
                name: true,
                active: true,
              },
              orderBy: { icaoCode: "asc" },
            }),
            transaction.authorizationAuditRecord.findMany({
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
          capabilities: capabilities.map((capability) => ({
            key: capability.key,
            name: capability.name,
            description: capability.description,
            scope:
              capability.scope === "GLOBAL_ONLY"
                ? "global"
                : "global-or-fir",
          })),
          roles: roles.map(mapRole),
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
        await assertAuthorizationManager(transaction, actorUserId);

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
            roleAssignments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                createdAt: true,
                fir: {
                  select: {
                    icaoCode: true,
                    name: true,
                    active: true,
                  },
                },
                role: {
                  select: {
                    key: true,
                    name: true,
                    scope: true,
                    capabilities: {
                      select: { capabilityKey: true },
                    },
                  },
                },
              },
            },
          },
        });
        const hasNextPage = users.length > input.limit;

        return {
          items: users.slice(0, input.limit).map(mapUser),
          hasNextPage,
        };
      });
    },

    async createRole(actorUserId, input) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const existing = await transaction.role.findUnique({
          where: { key: input.key },
          select: { id: true },
        });

        if (existing !== null) {
          throw new RoleAlreadyExistsError();
        }

        const scope = input.scope === "global" ? "GLOBAL" : "FIR";
        const capabilityKeys = await validatedCapabilities(
          transaction,
          scope,
          input.capabilityKeys,
        );
        const name = input.name.trim();
        const description = input.description.trim();

        if (name === "" || description === "") {
          throw new AuthorizationModelError(
            "Role name and description are required.",
          );
        }

        const role = await transaction.role.create({
          data: {
            key: input.key,
            name,
            description,
            scope,
            capabilities: {
              createMany: {
                data: capabilityKeys.map((capabilityKey) => ({
                  capabilityKey,
                })),
              },
            },
          },
          include: {
            capabilities: true,
            _count: { select: { assignments: true } },
          },
        });
        const afterState = capabilityState(role);

        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.role.created",
          targetKind: "role",
          targetKey: role.key,
          summary: `Created role ${role.name}.`,
          afterState,
        });

        return mapRole(role);
      });
    },

    async updateRole(actorUserId, roleKey, input) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const role = await transaction.role.findUnique({
          where: { key: roleKey },
          include: {
            capabilities: true,
            _count: { select: { assignments: true } },
          },
        });

        if (role === null) {
          throw new AuthorizationNotFoundError("Role not found.");
        }

        const capabilityKeys = await validatedCapabilities(
          transaction,
          role.scope,
          input.capabilityKeys,
        );
        const name = input.name.trim();
        const description = input.description.trim();

        if (name === "" || description === "") {
          throw new AuthorizationModelError(
            "Role name and description are required.",
          );
        }

        const beforeState = capabilityState(role);
        const removedProtectedCapabilities =
          protectedAdministratorCapabilities.filter(
            (capabilityKey) =>
              beforeState.capabilityKeys.includes(capabilityKey) &&
              !capabilityKeys.includes(capabilityKey),
          );
        const administratorPathChanged =
          removedProtectedCapabilities.length > 0;

        if (role.protected && administratorPathChanged) {
          throw new ProtectedAdministratorRoleError();
        }

        const capabilityChanged =
          beforeState.capabilityKeys.length !== capabilityKeys.length ||
          beforeState.capabilityKeys.some(
            (key, index) => key !== capabilityKeys[index],
          );
        const metadataChanged =
          role.name !== name || role.description !== description;

        if (!capabilityChanged && !metadataChanged) {
          return mapRole(role);
        }

        if (metadataChanged) {
          await transaction.role.update({
            where: { id: role.id },
            data: { name, description },
          });
        }

        if (capabilityChanged) {
          await transaction.roleCapability.deleteMany({
            where: { roleId: role.id },
          });
          await transaction.roleCapability.createMany({
            data: capabilityKeys.map((capabilityKey) => ({
              roleId: role.id,
              capabilityKey,
            })),
          });
        }

        if (
          administratorPathChanged &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        const updated = await roleWithCapabilities(transaction, role.id);
        const afterState = capabilityState(updated);

        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.role.updated",
          targetKind: "role",
          targetKey: updated.key,
          summary: `Updated role ${updated.name}.`,
          beforeState,
          afterState,
        });

        return mapRole(updated);
      });
    },

    async deleteRole(actorUserId, roleKey) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const role = await transaction.role.findUnique({
          where: { key: roleKey },
          include: {
            capabilities: true,
            _count: { select: { assignments: true } },
          },
        });

        if (role === null) {
          return false;
        }

        if (role.protected) {
          throw new ProtectedRoleError();
        }

        if (role._count.assignments > 0) {
          throw new RoleInUseError();
        }

        const beforeState = capabilityState(role);
        await transaction.role.delete({ where: { id: role.id } });
        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.role.deleted",
          targetKind: "role",
          targetKey: role.key,
          summary: `Deleted role ${role.name}.`,
          beforeState,
        });

        return true;
      });
    },

    async assignRole(actorUserId, input) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const [role, user] = await Promise.all([
          transaction.role.findUnique({
            where: { key: input.roleKey },
            select: { id: true, key: true, name: true, scope: true },
          }),
          transaction.user.findUnique({
            where: { id: input.userId },
            select: { id: true, cid: true },
          }),
        ]);

        if (role === null) {
          throw new AuthorizationNotFoundError("Role not found.");
        }

        if (user === null) {
          throw new AuthorizationNotFoundError("User not found.");
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
                select: {
                  id: true,
                  icaoCode: true,
                  name: true,
                  active: true,
                },
              });

        if (input.firIcaoCode !== undefined && fir === null) {
          throw new AuthorizationNotFoundError("FIR not found.");
        }

        if (fir !== null && !fir.active) {
          throw new AuthorizationModelError(
            "Role assignments require an active FIR.",
          );
        }

        const scopeKey = fir?.id ?? GLOBAL_ROLE_SCOPE_KEY;
        const existing =
          await transaction.userRoleAssignment.findUnique({
            where: {
              userId_roleId_scopeKey: {
                userId: user.id,
                roleId: role.id,
                scopeKey,
              },
            },
            select: {
              id: true,
              createdAt: true,
            },
          });

        if (existing !== null) {
          return mapAssignment({
            ...existing,
            role,
            fir,
          });
        }

        const assignment = await transaction.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: role.id,
            scopeKey,
            ...(fir === null ? {} : { firId: fir.id }),
          },
          select: {
            id: true,
            createdAt: true,
          },
        });
        const mapped = mapAssignment({
          ...assignment,
          role,
          fir,
        });

        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.assignment.created",
          targetKind: "user",
          targetKey: user.cid,
          summary: `Assigned ${role.name} to CID ${user.cid}${fir === null ? "" : ` for ${fir.icaoCode}`}.`,
          afterState: mapped,
        });

        return mapped;
      });
    },

    async revokeAssignment(actorUserId, assignmentId) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const assignment =
          await transaction.userRoleAssignment.findUnique({
            where: { id: assignmentId },
            select: {
              id: true,
              createdAt: true,
              fir: {
                select: {
                  icaoCode: true,
                  name: true,
                  active: true,
                },
              },
              user: {
                select: {
                  cid: true,
                  status: true,
                },
              },
              role: {
                select: {
                  key: true,
                  name: true,
                  scope: true,
                },
              },
            },
          });

        if (assignment === null) {
          return false;
        }

        const canReduceAdministratorPath =
          assignment.fir === null &&
          assignment.user.status === "ACTIVE";
        const beforeState = mapAssignment(assignment);

        await transaction.userRoleAssignment.delete({
          where: { id: assignment.id },
        });

        if (
          canReduceAdministratorPath &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.assignment.revoked",
          targetKind: "user",
          targetKey: assignment.user.cid,
          summary: `Revoked ${assignment.role.name} from CID ${assignment.user.cid}${assignment.fir === null ? "" : ` for ${assignment.fir.icaoCode}`}.`,
          beforeState,
        });

        return true;
      });
    },

    async setUserStatus(actorUserId, userId, status) {
      return serializableTransaction(database, async (transaction) => {
        await assertAuthorizationManager(transaction, actorUserId);

        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            cid: true,
            status: true,
          },
        });

        if (user === null) {
          throw new AuthorizationNotFoundError("User not found.");
        }

        if (user.status === status) {
          return { id: userId, status };
        }

        const disablesAdministrator =
          user.status === "ACTIVE" && status === "DISABLED";
        const updated = await transaction.user.update({
          where: { id: userId },
          data: { status },
          select: { id: true, status: true },
        });

        if (
          disablesAdministrator &&
          !(await hasEffectiveAdministrator(transaction))
        ) {
          throw new LastAdministratorError();
        }

        await createAuditRecord(transaction, {
          actorUserId,
          action: "authorization.user.status-updated",
          targetKind: "user",
          targetKey: user.cid,
          summary: `Changed CID ${user.cid} status to ${status.toLowerCase()}.`,
          beforeState: { status: user.status },
          afterState: { status },
        });

        return updated;
      });
    },
  };
}
