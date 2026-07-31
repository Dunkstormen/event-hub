import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  EVENT_COORDINATOR_ROLE_KEY,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import {
  createEventAggregate,
  EventAggregateDeniedError,
  EventAggregateError,
} from "./aggregate.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const events = createEventAggregate(database);

const draftInput = {
  name: "Cross the Pond Nordic",
  shortDescription: "An evening of Nordic traffic.",
  description: "Fly between participating Nordic airports.",
  bannerStorageKey: "events/cross-the-pond/banner.webp",
  rosteringType: "OPEN_INTEREST",
  localStart: "2026-08-15T18:00:00",
  localEnd: "2026-08-15T22:00:00",
  timeZone: "Europe/Copenhagen",
  ownerFirIcaoCode: "EKDK",
  participatingFirIcaoCodes: ["EFIN", "ESAA"],
  participatingAirportIcaoCodes: ["EKCH", "EFHK"],
} as const;

async function clearState() {
  await database.eventAirport.deleteMany();
  await database.eventFir.deleteMany();
  await database.event.deleteMany();
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

async function createCoordinator(cid: string, firIcaoCode: string) {
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
  await clearState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database);
});

afterAll(async () => {
  try {
    await clearState();
  } finally {
    await database.$disconnect();
  }
});

describe("event aggregate", () => {
  it("creates one required owner and explicit FIR and airport participation", async () => {
    const owner = await createCoordinator("10000001", "EKDK");
    const event = await events.createDraft(owner.id, draftInput);

    expect(event).toMatchObject({
      name: draftInput.name,
      lifecycleState: "DRAFT",
      rosteringType: "OPEN_INTEREST",
      localStart: draftInput.localStart,
      localEnd: draftInput.localEnd,
      timeZone: "Europe/Copenhagen",
      cancellationReason: null,
      bannerStorageKey: draftInput.bannerStorageKey,
      ownerFir: { icaoCode: "EKDK" },
    });
    expect(
      event.participatingFirs.map(({ fir }) => fir.icaoCode),
    ).toEqual(["EFIN", "EKDK", "ESAA"]);
    expect(
      event.participatingAirports.map(
        ({ airport }) => airport.icaoCode,
      ),
    ).toEqual(["EFHK", "EKCH"]);
    await expect(
      database.auditRecord.findFirstOrThrow({
        where: { targetKey: event.id },
      }),
    ).resolves.toMatchObject({
      action: "event.created",
      actorUserId: owner.id,
      afterState: {
        lifecycleState: "DRAFT",
        ownerFirIcaoCode: "EKDK",
        cancellationReason: null,
      },
    });
  });

  it("transfers ownership only from the current owner to a participant and retains the former owner", async () => {
    const [owner, invited] = await Promise.all([
      createCoordinator("10000001", "EKDK"),
      createCoordinator("10000002", "EFIN"),
    ]);
    const event = await events.createDraft(owner.id, draftInput);

    await expect(
      events.transferOwnership(invited.id, event.id, "ESAA"),
    ).rejects.toBeInstanceOf(EventAggregateDeniedError);
    await expect(
      events.transferOwnership(owner.id, event.id, "BIRD"),
    ).rejects.toThrow("active participating FIR");

    const transferred = await events.transferOwnership(
      owner.id,
      event.id,
      "EFIN",
    );

    expect(transferred.ownerFir.icaoCode).toBe("EFIN");
    expect(
      transferred.participatingFirs.map(({ fir }) => fir.icaoCode),
    ).toEqual(["EFIN", "EKDK", "ESAA"]);
    await expect(
      events.transferOwnership(owner.id, event.id, "ESAA"),
    ).rejects.toBeInstanceOf(EventAggregateDeniedError);

    const transferredAgain = await events.transferOwnership(
      invited.id,
      event.id,
      "ESAA",
    );
    expect(transferredAgain.ownerFir.icaoCode).toBe("ESAA");

    const transferAudit = await database.auditRecord.findMany({
      where: {
        targetKey: event.id,
        action: "event.ownership-transferred",
      },
      orderBy: { createdAt: "asc" },
    });
    expect(transferAudit).toHaveLength(2);
    expect(transferAudit[0]).toMatchObject({
      actorUserId: owner.id,
      beforeState: { ownerFirIcaoCode: "EKDK" },
      afterState: { ownerFirIcaoCode: "EFIN" },
    });
  });

  it("requires the owning FIR and a public reason to cancel published content", async () => {
    const [owner, invited] = await Promise.all([
      createCoordinator("10000001", "EKDK"),
      createCoordinator("10000002", "EFIN"),
    ]);
    const event = await events.createDraft(owner.id, draftInput);
    await database.event.update({
      where: { id: event.id },
      data: { lifecycleState: "PUBLISHED" },
    });

    await expect(
      events.cancelPublished(owner.id, event.id, "   "),
    ).rejects.toBeInstanceOf(EventAggregateError);
    await expect(
      events.cancelPublished(
        invited.id,
        event.id,
        "Cancelled by collaborator",
      ),
    ).rejects.toBeInstanceOf(EventAggregateDeniedError);

    const cancelled = await events.cancelPublished(
      owner.id,
      event.id,
      "Staffing is unavailable.",
    );

    expect(cancelled).toMatchObject({
      lifecycleState: "CANCELLED",
      cancellationReason: "Staffing is unavailable.",
    });
    await expect(
      database.auditRecord.findFirstOrThrow({
        where: { targetKey: event.id, action: "event.cancelled" },
      }),
    ).resolves.toMatchObject({
      actorUserId: owner.id,
      afterState: {
        lifecycleState: "CANCELLED",
        cancellationReason: "Staffing is unavailable.",
      },
    });
  });

  it("enforces schedule, cancellation, lifecycle, and rostering constraints in MySQL", async () => {
    const owner = await createCoordinator("10000001", "EKDK");
    const event = await events.createDraft(owner.id, draftInput);

    await expect(
      database.$executeRawUnsafe(
        "UPDATE events SET local_end = local_start WHERE id = ?",
        event.id,
      ),
    ).rejects.toThrow();
    await expect(
      database.$executeRawUnsafe(
        "UPDATE events SET lifecycle_state = 'CANCELLED', cancellation_reason = NULL WHERE id = ?",
        event.id,
      ),
    ).rejects.toThrow();
    await expect(
      database.$executeRawUnsafe(
        "UPDATE events SET lifecycle_state = 'UNKNOWN' WHERE id = ?",
        event.id,
      ),
    ).rejects.toThrow();
    await expect(
      database.$executeRawUnsafe(
        "UPDATE events SET rostering_type = 'UNKNOWN' WHERE id = ?",
        event.id,
      ),
    ).rejects.toThrow();
  });
});
