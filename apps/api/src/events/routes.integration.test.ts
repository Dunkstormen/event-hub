import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  EVENT_COORDINATOR_ROLE_KEY,
  seedAuthorizationModel,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { AuthorizationPolicy } from "../authorization/policy.js";
import { createEventManagement } from "./management.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const apps: ReturnType<typeof buildApp>[] = [];
const sessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
} as const;

const draftPayload = {
  name: "Cross the Pond Nordic",
  shortDescription: "An evening of Nordic traffic.",
  description: "Fly between participating Nordic airports.",
  bannerStorageKey: "events/cross-the-pond/banner.webp",
  rosteringType: "open-interest",
  localStart: "2026-08-15T18:00:00",
  localEnd: "2026-08-15T22:00:00",
  timeZone: "Europe/Copenhagen",
  participatingFirIcaoCodes: ["EFIN"],
  participatingAirportIcaoCodes: ["EKCH", "EFHK"],
} as const;

type Actor = Readonly<{
  id: string;
  cid: string;
  displayName: string;
}>;

async function clearState() {
  await database.eventAirport.deleteMany();
  await database.eventFir.deleteMany();
  await database.event.deleteMany();
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
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

async function createUser(cid: string): Promise<Actor> {
  const user = await database.user.create({
    data: { cid },
    select: { id: true, cid: true },
  });

  return { ...user, displayName: `Controller ${cid}` };
}

async function createCoordinator(
  cid: string,
  firIcaoCode: string,
): Promise<Actor> {
  const [user, role, fir] = await Promise.all([
    createUser(cid),
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

async function buildEventApp(actors: ReadonlyMap<string, Actor>) {
  const app = buildApp({
    authorizationPolicy: new AuthorizationPolicy(database),
    authorizationSessions: {
      async authenticateActor(token) {
        return token === undefined ? null : (actors.get(token) ?? null);
      },
    },
    eventManagement: createEventManagement(database),
    sessionConfiguration,
  });
  apps.push(app);
  await app.ready();
  return app;
}

function headers(token: string) {
  return { cookie: `event_hub_id=${token}` };
}

beforeEach(async () => {
  await clearState();
  await seedReferenceData(database);
  await seedAuthorizationModel(database);
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

describe("event-management routes", () => {
  it("derives the owner from the authorized FIR scope and limits manageable reads", async () => {
    const [owner, invited, outsider] = await Promise.all([
      createCoordinator("10000001", "EKDK"),
      createCoordinator("10000002", "EFIN"),
      createUser("10000003"),
    ]);
    const app = await buildEventApp(
      new Map([
        ["owner", owner],
        ["invited", invited],
        ["outsider", outsider],
      ]),
    );

    const unauthorizedCreation = await app.inject({
      method: "POST",
      url: "/v1/firs/EKDK/events",
      headers: headers("outsider"),
      payload: draftPayload,
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/firs/EKDK/events",
      headers: headers("owner"),
      payload: draftPayload,
    });
    const event = created.json<{ id: string }>();
    const ownerList = await app.inject({
      method: "GET",
      url: "/v1/events/manageable?q=Cross",
      headers: headers("owner"),
    });
    const invitedList = await app.inject({
      method: "GET",
      url: "/v1/events/manageable?lifecycleState=draft",
      headers: headers("invited"),
    });
    const outsiderList = await app.inject({
      method: "GET",
      url: "/v1/events/manageable",
      headers: headers("outsider"),
    });
    const outsiderDetail = await app.inject({
      method: "GET",
      url: `/v1/events/${event.id}`,
      headers: headers("outsider"),
    });

    expect(unauthorizedCreation.statusCode).toBe(403);
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(created.json()).toMatchObject({
      lifecycleState: "draft",
      ownerFir: { icaoCode: "EKDK" },
      participatingFirs: [
        { icaoCode: "EFIN" },
        { icaoCode: "EKDK" },
      ],
      managementRole: "owner",
      permissions: {
        edit: true,
        transferOwnership: true,
        delete: true,
      },
      version: 1,
    });
    expect(ownerList.json()).toMatchObject({
      items: [{ id: event.id, managementRole: "owner" }],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    expect(invitedList.json()).toMatchObject({
      items: [{ id: event.id, managementRole: "collaborator" }],
    });
    expect(outsiderList.json()).toMatchObject({ items: [] });
    expect(outsiderDetail.statusCode).toBe(403);
  });

  it("allows collaborator draft edits but enforces versioned owner transfers", async () => {
    const [owner, invited] = await Promise.all([
      createCoordinator("10000001", "EKDK"),
      createCoordinator("10000002", "EFIN"),
    ]);
    const app = await buildEventApp(
      new Map([
        ["owner", owner],
        ["invited", invited],
      ]),
    );
    const created = await app.inject({
      method: "POST",
      url: "/v1/firs/EKDK/events",
      headers: headers("owner"),
      payload: draftPayload,
    });
    const event = created.json<{ id: string }>();
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/events/${event.id}`,
      headers: headers("invited"),
      payload: {
        expectedVersion: 1,
        name: "Cross the Pond Nordic 2026",
      },
    });
    const staleUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/events/${event.id}`,
      headers: headers("owner"),
      payload: { expectedVersion: 1, description: "A stale change." },
    });
    const invalidSchedule = await app.inject({
      method: "PATCH",
      url: `/v1/events/${event.id}`,
      headers: headers("owner"),
      payload: {
        expectedVersion: 2,
        localEnd: "2026-08-15T17:00:00",
      },
    });
    const invitedTransfer = await app.inject({
      method: "POST",
      url: `/v1/events/${event.id}/ownership-transfer`,
      headers: headers("invited"),
      payload: { expectedVersion: 2, targetFirIcaoCode: "EFIN" },
    });
    const transferred = await app.inject({
      method: "POST",
      url: `/v1/events/${event.id}/ownership-transfer`,
      headers: headers("owner"),
      payload: { expectedVersion: 2, targetFirIcaoCode: "EFIN" },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: "Cross the Pond Nordic 2026",
      managementRole: "collaborator",
      version: 2,
    });
    expect(staleUpdate.statusCode).toBe(409);
    expect(invalidSchedule.statusCode).toBe(400);
    expect(invitedTransfer.statusCode).toBe(403);
    expect(transferred.statusCode).toBe(200);
    expect(transferred.json()).toMatchObject({
      ownerFir: { icaoCode: "EFIN" },
      participatingFirs: [
        { icaoCode: "EFIN" },
        { icaoCode: "EKDK" },
      ],
      managementRole: "collaborator",
      version: 3,
    });
  });

  it("permits only the current owner to delete a current draft", async () => {
    const [owner, invited] = await Promise.all([
      createCoordinator("10000001", "EKDK"),
      createCoordinator("10000002", "EFIN"),
    ]);
    const app = await buildEventApp(
      new Map([
        ["owner", owner],
        ["invited", invited],
      ]),
    );
    const first = await app.inject({
      method: "POST",
      url: "/v1/firs/EKDK/events",
      headers: headers("owner"),
      payload: draftPayload,
    });
    const firstEvent = first.json<{ id: string }>();

    const collaboratorDelete = await app.inject({
      method: "DELETE",
      url: `/v1/events/${firstEvent.id}?expectedVersion=1`,
      headers: headers("invited"),
    });
    const staleDelete = await app.inject({
      method: "DELETE",
      url: `/v1/events/${firstEvent.id}?expectedVersion=2`,
      headers: headers("owner"),
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/events/${firstEvent.id}?expectedVersion=1`,
      headers: headers("owner"),
    });

    const second = await app.inject({
      method: "POST",
      url: "/v1/firs/EKDK/events",
      headers: headers("owner"),
      payload: { ...draftPayload, name: "Published event" },
    });
    const secondEvent = second.json<{ id: string; version: number }>();
    await database.event.update({
      where: { id: secondEvent.id },
      data: { lifecycleState: "PUBLISHED" },
    });
    const publishedDelete = await app.inject({
      method: "DELETE",
      url: `/v1/events/${secondEvent.id}?expectedVersion=${secondEvent.version}`,
      headers: headers("owner"),
    });

    expect(collaboratorDelete.statusCode).toBe(403);
    expect(staleDelete.statusCode).toBe(409);
    expect(deleted.statusCode).toBe(204);
    expect(await database.event.findUnique({ where: { id: firstEvent.id } })).toBeNull();
    await expect(
      database.auditRecord.findFirstOrThrow({
        where: { targetKey: firstEvent.id, action: "event.deleted" },
      }),
    ).resolves.toMatchObject({ actorUserId: owner.id });
    expect(publishedDelete.statusCode).toBe(409);
    await expect(
      database.event.findUniqueOrThrow({ where: { id: secondEvent.id } }),
    ).resolves.toMatchObject({ lifecycleState: "PUBLISHED" });
  });
});
