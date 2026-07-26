import {
  Prisma,
  type PrismaClient,
} from "./generated/prisma/client.js";

export const GLOBAL_ROLE_SCOPE_KEY = "GLOBAL";
export const ADMINISTRATOR_ROLE_KEY = "administrator";
export const EVENT_COORDINATOR_ROLE_KEY = "event-coordinator";
export const PILOT_ROLE_KEY = "pilot";
export const SYSTEM_ADMINISTRATOR_CAPABILITY =
  "system.administrator";

const vatsimCidPattern = /^[0-9]{1,16}$/u;

export const INITIAL_CAPABILITIES = [
  {
    key: SYSTEM_ADMINISTRATOR_CAPABILITY,
    name: "System administrator",
    description:
      "Marks an active user as an effective Event Hub administrator.",
    scope: "GLOBAL_ONLY",
  },
  {
    key: "authorization.manage",
    name: "Manage authorization",
    description:
      "Manage roles, capability grants, and user role assignments.",
    scope: "GLOBAL_ONLY",
  },
  {
    key: "fir-memberships.manage",
    name: "Manage FIR memberships",
    description:
      "Manage user FIR memberships and manual controller assignments.",
    scope: "GLOBAL_ONLY",
  },
  {
    key: "events.manage",
    name: "Manage events",
    description:
      "Create and manage events within the effective assignment scope.",
    scope: "GLOBAL_OR_FIR",
  },
  {
    key: "rosters.manage",
    name: "Manage rosters",
    description:
      "Configure and manage rosters within the effective assignment scope.",
    scope: "GLOBAL_OR_FIR",
  },
  {
    key: "events.participate",
    name: "Participate in events",
    description:
      "Use authenticated pilot event-participation features.",
    scope: "GLOBAL_ONLY",
  },
] as const;

export const INITIAL_ROLES = [
  {
    key: PILOT_ROLE_KEY,
    name: "Pilot",
    description: "Default global role for every authenticated user.",
    scope: "GLOBAL",
    protected: true,
    capabilityKeys: ["events.participate"],
  },
  {
    key: EVENT_COORDINATOR_ROLE_KEY,
    name: "Event Coordinator",
    description:
      "FIR-scoped event and roster management role.",
    scope: "FIR",
    protected: true,
    capabilityKeys: ["events.manage", "rosters.manage"],
  },
  {
    key: ADMINISTRATOR_ROLE_KEY,
    name: "Administrator",
    description:
      "Protected global role for Event Hub administration.",
    scope: "GLOBAL",
    protected: true,
    capabilityKeys: INITIAL_CAPABILITIES.map(
      (capability) => capability.key,
    ),
  },
] as const;

export function parseBootstrapAdministratorCid(
  value: string | undefined,
) {
  const cid = value?.trim();

  if (cid === undefined || cid === "") {
    return undefined;
  }

  if (!vatsimCidPattern.test(cid)) {
    throw new Error(
      "BOOTSTRAP_ADMIN_CID must contain 1 to 16 digits.",
    );
  }

  return cid;
}

export async function seedAuthorizationModel(
  database: PrismaClient,
  bootstrapAdministratorCid?: string,
) {
  const cid = parseBootstrapAdministratorCid(
    bootstrapAdministratorCid,
  );

  await database.$transaction(
    async (transaction) => {
      for (const capability of INITIAL_CAPABILITIES) {
        await transaction.capability.upsert({
          where: { key: capability.key },
          update: {
            name: capability.name,
            description: capability.description,
            scope: capability.scope,
          },
          create: capability,
        });
      }

      for (const roleDefinition of INITIAL_ROLES) {
        const role = await transaction.role.upsert({
          where: { key: roleDefinition.key },
          update: {
            name: roleDefinition.name,
            description: roleDefinition.description,
            scope: roleDefinition.scope,
            protected: roleDefinition.protected,
          },
          create: {
            key: roleDefinition.key,
            name: roleDefinition.name,
            description: roleDefinition.description,
            scope: roleDefinition.scope,
            protected: roleDefinition.protected,
          },
          select: { id: true },
        });

        await transaction.roleCapability.createMany({
          data: roleDefinition.capabilityKeys.map(
            (capabilityKey) => ({
              roleId: role.id,
              capabilityKey,
            }),
          ),
          skipDuplicates: true,
        });
      }

      if (cid === undefined) {
        return;
      }

      const [user, administratorRole] = await Promise.all([
        transaction.user.upsert({
          where: { cid },
          update: {},
          create: { cid },
          select: { id: true },
        }),
        transaction.role.findUniqueOrThrow({
          where: { key: ADMINISTRATOR_ROLE_KEY },
          select: { id: true },
        }),
      ]);

      await transaction.userRoleAssignment.upsert({
        where: {
          userId_roleId_scopeKey: {
            userId: user.id,
            roleId: administratorRole.id,
            scopeKey: GLOBAL_ROLE_SCOPE_KEY,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: administratorRole.id,
          scopeKey: GLOBAL_ROLE_SCOPE_KEY,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
