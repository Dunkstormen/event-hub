import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDatabaseClient,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import {
  type ControllerEligibilityProvider,
  EligibilityProviderError,
  type NormalizedEligibilityBatch,
} from "./provider.js";
import { ControllerEligibilitySynchronization } from "./synchronization.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const fetchedAt = new Date("2026-07-26T10:00:00.000Z");
const freshUntil = new Date("2026-07-26T12:00:00.000Z");

function controlCenterBatch(
  firIcaoCodes: readonly string[] = ["EKDK"],
): NormalizedEligibilityBatch {
  return {
    provider: "control-center",
    fetchedAt,
    controllers: [
      {
        cid: "10000002",
        displayName: "Ada Controller",
        firIcaoCodes,
        rostered: true,
        rating: { code: "S3", value: 4 },
        endorsements: [
          {
            kind: "solo",
            position: "EKCH_TWR",
            rating: null,
            sourceKey: "solo:123",
            validFrom: fetchedAt,
            validUntil: freshUntil,
          },
        ],
      },
    ],
    positions: [
      {
        callsign: "EKCH_TWR",
        name: "Copenhagen Tower",
        frequency: "118.100",
      },
    ],
  };
}

function provider(
  fetchEligibility: () => Promise<NormalizedEligibilityBatch>,
): ControllerEligibilityProvider {
  return {
    key: "control-center",
    fetchEligibility,
  };
}

async function clearState() {
  await database.eligibilitySyncRun.deleteMany();
  await database.eligibilityProviderState.deleteMany();
  await database.knownControllerPosition.deleteMany();
  await database.controllerEndorsement.deleteMany();
  await database.controllerEligibilitySnapshot.deleteMany();
  await database.firMembership.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.user.deleteMany();
}

beforeEach(async () => {
  await clearState();
  await seedReferenceData(database);
});

afterAll(async () => {
  try {
    await clearState();
  } finally {
    await database.$disconnect();
  }
});

describe("controller eligibility synchronization", () => {
  it("atomically replaces evidence and synchronizes explicit Control Center FIRs", async () => {
    const fetchEligibility = vi
      .fn<() => Promise<NormalizedEligibilityBatch>>()
      .mockResolvedValue(controlCenterBatch());
    const synchronization = new ControllerEligibilitySynchronization(
      database,
      [provider(fetchEligibility)],
      { freshnessSeconds: 2 * 60 * 60 },
    );

    await expect(
      synchronization.sync("control-center", "periodic"),
    ).resolves.toMatchObject({
      controllersSeen: 1,
      freshUntil,
      membershipsChanged: 1,
      provider: "control-center",
    });
    const user = await database.user.findUniqueOrThrow({
      where: { cid: "10000002" },
      include: {
        controllerEndorsements: true,
        eligibilitySnapshots: true,
        firMemberships: { include: { fir: true } },
        identities: true,
      },
    });

    expect(user.identities).toEqual([
      expect.objectContaining({
        provider: "control-center",
        displayName: "Ada Controller",
      }),
    ]);
    expect(user.eligibilitySnapshots).toEqual([
      expect.objectContaining({
        provider: "CONTROL_CENTER",
        ratingCode: "S3",
        freshUntil,
      }),
    ]);
    expect(user.controllerEndorsements).toEqual([
      expect.objectContaining({
        provider: "CONTROL_CENTER",
        kind: "SOLO",
        position: "EKCH_TWR",
        freshUntil,
      }),
    ]);
    expect(user.firMemberships).toEqual([
      expect.objectContaining({
        source: "AUTOMATIC",
        status: "ACTIVE",
        sourceProvider: "control-center",
        providerFreshUntil: freshUntil,
        fir: expect.objectContaining({ icaoCode: "EKDK" }),
      }),
    ]);
    await expect(
      database.eligibilityProviderState.findUniqueOrThrow({
        where: { provider: "CONTROL_CENTER" },
      }),
    ).resolves.toMatchObject({
      status: "SUCCEEDED",
      consecutiveFailures: 0,
      recordsSeen: 1,
      freshUntil,
    });
  });

  it("is idempotent, revokes removed automatic FIRs, and preserves manual overrides", async () => {
    const batches = [
      controlCenterBatch(["EKDK", "ESAA"]),
      controlCenterBatch(["EKDK", "ESAA"]),
      controlCenterBatch([]),
    ];
    const fetchEligibility = vi.fn(async () => batches.shift()!);
    const synchronization = new ControllerEligibilitySynchronization(
      database,
      [provider(fetchEligibility)],
      { freshnessSeconds: 2 * 60 * 60 },
    );

    await expect(
      synchronization.sync("control-center", "periodic"),
    ).resolves.toMatchObject({ membershipsChanged: 2 });
    await expect(
      synchronization.sync("control-center", "periodic"),
    ).resolves.toMatchObject({ membershipsChanged: 0 });

    const user = await database.user.findUniqueOrThrow({
      where: { cid: "10000002" },
    });
    const esaa = await database.fir.findUniqueOrThrow({
      where: { icaoCode: "ESAA" },
    });
    await database.firMembership.update({
      where: {
        userId_firId: { userId: user.id, firId: esaa.id },
      },
      data: {
        source: "MANUAL",
        sourceProvider: null,
        providerFreshUntil: null,
        reason: "Training team override.",
      },
    });

    await expect(
      synchronization.sync("control-center", "periodic"),
    ).resolves.toMatchObject({ membershipsChanged: 1 });
    const memberships = await database.firMembership.findMany({
      where: { userId: user.id },
      include: { fir: true },
      orderBy: { fir: { icaoCode: "asc" } },
    });

    expect(memberships).toEqual([
      expect.objectContaining({
        status: "REVOKED",
        source: "AUTOMATIC",
        fir: expect.objectContaining({ icaoCode: "EKDK" }),
      }),
      expect.objectContaining({
        status: "ACTIVE",
        source: "MANUAL",
        sourceProvider: null,
        providerFreshUntil: null,
        reason: "Training team override.",
        fir: expect.objectContaining({ icaoCode: "ESAA" }),
      }),
    ]);
  });

  it("records provider failures without changing last successful evidence", async () => {
    const fetchEligibility = vi
      .fn<() => Promise<NormalizedEligibilityBatch>>()
      .mockResolvedValueOnce(controlCenterBatch())
      .mockRejectedValueOnce(
        new EligibilityProviderError(
          "PROVIDER_UNAVAILABLE",
          "Control Center is unavailable.",
          true,
        ),
      );
    const synchronization = new ControllerEligibilitySynchronization(
      database,
      [provider(fetchEligibility)],
      {
        clock: () => new Date("2026-07-26T10:30:00.000Z"),
        freshnessSeconds: 2 * 60 * 60,
        retryBaseSeconds: 60,
      },
    );

    await synchronization.sync("control-center", "startup");
    const evidenceBefore =
      await database.controllerEligibilitySnapshot.findFirstOrThrow();

    await expect(
      synchronization.sync("control-center", "periodic"),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    await expect(
      database.controllerEligibilitySnapshot.findFirstOrThrow(),
    ).resolves.toEqual(evidenceBefore);
    await expect(
      database.firMembership.findFirstOrThrow(),
    ).resolves.toMatchObject({
      status: "ACTIVE",
      providerFreshUntil: freshUntil,
    });
    await expect(
      database.eligibilityProviderState.findUniqueOrThrow({
        where: { provider: "CONTROL_CENTER" },
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      consecutiveFailures: 1,
      lastErrorCode: "PROVIDER_UNAVAILABLE",
      freshUntil,
      nextRetryAt: new Date("2026-07-26T10:31:00.000Z"),
    });
    await expect(
      database.eligibilitySyncRun.count({
        where: { status: "FAILED" },
      }),
    ).resolves.toBe(1);
  });

  it("does not grant FIR membership to an inactive Control Center controller", async () => {
    const inactiveBatch = controlCenterBatch();
    const fetchEligibility = vi.fn(async () => ({
      ...inactiveBatch,
      controllers: inactiveBatch.controllers.map((controller) => ({
        ...controller,
        rostered: false,
      })),
    }));
    const synchronization = new ControllerEligibilitySynchronization(
      database,
      [provider(fetchEligibility)],
      { freshnessSeconds: 2 * 60 * 60 },
    );

    await expect(
      synchronization.sync("control-center", "periodic"),
    ).resolves.toMatchObject({ membershipsChanged: 0 });
    await expect(database.firMembership.count()).resolves.toBe(0);
    await expect(
      database.controllerEligibilitySnapshot.findFirstOrThrow(),
    ).resolves.toMatchObject({ rostered: false });
  });
});
