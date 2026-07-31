import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import {
  createFirMembershipAdministration,
  FirMembershipDeniedError,
  FirMembershipModelError,
} from "./fir-memberships.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const administration = createFirMembershipAdministration(database);

async function clearState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.auditRecord.deleteMany();
  await database.firMembership.deleteMany();
  await database.userRoleAssignment.deleteMany();
  await database.roleCapability.deleteMany();
  await database.role.deleteMany();
  await database.capability.deleteMany();
  await database.user.deleteMany();
}

beforeEach(async () => {
  await clearState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database, "10000001");
});

afterAll(async () => {
  try {
    await clearState();
  } finally {
    await database.$disconnect();
  }
});

async function administratorActorId() {
  return (
    await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
      select: { id: true },
    })
  ).id;
}

async function createTargetUser() {
  return database.user.create({
    data: {
      cid: "10000002",
      identities: {
        create: {
          provider: "vatsim",
          subject: "10000002",
          displayName: "Ada Controller",
          lastSyncedAt: new Date("2026-07-26T10:00:00.000Z"),
        },
      },
    },
  });
}

describe("FIR membership administration", () => {
  it("denies an active user without FIR membership management", async () => {
    const target = await createTargetUser();

    await expect(
      administration.assignManual(target.id, {
        userId: target.id,
        firIcaoCode: "EKDK",
        reason: "Verified by the training team.",
      }),
    ).rejects.toBeInstanceOf(FirMembershipDeniedError);
  });

  it("grants one user active membership in multiple explicit FIRs", async () => {
    const actorUserId = await administratorActorId();
    const target = await createTargetUser();

    await administration.assignManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "EKDK",
      reason: "Confirmed by the Danish training team.",
    });
    await administration.assignManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "ESAA",
      reason: "Confirmed by the Swedish training team.",
    });

    const page = await administration.listUsers(actorUserId, {
      query: "Ada",
      limit: 25,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        cid: "10000002",
        displayName: "Ada Controller",
        memberships: [
          expect.objectContaining({
            fir: expect.objectContaining({ icaoCode: "EKDK" }),
            source: "manual",
            status: "active",
            reason: "Confirmed by the Danish training team.",
          }),
          expect.objectContaining({
            fir: expect.objectContaining({ icaoCode: "ESAA" }),
            source: "manual",
            status: "active",
            reason: "Confirmed by the Swedish training team.",
          }),
        ],
      }),
    ]);
    await expect(
      database.auditRecord.count({
        where: { action: "fir-membership.assigned" },
      }),
    ).resolves.toBe(2);
  });

  it("revokes access immediately and does not duplicate idempotent audit events", async () => {
    const actorUserId = await administratorActorId();
    const target = await createTargetUser();
    const assigned = await administration.assignManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "EKDK",
      reason: "Confirmed by the training team.",
    });
    const duplicate = await administration.assignManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "EKDK",
      reason: "A later duplicate reason must not replace history.",
    });

    expect(duplicate.id).toBe(assigned.id);
    expect(duplicate.reason).toBe("Confirmed by the training team.");

    const revoked = await administration.revokeManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "EKDK",
      reason: "Membership withdrawn by the training team.",
    });
    const duplicateRevocation =
      await administration.revokeManual(actorUserId, {
        userId: target.id,
        firIcaoCode: "EKDK",
        reason: "A duplicate revocation must not replace history.",
      });
    const page = await administration.listUsers(actorUserId, {
      query: "10000002",
      limit: 25,
    });

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();
    expect(duplicateRevocation.reason).toBe(
      "Membership withdrawn by the training team.",
    );
    expect(page.items[0]?.memberships[0]?.status).toBe("revoked");
    expect(
      await database.auditRecord.findMany({
        orderBy: { createdAt: "asc" },
        select: { action: true },
      }),
    ).toEqual([
      { action: "fir-membership.assigned" },
      { action: "fir-membership.revoked" },
    ]);
  });

  it("turns an automatic membership into a traceable manual override", async () => {
    const actorUserId = await administratorActorId();
    const target = await createTargetUser();
    const fir = await database.fir.findUniqueOrThrow({
      where: { icaoCode: "EKDK" },
    });
    await database.firMembership.create({
      data: {
        userId: target.id,
        firId: fir.id,
        source: "AUTOMATIC",
        sourceProvider: "control-center",
        providerFreshUntil: new Date("2026-07-26T12:00:00.000Z"),
        status: "ACTIVE",
      },
    });

    const membership = await administration.assignManual(actorUserId, {
      userId: target.id,
      firIcaoCode: "EKDK",
      reason: "Provider data is incomplete; manually verified.",
    });
    const audit =
      await database.auditRecord.findFirstOrThrow();

    expect(membership).toMatchObject({
      source: "manual",
      sourceProvider: null,
      reason: "Provider data is incomplete; manually verified.",
    });
    expect(audit.action).toBe("fir-membership.overridden");
    expect(audit.beforeState).toMatchObject({
      source: "automatic",
      sourceProvider: "control-center",
    });
  });

  it("requires a meaningful reason and an active FIR", async () => {
    const actorUserId = await administratorActorId();
    const target = await createTargetUser();

    await expect(
      administration.assignManual(actorUserId, {
        userId: target.id,
        firIcaoCode: "EKDK",
        reason: "  ",
      }),
    ).rejects.toBeInstanceOf(FirMembershipModelError);

    await database.fir.update({
      where: { icaoCode: "EKDK" },
      data: { active: false },
    });
    try {
      await expect(
        administration.assignManual(actorUserId, {
          userId: target.id,
          firIcaoCode: "EKDK",
          reason: "Verified while FIR is inactive.",
        }),
      ).rejects.toThrow("active FIR");
    } finally {
      await database.fir.update({
        where: { icaoCode: "EKDK" },
        data: { active: true },
      });
    }
  });
});
