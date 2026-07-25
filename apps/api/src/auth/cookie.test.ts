import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
} from "@event-hub/config/session";

import { setSessionCookie } from "./cookie.js";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("session cookie", () => {
  it.each([
    {
      environment: "local",
      configuration: {
        cookieName: LOCAL_SESSION_COOKIE_NAME,
        cookieSecure: false,
        ttlSeconds: 3600,
      },
      expected:
        "event_hub_id=session-token; Path=/; HttpOnly; SameSite=Lax",
    },
    {
      environment: "production",
      configuration: {
        cookieName: PRODUCTION_SESSION_COOKIE_NAME,
        cookieSecure: true,
        ttlSeconds: 3600,
      },
      expected: "__Host-id=session-token; Path=/; HttpOnly; Secure; SameSite=Lax",
    },
  ])("sets secure $environment defaults", async ({ configuration, expected }) => {
    const app = Fastify();
    apps.push(app);
    app.register(cookie);
    app.get("/", async (_request, reply) => {
      setSessionCookie(reply, "session-token", configuration);
      return { status: "ok" };
    });

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.headers["set-cookie"]).toBe(expected);
  });
});
