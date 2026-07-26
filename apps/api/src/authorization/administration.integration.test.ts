import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ADMINISTRATOR_ROLE_KEY,
  createDatabaseClient,
  EVENT_COORDINATOR_ROLE_KEY,
  GLOBAL_ROLE_SCOPE_KEY,
  INITIAL_CAPABILITIES,
  PILOT_ROLE_KEY,
  seedAuthorizationModel,
  seedReferenceData,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { createIdentitySessionRepository } from "../auth/repository.js";
import { SessionService } from "../auth/session-service.js";
import {
  AuthorizationDeniedError,
  AuthorizationModelError,
  createAuthorizationAdministration,
  LastAdministratorError,
  ProtectedAdministratorRoleError,
} from "./administration.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const administration = createAuthorizationAdministration(database);

async function clearAuthorizationState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.authorizationAuditRecord.deleteMany();
  await database.firMembership.deleteMany();
  await database.userRoleAssignment.deleteMany();
  await database.roleCapability.deleteMany();
  await database.role.deleteMany();
  await database.capability.deleteMany();
  await database.user.deleteMany();
}

beforeEach(async () => {
  await clearAuthorizationState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database, "10000001");
});

async function administratorActorId() {
  const actor = await database.user.findUniqueOrThrow({
    where: { cid: "10000001" },
    select: { id: true },
  });

  return actor.id;
}

afterAll(async () => {
  try {
    await clearAuthorizationState();
  } finally {
    await database.$disconnect();
  }
});

describe("authorization bootstrap", () => {
  it("is idempotent and provisions one effective administrator", async () => {
    await seedAuthorizationModel(database, "10000001");

    const administrator = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
      include: {
        roleAssignments: {
          include: {
            role: {
              include: { capabilities: true },
            },
          },
        },
      },
    });

    expect(
      administrator.roleAssignments.filter(
        (assignment) =>
          assignment.scopeKey === GLOBAL_ROLE_SCOPE_KEY &&
          assignment.role.capabilities.some(
            (grant) =>
              grant.capabilityKey ===
              SYSTEM_ADMINISTRATOR_CAPABILITY,
          ),
      ),
    ).toHaveLength(1);
    expect(
      await database.userRoleAssignment.count({
        where: { userId: administrator.id },
      }),
    ).toBe(1);
  });

  it("assigns the global Pilot role during identity synchronization", async () => {
    const sessions = new SessionService(
      createIdentitySessionRepository(database),
      { ttlSeconds: 3600 },
    );
    const user = await sessions.synchronizeVatsimIdentity({
      cid: "10000002",
      displayName: "Two Web",
      synchronizedAt: new Date("2026-07-26T10:00:00.000Z"),
    });
    const assignments = await database.userRoleAssignment.findMany({
      where: { userId: user.id },
      include: { role: true },
    });

    expect(assignments).toEqual([
      expect.objectContaining({
        firId: null,
        scopeKey: GLOBAL_ROLE_SCOPE_KEY,
        role: expect.objectContaining({ key: PILOT_ROLE_KEY }),
      }),
    ]);
  });
});

describe("role assignment scope", () => {
  it("supports FIR-scoped grants and rejects mismatched scopes", async () => {
    const actorUserId = await administratorActorId();
    const user = await database.user.create({
      data: { cid: "10000002" },
    });
    const assignment = await administration.assignRole(
      actorUserId,
      {
        userId: user.id,
        roleKey: EVENT_COORDINATOR_ROLE_KEY,
        firIcaoCode: "EKDK",
      },
    );

    expect(assignment.fir?.icaoCode).toBe("EKDK");

    await expect(
      administration.assignRole(actorUserId, {
        userId: user.id,
        roleKey: ADMINISTRATOR_ROLE_KEY,
        firIcaoCode: "EKDK",
      }),
    ).rejects.toBeInstanceOf(AuthorizationModelError);
    await expect(
      administration.assignRole(actorUserId, {
        userId: user.id,
        roleKey: EVENT_COORDINATOR_ROLE_KEY,
      }),
    ).rejects.toBeInstanceOf(AuthorizationModelError);

    await database.fir.update({
      where: { icaoCode: "EKDK" },
      data: { active: false },
    });
    try {
      await expect(
        administration.assignRole(actorUserId, {
          userId: user.id,
          roleKey: EVENT_COORDINATOR_ROLE_KEY,
          firIcaoCode: "EKDK",
        }),
      ).rejects.toThrow("active FIR");
    } finally {
      await database.fir.update({
        where: { icaoCode: "EKDK" },
        data: { active: true },
      });
    }
  });

  it("prevents FIR roles from receiving global-only capabilities", async () => {
    const actorUserId = await administratorActorId();

    await expect(
      administration.updateRole(
        actorUserId,
        EVENT_COORDINATOR_ROLE_KEY,
        {
          name: "Event Coordinator",
          description: "FIR-scoped event and roster management role.",
          capabilityKeys: [SYSTEM_ADMINISTRATOR_CAPABILITY],
        },
      ),
    ).rejects.toThrow("global-only");
  });
});

describe("administrator lockout protection", () => {
  it("rejects removal of the last active administrator assignment", async () => {
    const actorUserId = await administratorActorId();
    const assignment =
      await database.userRoleAssignment.findFirstOrThrow({
        where: {
          user: { cid: "10000001" },
          role: { key: ADMINISTRATOR_ROLE_KEY },
        },
      });

    await expect(
      administration.revokeAssignment(actorUserId, assignment.id),
    ).rejects.toBeInstanceOf(LastAdministratorError);
    await expect(
      database.userRoleAssignment.findUnique({
        where: { id: assignment.id },
      }),
    ).resolves.not.toBeNull();
  });

  it("allows handover but prevents disabling the remaining administrator", async () => {
    const actorUserId = await administratorActorId();
    const first = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
      include: { roleAssignments: true },
    });
    const second = await database.user.create({
      data: { cid: "10000002" },
    });
    await administration.assignRole(actorUserId, {
      userId: second.id,
      roleKey: ADMINISTRATOR_ROLE_KEY,
    });

    await expect(
      administration.revokeAssignment(
        actorUserId,
        first.roleAssignments[0]?.id ?? "",
      ),
    ).resolves.toBe(true);
    await expect(
      administration.setUserStatus(
        second.id,
        second.id,
        "DISABLED",
      ),
    ).rejects.toBeInstanceOf(LastAdministratorError);
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: second.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("does not treat an administrator marker without management access as a safe handover", async () => {
    const actorUserId = await administratorActorId();
    const currentAssignment =
      await database.userRoleAssignment.findFirstOrThrow({
        where: {
          userId: actorUserId,
          role: { key: ADMINISTRATOR_ROLE_KEY },
        },
      });
    const second = await database.user.create({
      data: { cid: "10000002" },
    });
    await administration.createRole(actorUserId, {
      key: "administrator-marker",
      name: "Administrator Marker",
      description: "Marker without authorization management.",
      scope: "global",
      capabilityKeys: [SYSTEM_ADMINISTRATOR_CAPABILITY],
    });
    await administration.assignRole(actorUserId, {
      userId: second.id,
      roleKey: "administrator-marker",
    });

    await expect(
      administration.revokeAssignment(
        actorUserId,
        currentAssignment.id,
      ),
    ).rejects.toBeInstanceOf(LastAdministratorError);
  });

  it("protects the built-in administrator management capabilities", async () => {
    const actorUserId = await administratorActorId();

    await expect(
      administration.updateRole(
        actorUserId,
        ADMINISTRATOR_ROLE_KEY,
        {
          name: "Administrator",
          description:
            "Protected global role for Event Hub administration.",
          capabilityKeys: ["authorization.manage"],
        },
      ),
    ).rejects.toBeInstanceOf(ProtectedAdministratorRoleError);
    await expect(
      administration.updateRole(
        actorUserId,
        ADMINISTRATOR_ROLE_KEY,
        {
          name: "Administrator",
          description:
            "Protected global role for Event Hub administration.",
          capabilityKeys: INITIAL_CAPABILITIES.map(
            (capability) => capability.key,
          ).filter(
            (capabilityKey) =>
              capabilityKey !== "authorization.manage",
          ),
        },
      ),
    ).rejects.toBeInstanceOf(ProtectedAdministratorRoleError);
  });
});

describe("administrator management and auditing", () => {
  it("denies users without authorization management capability", async () => {
    const user = await database.user.create({
      data: { cid: "10000002" },
    });

    await expect(
      administration.getOverview(user.id),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      administration.createRole(user.id, {
        key: "event-planner",
        name: "Event Planner",
        description: "Plans events.",
        scope: "fir",
        capabilityKeys: ["events.manage"],
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("creates, updates, and deletes a custom role with one audit record per change", async () => {
    const actorUserId = await administratorActorId();
    const created = await administration.createRole(actorUserId, {
      key: "event-planner",
      name: "Event Planner",
      description: "Plans events.",
      scope: "fir",
      capabilityKeys: ["events.manage"],
    });

    expect(created).toMatchObject({
      key: "event-planner",
      capabilityKeys: ["events.manage"],
      protected: false,
    });

    const updated = await administration.updateRole(
      actorUserId,
      "event-planner",
      {
        name: "Senior Event Planner",
        description: "Plans events and rosters.",
        capabilityKeys: ["events.manage", "rosters.manage"],
      },
    );

    expect(updated).toMatchObject({
      name: "Senior Event Planner",
      capabilityKeys: ["events.manage", "rosters.manage"],
    });
    await expect(
      administration.deleteRole(actorUserId, "event-planner"),
    ).resolves.toBe(true);

    const audit = await database.authorizationAuditRecord.findMany({
      orderBy: { createdAt: "asc" },
    });

    expect(audit.map((record) => record.action)).toEqual([
      "authorization.role.created",
      "authorization.role.updated",
      "authorization.role.deleted",
    ]);
    expect(audit.every((record) => record.actorUserId === actorUserId)).toBe(
      true,
    );
    expect(audit[1]?.beforeState).not.toBeNull();
    expect(audit[1]?.afterState).not.toBeNull();
  });

  it("returns searchable users with effective global and FIR permissions", async () => {
    const actorUserId = await administratorActorId();
    const user = await database.user.create({
      data: {
        cid: "10000002",
        identities: {
          create: {
            provider: "vatsim",
            subject: "10000002",
            displayName: "Coordinator Two",
            lastSyncedAt: new Date("2026-07-26T10:00:00.000Z"),
          },
        },
      },
    });
    await administration.assignRole(actorUserId, {
      userId: user.id,
      roleKey: EVENT_COORDINATOR_ROLE_KEY,
      firIcaoCode: "EKDK",
    });

    const page = await administration.listUsers(actorUserId, {
      query: "Coordinator",
      limit: 25,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        cid: "10000002",
        displayName: "Coordinator Two",
        effectiveCapabilities: [
          {
            capabilityKey: "events.manage",
            global: false,
            firIcaoCodes: ["EKDK"],
          },
          {
            capabilityKey: "rosters.manage",
            global: false,
            firIcaoCodes: ["EKDK"],
          },
        ],
      }),
    ]);
    await expect(
      database.authorizationAuditRecord.count({
        where: { action: "authorization.assignment.created" },
      }),
    ).resolves.toBe(1);
  });
});
