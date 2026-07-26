import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";

import { setVatsimTransactionCookie } from "./vatsim-cookie.js";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("VATSIM transaction cookie", () => {
  it.each([
    {
      environment: "local",
      cookieName: "event_hub_vatsim_oauth",
      secure: false,
      expected:
        "event_hub_vatsim_oauth=state.nonce; Max-Age=600; Path=/; HttpOnly; SameSite=Lax",
    },
    {
      environment: "production",
      cookieName: "__Host-vatsim-oauth",
      secure: true,
      expected:
        "__Host-vatsim-oauth=state.nonce; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax",
    },
  ])(
    "sets bounded, host-only $environment defaults",
    async ({ cookieName, secure, expected }) => {
      const configuration: VatsimConnectConfiguration = {
        baseUrl: "https://auth.vatsim.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri:
          "https://api.example.test/v1/auth/vatsim/callback",
        successRedirectUri: "https://events.example.test",
        transactionCookieName: cookieName,
        transactionCookieSecure: secure,
        transactionTtlSeconds: 600,
        requestTimeoutMs: 10_000,
      };
      const app = Fastify();
      apps.push(app);
      app.register(cookie);
      app.get("/", async (_request, reply) => {
        setVatsimTransactionCookie(
          reply,
          "state.nonce",
          configuration,
        );
        return { status: "ok" };
      });

      const response = await app.inject({ method: "GET", url: "/" });

      expect(response.headers["set-cookie"]).toBe(expected);
    },
  );
});
