import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { AuthorizationPolicy } from "../authorization/policy.js";
import { createAuditAdministration } from "./administration.js";
import { appendAuditRecord } from "./service.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const administration = createAuditAdministration(database);
const apps: ReturnType<typeof buildApp>[] = [];
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;
const sessionToken = "A".repeat(43);

async function clearState() {
  await database.session.deleteMany();
  await database.auditRecord.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.firMembership.deleteMany();
  await database.userRoleAssignment.deleteMany();
  await database.roleCapability.deleteMany();
  await database.role.deleteMany();
  await database.capability.deleteMany();
  await database.user.deleteMany();
}

async function buildAuthorizedApp(actorUserId: string) {
  const app = buildApp({
    auditAdministration: administration,
    authorizationPolicy: new AuthorizationPolicy(database),
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

describe("audit administration routes", () => {
  it("requires an administrator", async () => {
    const user = await database.user.create({ data: { cid: "10000002" } });
    const app = await buildAuthorizedApp(user.id);
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/audit",
      headers: { cookie: `event_hub_id=${sessionToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("filters, paginates, and returns complete audit evidence", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });

    await database.$transaction(async (transaction) => {
      await appendAuditRecord(transaction, {
        actorUserId: actor.id,
        action: "authorization.role.created",
        targetKind: "role",
        targetKey: "event-planner",
        summary: "Created role Event Planner.",
        afterState: {
          key: "event-planner",
          capabilityKeys: ["events.manage"],
        },
      });
      await appendAuditRecord(transaction, {
        actorUserId: actor.id,
        action: "fir-membership.revoked",
        targetKind: "fir-membership",
        targetKey: "10000002:EKDK",
        summary: "Revoked CID 10000002 membership in EKDK.",
        beforeState: { status: "active" },
        afterState: { status: "revoked" },
      });
    });

    const app = await buildAuthorizedApp(actor.id);
    const headers = { cookie: `event_hub_id=${sessionToken}` };
    const filtered = await app.inject({
      method: "GET",
      url: "/v1/admin/audit?targetKind=fir-membership&q=EKDK",
      headers,
    });
    const firstPage = await app.inject({
      method: "GET",
      url: "/v1/admin/audit?limit=1",
      headers,
    });
    const firstBody = firstPage.json<{
      items: Array<{ id: string }>;
      pageInfo: { hasNextPage: boolean; nextCursor: string };
    }>();
    const secondPage = await app.inject({
      method: "GET",
      url: `/v1/admin/audit?limit=1&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor)}`,
      headers,
    });

    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toMatchObject({
      items: [
        {
          action: "fir-membership.revoked",
          actor: { cid: "10000001" },
          targetKind: "fir-membership",
          targetKey: "10000002:EKDK",
          beforeState: { status: "active" },
          afterState: { status: "revoked" },
        },
      ],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstBody.pageInfo.hasNextPage).toBe(true);
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json<{ items: Array<{ id: string }> }>().items[0]?.id)
      .not.toBe(firstBody.items[0]?.id);
  });

  it("does not expose edit or delete operations", async () => {
    const actor = await database.user.findUniqueOrThrow({
      where: { cid: "10000001" },
    });
    const app = await buildAuthorizedApp(actor.id);
    const headers = { cookie: `event_hub_id=${sessionToken}` };

    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/admin/audit/example",
      headers,
      payload: { summary: "rewritten" },
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/admin/audit/example",
      headers,
    });

    expect(patched.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
  });
});
