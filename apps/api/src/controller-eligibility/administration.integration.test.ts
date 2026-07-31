import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import {
  createControllerEligibilityAdministration,
  ControllerEligibilityDeniedError,
} from "./administration.js";
import type {
  ControllerEligibilityProvider,
  NormalizedEligibilityBatch,
} from "./provider.js";
import { ControllerEligibilitySynchronization } from "./synchronization.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const batch: NormalizedEligibilityBatch = {
  provider: "control-center",
  fetchedAt: new Date("2026-07-26T10:00:00.000Z"),
  controllers: [],
  positions: [],
};
const provider: ControllerEligibilityProvider = {
  key: "control-center",
  async fetchEligibility() {
    return batch;
  },
};
const synchronization = new ControllerEligibilitySynchronization(
  database,
  [provider],
  { freshnessSeconds: 2 * 60 * 60 },
);
const administration = createControllerEligibilityAdministration(
  database,
  synchronization,
  () => new Date("2026-07-26T13:00:00.000Z"),
);

async function clearState() {
  await database.eligibilitySyncRun.deleteMany();
  await database.eligibilityProviderState.deleteMany();
  await database.knownControllerPosition.deleteMany();
  await database.controllerEndorsement.deleteMany();
  await database.controllerEligibilitySnapshot.deleteMany();
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

describe("controller eligibility administration", () => {
  it("shows disabled and stale provider states to an authorized administrator", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    await synchronization.sync("control-center", "startup");

    await expect(administration.getStatus(actor.id)).resolves.toMatchObject({
      generatedAt: "2026-07-26T13:00:00.000Z",
      providers: [
        {
          provider: "control-center",
          configured: true,
          state: "succeeded",
          freshness: "stale",
          freshUntil: "2026-07-26T12:00:00.000Z",
        },
        {
          provider: "vateud",
          configured: false,
          state: "never",
          freshness: "disabled",
        },
      ],
      recentRuns: [
        {
          provider: "control-center",
          trigger: "startup",
          status: "succeeded",
        },
      ],
    });
  });

  it("rejects administrators without the global membership capability", async () => {
    const user = await database.user.create({
      data: { cid: "10000002" },
    });

    await expect(
      administration.getStatus(user.id),
    ).rejects.toBeInstanceOf(ControllerEligibilityDeniedError);
  });
});
