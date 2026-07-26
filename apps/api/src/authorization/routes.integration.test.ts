import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createAuthorizationAdministration } from "./administration.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const administration = createAuthorizationAdministration(database);
const apps: ReturnType<typeof buildApp>[] = [];
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;
const sessionToken = "A".repeat(43);

async function clearAuthorizationState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.authorizationAuditRecord.deleteMany();
  await database.userRoleAssignment.deleteMany();
  await database.roleCapability.deleteMany();
  await database.role.deleteMany();
  await database.capability.deleteMany();
  await database.user.deleteMany();
}

async function buildAuthorizedApp(actorUserId: string) {
  const app = buildApp({
    authorizationAdministration: administration,
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
    sessionConfiguration,
  });
  apps.push(app);
  await app.ready();
  return app;
}

beforeEach(async () => {
  await clearAuthorizationState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database, "10000001");
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

afterAll(async () => {
  try {
    await clearAuthorizationState();
  } finally {
    await database.$disconnect();
  }
});

describe("authorization administration routes", () => {
  it("requires an authenticated session", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const app = await buildAuthorizedApp(actor.id);
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/authorization",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("denies an authenticated user without authorization management", async () => {
    const user = await database.user.create({
      data: { cid: "10000002" },
    });
    const app = await buildAuthorizedApp(user.id);
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/authorization",
      headers: {
        cookie: `event_hub_id=${sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You cannot manage authorization.",
      },
    });
  });

  it("manages roles and scoped assignments through validated audited contracts", async () => {
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

    const createdRole = await app.inject({
      method: "POST",
      url: "/v1/admin/authorization/roles",
      headers,
      payload: {
        key: "event-planner",
        name: "Event Planner",
        description: "Plans events for one FIR.",
        scope: "fir",
        capabilityKeys: ["events.manage"],
      },
    });
    const assigned = await app.inject({
      method: "POST",
      url: `/v1/admin/authorization/users/${target.id}/assignments`,
      headers,
      payload: {
        roleKey: "event-planner",
        firIcaoCode: "EKDK",
      },
    });
    const assignmentId = assigned.json<{ id: string }>().id;
    const users = await app.inject({
      method: "GET",
      url: "/v1/admin/authorization/users?q=10000002",
      headers,
    });
    const blockedDelete = await app.inject({
      method: "DELETE",
      url: "/v1/admin/authorization/roles/event-planner",
      headers,
    });
    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/admin/authorization/assignments/${assignmentId}`,
      headers,
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/admin/authorization/roles/event-planner",
      headers,
    });
    const overview = await app.inject({
      method: "GET",
      url: "/v1/admin/authorization",
      headers,
    });

    expect(createdRole.statusCode).toBe(201);
    expect(createdRole.json()).toMatchObject({
      key: "event-planner",
      capabilityKeys: ["events.manage"],
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json()).toMatchObject({
      roleKey: "event-planner",
      fir: { icaoCode: "EKDK" },
    });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toMatchObject({
      items: [
        {
          cid: "10000002",
          effectiveCapabilities: [
            {
              capabilityKey: "events.manage",
              global: false,
              firIcaoCodes: ["EKDK"],
            },
          ],
        },
      ],
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(revoked.statusCode).toBe(204);
    expect(deleted.statusCode).toBe(204);
    expect(overview.statusCode).toBe(200);
    expect(
      overview
        .json<{
          recentAuditRecords: Array<{ action: string }>;
        }>()
        .recentAuditRecords.map((record) => record.action),
    ).toEqual([
      "authorization.role.deleted",
      "authorization.assignment.revoked",
      "authorization.assignment.created",
      "authorization.role.created",
    ]);
  });
});
