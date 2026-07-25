import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LOCAL_SESSION_COOKIE_NAME,
  type SessionConfiguration,
} from "@event-hub/config/session";
import { createDatabaseClient } from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createIdentitySessionRepository } from "./repository.js";
import { SessionService } from "./session-service.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const sessionConfiguration: SessionConfiguration = {
  cookieName: LOCAL_SESSION_COOKIE_NAME,
  cookieSecure: false,
  ttlSeconds: 3600,
};
const sessionService = new SessionService(
  createIdentitySessionRepository(database),
  {
    ttlSeconds: sessionConfiguration.ttlSeconds,
    now: () => new Date("2026-07-25T12:00:00.000Z"),
    tokenFactory: () => "A".repeat(43),
  },
);
const app = buildApp({
  sessionConfiguration,
  sessionLifecycle: sessionService,
});
let identityStatePrepared = false;

async function clearIdentityState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.user.deleteMany();
}

beforeAll(async () => {
  await clearIdentityState();
  identityStatePrepared = true;
});

afterAll(async () => {
  try {
    await app.close();

    if (identityStatePrepared) {
      await clearIdentityState();
    }
  } finally {
    await database.$disconnect();
  }
});

describe("identity and session persistence", () => {
  it("normalizes a VATSIM identity and stores only a session digest", async () => {
    const user = await sessionService.synchronizeVatsimIdentity({
      cid: "1234567",
      displayName: "Ada Lovelace",
      givenName: "Ada",
      familyName: "Lovelace",
      email: "ada@example.test",
      synchronizedAt: new Date("2026-07-25T11:55:00.000Z"),
    });
    const session = await sessionService.createSession(user.id);
    const storedIdentity = await database.externalIdentity.findUniqueOrThrow({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "vatsim",
        },
      },
    });
    const storedSession = await database.session.findFirstOrThrow({
      where: { userId: user.id },
    });

    expect(user).toMatchObject({
      cid: "1234567",
      status: "ACTIVE",
      displayName: "Ada Lovelace",
    });
    expect(storedIdentity).toMatchObject({
      provider: "vatsim",
      subject: "1234567",
      displayName: "Ada Lovelace",
      givenName: "Ada",
      familyName: "Lovelace",
      email: "ada@example.test",
      lastSyncedAt: new Date("2026-07-25T11:55:00.000Z"),
    });
    expect(storedSession.tokenHash).not.toBe(session.token);
    expect(storedSession.tokenHash).toMatch(/^[a-f0-9]{64}$/u);

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `${LOCAL_SESSION_COOKIE_NAME}=${session.token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        cid: "1234567",
        displayName: "Ada Lovelace",
      },
      expiresAt: "2026-07-25T13:00:00.000Z",
    });
  });

  it("updates normalized identity data without replacing the user", async () => {
    const existingUser = await database.user.findUniqueOrThrow({
      where: { cid: "1234567" },
    });
    const synchronizedUser = await sessionService.synchronizeVatsimIdentity({
      cid: "1234567",
      displayName: "Ada Byron",
      givenName: "Ada",
      familyName: "Byron",
      email: "ada.byron@example.test",
      synchronizedAt: new Date("2026-07-25T11:59:00.000Z"),
    });
    const storedIdentity = await database.externalIdentity.findUniqueOrThrow({
      where: {
        userId_provider: {
          userId: existingUser.id,
          provider: "vatsim",
        },
      },
    });

    expect(synchronizedUser.id).toBe(existingUser.id);
    expect(await database.user.count({ where: { cid: "1234567" } })).toBe(1);
    expect(storedIdentity).toMatchObject({
      displayName: "Ada Byron",
      familyName: "Byron",
      email: "ada.byron@example.test",
      lastSyncedAt: new Date("2026-07-25T11:59:00.000Z"),
    });
  });

  it("fails closed and revokes access after the account is disabled", async () => {
    const user = await database.user.findUniqueOrThrow({
      where: { cid: "1234567" },
    });
    const storedSession = await database.session.findFirstOrThrow({
      where: { userId: user.id },
    });

    await database.user.update({
      where: { id: user.id },
      data: { status: "DISABLED" },
    });
    const synchronizedUser =
      await sessionService.synchronizeVatsimIdentity({
        cid: "1234567",
        displayName: "Ada Byron",
        synchronizedAt: new Date("2026-07-25T12:00:00.000Z"),
      });

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `${LOCAL_SESSION_COOKIE_NAME}=${"A".repeat(43)}`,
      },
    });
    const revokedSession = await database.session.findUniqueOrThrow({
      where: { id: storedSession.id },
    });

    expect(response.statusCode).toBe(401);
    expect(synchronizedUser.status).toBe("DISABLED");
    expect(revokedSession.revokedAt).toEqual(
      new Date("2026-07-25T12:00:00.000Z"),
    );
    await expect(sessionService.createSession(user.id)).rejects.toThrow(
      "Disabled users cannot create sessions.",
    );
  });
});
