import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createFirMembershipAdministration } from "./fir-memberships.js";
import { AuthorizationPolicy } from "./policy.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const administration = createFirMembershipAdministration(database);
const apps: ReturnType<typeof buildApp>[] = [];
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;
const sessionToken = "A".repeat(43);

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
    firMembershipAdministration: administration,
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

describe("FIR membership administration routes", () => {
  it("requires an authenticated session", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const app = await buildAuthorizedApp(actor.id);
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/fir-memberships",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("denies a user without global membership-management capability", async () => {
    const user = await database.user.create({
      data: { cid: "10000002" },
    });
    const app = await buildAuthorizedApp(user.id);
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/fir-memberships",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You cannot manage FIR memberships.",
      },
    });
  });

  it("assigns, lists, and revokes a manual membership with audited reasons", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const target = await database.user.create({
      data: { cid: "10000002" },
    });
    const app = await buildAuthorizedApp(actor.id);
    const headers = {
      cookie: `event_hub_id=${sessionToken}`,
    };
    const membershipUrl =
      `/v1/admin/fir-memberships/users/${target.id}/firs/EKDK`;

    const invalid = await app.inject({
      method: "PUT",
      url: membershipUrl,
      headers,
      payload: { reason: "no" },
    });
    const assigned = await app.inject({
      method: "PUT",
      url: membershipUrl,
      headers,
      payload: {
        reason: "Verified by the Danish training team.",
      },
    });
    const users = await app.inject({
      method: "GET",
      url: "/v1/admin/fir-memberships/users?q=10000002",
      headers,
    });
    const revoked = await app.inject({
      method: "DELETE",
      url: membershipUrl,
      headers,
      payload: {
        reason: "Membership withdrawn by the Danish training team.",
      },
    });
    const overview = await app.inject({
      method: "GET",
      url: "/v1/admin/fir-memberships",
      headers,
    });

    expect(invalid.statusCode).toBe(400);
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json()).toMatchObject({
      fir: { icaoCode: "EKDK" },
      source: "manual",
      status: "active",
    });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toMatchObject({
      items: [
        {
          cid: "10000002",
          memberships: [
            {
              fir: { icaoCode: "EKDK" },
              status: "active",
            },
          ],
        },
      ],
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({
      status: "revoked",
      reason: "Membership withdrawn by the Danish training team.",
    });
    expect(
      overview
        .json<{
          recentAuditRecords: Array<{ action: string }>;
        }>()
        .recentAuditRecords.map((record) => record.action),
    ).toEqual([
      "fir-membership.revoked",
      "fir-membership.assigned",
    ]);
  });
});
