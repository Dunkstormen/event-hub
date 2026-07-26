import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionConfiguration } from "@event-hub/config/session";
import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";

import { buildApp } from "../app.js";
import { InvalidOAuthTransactionError } from "./oauth-transaction.js";
import { DisabledUserError } from "./session-service.js";
import type { VatsimAuthenticationFlow } from "./vatsim-authentication.js";
import { VatsimConnectProviderError } from "./vatsim-connect-client.js";

const apps: ReturnType<typeof buildApp>[] = [];
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
const transaction = `${"A".repeat(43)}.${"B".repeat(43)}`;

function createFlow(
  overrides: Partial<VatsimAuthenticationFlow> = {},
): VatsimAuthenticationFlow {
  return {
    begin: vi.fn(() => ({
      authorizationUrl:
        "https://auth-dev.vatsim.test/oauth/authorize?state=transaction",
      transactionCookieValue: transaction,
    })),
    complete: vi.fn(async () => ({
      token: "S".repeat(43),
      expiresAt: new Date("2026-07-26T16:00:00.000Z"),
    })),
    ...overrides,
  };
}

function cookieHeaders(
  value: string | string[] | undefined,
): string[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("VATSIM authentication routes", () => {
  it("starts sign-in with a short-lived HTTP-only transaction cookie", async () => {
    const flow = createFlow();
    const app = buildApp({
      sessionConfiguration,
      vatsimAuthentication: flow,
      vatsimConnectConfiguration: connectConfiguration,
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/vatsim",
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      "https://auth-dev.vatsim.test/oauth/authorize?state=transaction",
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toContain(
      `event_hub_vatsim_oauth=${transaction}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`,
    );
  });

  it("creates the Event Hub session and consumes the transaction", async () => {
    const complete = vi.fn(async () => ({
      token: "S".repeat(43),
      expiresAt: new Date("2026-07-26T16:00:00.000Z"),
    }));
    const app = buildApp({
      sessionConfiguration,
      vatsimAuthentication: createFlow({ complete }),
      vatsimConnectConfiguration: connectConfiguration,
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/v1/auth/vatsim/callback?code=provider-code&state=${transaction}`,
      headers: {
        cookie: `event_hub_vatsim_oauth=${transaction}`,
      },
    });
    const cookies = cookieHeaders(response.headers["set-cookie"]);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3000");
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "event_hub_vatsim_oauth=; Max-Age=0;",
        ),
        "event_hub_id=SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS; Path=/; HttpOnly; SameSite=Lax",
      ]),
    );
    expect(complete).toHaveBeenCalledWith({
      code: "provider-code",
      providerState: transaction,
      transactionCookieValue: transaction,
    });
  });

  it.each([
    {
      name: "an invalid transaction",
      error: new InvalidOAuthTransactionError(),
      statusCode: 400,
      message: "expired or could not be verified",
    },
    {
      name: "a disabled account",
      error: new DisabledUserError(),
      statusCode: 403,
      message: "account is disabled",
    },
    {
      name: "a provider failure",
      error: new VatsimConnectProviderError(),
      statusCode: 502,
      message: "could not complete sign-in",
    },
  ])(
    "returns a non-sensitive error for $name",
    async ({ error, statusCode, message }) => {
      const app = buildApp({
        sessionConfiguration,
        vatsimAuthentication: createFlow({
          complete: vi.fn(async () => {
            throw error;
          }),
        }),
        vatsimConnectConfiguration: connectConfiguration,
      });
      apps.push(app);

      const response = await app.inject({
        method: "GET",
        url: `/v1/auth/vatsim/callback?code=provider-code&state=${transaction}`,
        headers: {
          cookie: `event_hub_vatsim_oauth=${transaction}`,
        },
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toMatchObject({
        error: {
          message: expect.stringContaining(message),
        },
      });
      expect(JSON.stringify(response.json())).not.toContain(
        "provider-code",
      );
    },
  );

  it("handles provider denial and missing configuration explicitly", async () => {
    const configured = buildApp({
      sessionConfiguration,
      vatsimAuthentication: createFlow(),
      vatsimConnectConfiguration: connectConfiguration,
    });
    const unavailable = buildApp({
      sessionConfiguration,
      vatsimAuthentication: null,
      vatsimConnectConfiguration: null,
    });
    apps.push(configured, unavailable);

    const denied = await configured.inject({
      method: "GET",
      url: "/v1/auth/vatsim/callback?error=access_denied&error_description=secret",
      headers: {
        cookie: `event_hub_vatsim_oauth=${transaction}`,
      },
    });
    const notConfigured = await unavailable.inject({
      method: "GET",
      url: "/v1/auth/vatsim",
    });

    expect(denied.statusCode).toBe(400);
    expect(JSON.stringify(denied.json())).not.toContain("secret");
    expect(denied.headers["set-cookie"]).toContain(
      "event_hub_vatsim_oauth=; Max-Age=0;",
    );
    expect(notConfigured.statusCode).toBe(503);
    expect(notConfigured.json()).toMatchObject({
      error: {
        message: "VATSIM Connect is not configured.",
      },
    });
  });
});
