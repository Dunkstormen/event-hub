import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createControllerEligibilityAdministration } from "./administration.js";
import { AuthorizationPolicy } from "../authorization/policy.js";
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
);
const apps: ReturnType<typeof buildApp>[] = [];
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;
const sessionToken = "A".repeat(43);

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

async function buildAuthorizedApp(actorUserId: string) {
  const app = buildApp({
    authorizationSessions: {
      async authenticateActor(token) {
        return token === sessionToken
          ? {
              id: actorUserId,
              cid: "10000001",
              displayName: "Administrator",
            }
          : null;
      },
    },
    controllerEligibilityAdministration: administration,
    authorizationPolicy: new AuthorizationPolicy(database),
    sessionConfiguration,
  });
  apps.push(app);
  await app.ready();
  return app;
}

beforeEach(async () => {
  await clearState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database, "10000001");
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

afterAll(async () => {
  try {
    await clearState();
  } finally {
    await database.$disconnect();
  }
});

describe("controller eligibility administration routes", () => {
  it("requires authentication and serializes status and on-demand results", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const app = await buildAuthorizedApp(actor.id);

    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/admin/controller-eligibility",
    });
    const synchronized = await app.inject({
      method: "POST",
      url: "/v1/admin/controller-eligibility/control-center/sync",
      headers: { cookie: `event_hub_id=${sessionToken}` },
    });
    const status = await app.inject({
      method: "GET",
      url: "/v1/admin/controller-eligibility",
      headers: { cookie: `event_hub_id=${sessionToken}` },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(synchronized.statusCode).toBe(200);
    expect(synchronized.json()).toMatchObject({
      provider: "control-center",
      controllersSeen: 0,
      membershipsChanged: 0,
      freshUntil: "2026-07-26T12:00:00.000Z",
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      providers: [
        { provider: "control-center", state: "succeeded" },
        { provider: "vateud", freshness: "disabled" },
      ],
      recentRuns: [
        { provider: "control-center", trigger: "on-demand" },
      ],
    });
  });

  it("rejects on-demand synchronization for a disabled provider", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const app = await buildAuthorizedApp(actor.id);
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/controller-eligibility/vateud/sync",
      headers: { cookie: `event_hub_id=${sessionToken}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "Eligibility provider vateud is not configured.",
      },
    });
  });
});
