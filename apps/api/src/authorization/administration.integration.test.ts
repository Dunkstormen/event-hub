import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ADMINISTRATOR_ROLE_KEY,
  createDatabaseClient,
  EVENT_COORDINATOR_ROLE_KEY,
  GLOBAL_ROLE_SCOPE_KEY,
  PILOT_ROLE_KEY,
  seedAuthorizationModel,
  seedReferenceData,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { createIdentitySessionRepository } from "../auth/repository.js";
import { SessionService } from "../auth/session-service.js";
import {
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
    const user = await database.user.create({
      data: { cid: "10000002" },
    });
    const assignment = await administration.assignRole({
      userId: user.id,
      roleKey: EVENT_COORDINATOR_ROLE_KEY,
      firIcaoCode: "EKDK",
    });

    expect(assignment.firId).not.toBeNull();
    expect(assignment.scopeKey).toBe(assignment.firId);

    await expect(
      administration.assignRole({
        userId: user.id,
        roleKey: ADMINISTRATOR_ROLE_KEY,
        firIcaoCode: "EKDK",
      }),
    ).rejects.toBeInstanceOf(AuthorizationModelError);
    await expect(
      administration.assignRole({
        userId: user.id,
        roleKey: EVENT_COORDINATOR_ROLE_KEY,
      }),
    ).rejects.toBeInstanceOf(AuthorizationModelError);
  });

  it("prevents FIR roles from receiving global-only capabilities", async () => {
    await expect(
      administration.replaceRoleCapabilities(
        EVENT_COORDINATOR_ROLE_KEY,
        [SYSTEM_ADMINISTRATOR_CAPABILITY],
      ),
    ).rejects.toThrow("global-only");
  });
});

describe("administrator lockout protection", () => {
  it("rejects removal of the last active administrator assignment", async () => {
    const assignment =
      await database.userRoleAssignment.findFirstOrThrow({
        where: {
          user: { cid: "10000001" },
          role: { key: ADMINISTRATOR_ROLE_KEY },
        },
      });

    await expect(
      administration.revokeAssignment(assignment.id),
    ).rejects.toBeInstanceOf(LastAdministratorError);
    await expect(
      database.userRoleAssignment.findUnique({
        where: { id: assignment.id },
      }),
    ).resolves.not.toBeNull();
  });

  it("allows handover but prevents disabling the remaining administrator", async () => {
    const first = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
      include: { roleAssignments: true },
    });
    const second = await database.user.create({
      data: { cid: "10000002" },
    });
    await administration.assignRole({
      userId: second.id,
      roleKey: ADMINISTRATOR_ROLE_KEY,
    });

    await expect(
      administration.revokeAssignment(
        first.roleAssignments[0]?.id ?? "",
      ),
    ).resolves.toBe(true);
    await expect(
      administration.setUserStatus(second.id, "DISABLED"),
    ).rejects.toBeInstanceOf(LastAdministratorError);
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: second.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("protects the built-in administrator capability marker", async () => {
    await expect(
      administration.replaceRoleCapabilities(
        ADMINISTRATOR_ROLE_KEY,
        ["authorization.manage"],
      ),
    ).rejects.toBeInstanceOf(ProtectedAdministratorRoleError);
  });
});
