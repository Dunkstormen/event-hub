import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionConfiguration } from "@event-hub/config/session";
import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";
import {
  createDatabaseClient,
  seedAuthorizationModel,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { OAuthTransactionManager } from "./oauth-transaction.js";
import { createIdentitySessionRepository } from "./repository.js";
import { SessionService } from "./session-service.js";
import { VatsimAuthenticationService } from "./vatsim-authentication.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const sessionConfiguration: SessionConfiguration = {
  cookieName: "event_hub_id",
  cookieSecure: false,
  ttlSeconds: 3600,
};
const connectConfiguration: VatsimConnectConfiguration = {
  baseUrl: "https://auth-dev.vatsim.test",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:4000/v1/auth/vatsim/callback",
  successRedirectUri: "http://localhost:3000",
  transactionCookieName: "event_hub_vatsim_oauth",
  transactionCookieSecure: false,
  transactionTtlSeconds: 600,
  requestTimeoutMs: 10_000,
};
const sessionService = new SessionService(
  createIdentitySessionRepository(database),
  {
    ttlSeconds: sessionConfiguration.ttlSeconds,
    now: () => new Date("2026-07-26T08:00:00.000Z"),
    tokenFactory: () => "S".repeat(43),
  },
);
const vatsimAuthentication = new VatsimAuthenticationService(
  {
    createAuthorizationUrl: (state) =>
      `https://auth-dev.vatsim.test/oauth/authorize?state=${state}`,
    async authenticateCode() {
      return {
        cid: "1234567",
        displayName: "Ada Lovelace",
        givenName: "Ada",
        familyName: "Lovelace",
        email: "ada@example.test",
        synchronizedAt: new Date("2026-07-26T08:00:00.000Z"),
      };
    },
  },
  sessionService,
  new OAuthTransactionManager({
    randomValueFactory: (() => {
      const values = ["A".repeat(43), "B".repeat(43)];
      return () => values.shift() ?? "C".repeat(43);
    })(),
  }),
);
const app = buildApp({
  sessionConfiguration,
  sessionLifecycle: sessionService,
  vatsimAuthentication,
  vatsimConnectConfiguration: connectConfiguration,
});

async function clearIdentityState() {
  await database.session.deleteMany();
  await database.externalIdentity.deleteMany();
  await database.firMembership.deleteMany();
  await database.user.deleteMany();
}

beforeAll(async () => {
  await clearIdentityState();
  await seedAuthorizationModel(database);
});

afterAll(async () => {
  try {
    await app.close();
    await clearIdentityState();
  } finally {
    await database.$disconnect();
  }
});

describe("VATSIM authentication callback", () => {
  it("creates a normalized user and digest-only session", async () => {
    const started = await app.inject({
      method: "GET",
      url: "/v1/auth/vatsim",
    });
    const transactionCookie = started.cookies.find(
      (cookie) => cookie.name === "event_hub_vatsim_oauth",
    );
    const providerState = new URL(
      started.headers.location ?? "",
    ).searchParams.get("state");

    expect(transactionCookie).toBeDefined();
    expect(providerState).not.toBeNull();

    const completed = await app.inject({
      method: "GET",
      url: `/v1/auth/vatsim/callback?code=provider-code&state=${providerState ?? ""}`,
      headers: {
        cookie: `event_hub_vatsim_oauth=${transactionCookie?.value ?? ""}`,
      },
    });
    const sessionCookie = completed.cookies.find(
      (cookie) => cookie.name === "event_hub_id",
    );
    const user = await database.user.findUniqueOrThrow({
      where: { cid: "1234567" },
      include: { identities: true, sessions: true },
    });

    expect(completed.statusCode).toBe(302);
    expect(completed.headers.location).toBe("http://localhost:3000");
    expect(sessionCookie?.value).toBe("S".repeat(43));
    expect(user.identities).toEqual([
      expect.objectContaining({
        provider: "vatsim",
        subject: "1234567",
        displayName: "Ada Lovelace",
        email: "ada@example.test",
      }),
    ]);
    expect(user.sessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(user.sessions[0]?.tokenHash).not.toBe(sessionCookie?.value);

    const authenticated = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `event_hub_id=${sessionCookie?.value ?? ""}`,
      },
    });

    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json()).toEqual({
      user: {
        cid: "1234567",
        displayName: "Ada Lovelace",
      },
      expiresAt: "2026-07-26T09:00:00.000Z",
    });
  });
});
