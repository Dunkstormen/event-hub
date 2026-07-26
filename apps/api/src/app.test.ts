import { Value } from "@sinclair/typebox/value";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiErrorResponseSchema } from "@event-hub/contracts";

import { buildApp } from "./app.js";
import type { SessionLifecycle } from "./auth/routes.js";
import type { ReferenceDataRepository } from "./reference-data/repository.js";

const apps: ReturnType<typeof buildApp>[] = [];

function createRepository(
  overrides: Partial<ReferenceDataRepository> = {},
): ReferenceDataRepository {
  return {
    listFirs: vi.fn(async () => ({ items: [], hasNextPage: false })),
    findFir: vi.fn(async () => null),
    listAirports: vi.fn(async () => ({ items: [], hasNextPage: false })),
    findAirport: vi.fn(async () => null),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("health endpoint", () => {
  it("allows credentialed browser requests only from the configured web origin", async () => {
    const app = buildApp({
      webOrigin: "https://events.example.com",
    });
    apps.push(app);

    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/v1/health",
      headers: {
        origin: "https://events.example.com",
        "access-control-request-method": "PUT",
      },
    });
    const untrusted = await app.inject({
      method: "OPTIONS",
      url: "/v1/health",
      headers: {
        origin: "https://untrusted.example.com",
        "access-control-request-method": "GET",
      },
    });

    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://events.example.com",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe(
      "true",
    );
    expect(allowed.headers["access-control-allow-methods"]).toContain(
      "PUT",
    );
    expect(untrusted.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reports the API service and contract version", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "event-hub-api",
      version: "v1",
    });
  });

  it("returns the standard envelope for validation errors", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/health?unexpected=true",
    });
    const body: unknown = response.json();

    expect(response.statusCode).toBe(400);
    expect(Value.Check(ApiErrorResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request did not match the API contract.",
        details: [
          {
            path: "/querystring/unexpected",
            code: "additionalProperties",
          },
        ],
      },
    });
  });

  it("returns the standard envelope for missing routes", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });
    const body: unknown = response.json();

    expect(response.statusCode).toBe(404);
    expect(Value.Check(ApiErrorResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found.",
      },
    });
  });
});

describe("reference-data endpoints", () => {
  it("searches FIRs and returns an opaque next cursor", async () => {
    const listFirs = vi.fn(async () => ({
      items: [
        {
          icaoCode: "EKDK",
          name: "Copenhagen FIR",
          active: true,
        },
      ],
      hasNextPage: true,
    }));
    const app = buildApp({
      referenceDataRepository: createRepository({ listFirs }),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/firs?q=cope&active=true&limit=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          icaoCode: "EKDK",
          name: "Copenhagen FIR",
          active: true,
        },
      ],
      pageInfo: {
        hasNextPage: true,
        nextCursor: "RUtESw",
      },
    });
    expect(listFirs).toHaveBeenCalledWith({
      query: "cope",
      active: true,
      limit: 1,
    });
  });

  it("decodes cursors and filters airports by FIR", async () => {
    const listAirports = vi.fn(async () => ({
      items: [],
      hasNextPage: false,
    }));
    const app = buildApp({
      referenceDataRepository: createRepository({ listAirports }),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/airports?firIcaoCode=EKDK&cursor=RUtDSA",
    });

    expect(response.statusCode).toBe(200);
    expect(listAirports).toHaveBeenCalledWith({
      firIcaoCode: "EKDK",
      afterIcaoCode: "EKCH",
      limit: 25,
    });
  });

  it("rejects malformed cursors with the standard error envelope", async () => {
    const app = buildApp({
      referenceDataRepository: createRepository(),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/firs?cursor=not-a-cursor",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "The pagination cursor is invalid.",
      },
    });
  });

  it("returns canonical detail records and a typed not-found error", async () => {
    const app = buildApp({
      referenceDataRepository: createRepository({
        findAirport: vi.fn(async (icaoCode) =>
          icaoCode === "EKCH"
            ? {
                icaoCode: "EKCH",
                name: "Copenhagen/Kastrup",
                active: true,
                fir: {
                  icaoCode: "EKDK",
                  name: "Copenhagen FIR",
                },
              }
            : null,
        ),
      }),
    });
    apps.push(app);

    const found = await app.inject({
      method: "GET",
      url: "/v1/airports/EKCH",
    });
    const missing = await app.inject({
      method: "GET",
      url: "/v1/airports/ESSA",
    });

    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({
      icaoCode: "EKCH",
      fir: { icaoCode: "EKDK" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Airport not found.",
      },
    });
  });

  it("rejects lowercase ICAO codes and unsupported filters", async () => {
    const app = buildApp({
      referenceDataRepository: createRepository(),
    });
    apps.push(app);

    const lowercase = await app.inject({
      method: "GET",
      url: "/v1/firs/ekdk",
    });
    const unsupported = await app.inject({
      method: "GET",
      url: "/v1/airports?country=DK",
    });

    expect(lowercase.statusCode).toBe(400);
    expect(unsupported.statusCode).toBe(400);
  });
});

describe("session endpoints", () => {
  const sessionConfiguration = {
    cookieName: "event_hub_id",
    cookieSecure: false,
    ttlSeconds: 3600,
  } as const;

  it("returns only the normalized current identity", async () => {
    const authenticateSession = vi.fn(async () => ({
      user: {
        cid: "1234567",
        displayName: "Ada Lovelace",
      },
      expiresAt: "2026-07-25T13:00:00.000Z",
    }));
    const sessionLifecycle: SessionLifecycle = {
      authenticateSession,
      revokeSession: vi.fn(async () => {}),
    };
    const app = buildApp({ sessionConfiguration, sessionLifecycle });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `event_hub_id=${"A".repeat(43)}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      user: {
        cid: "1234567",
        displayName: "Ada Lovelace",
      },
      expiresAt: "2026-07-25T13:00:00.000Z",
    });
    expect(authenticateSession).toHaveBeenCalledWith("A".repeat(43));
  });

  it("rejects and clears an invalid or expired session", async () => {
    const app = buildApp({
      sessionConfiguration,
      sessionLifecycle: {
        authenticateSession: vi.fn(async () => null),
        revokeSession: vi.fn(async () => {}),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `event_hub_id=${"A".repeat(43)}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "AUTHENTICATION_REQUIRED",
      },
    });
    expect(response.headers["set-cookie"]).toContain(
      "event_hub_id=; Max-Age=0;",
    );
    expect(response.headers["set-cookie"]).toContain(
      "Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    );
  });

  it("revokes the server session and clears its cookie on logout", async () => {
    const revokeSession = vi.fn(async () => {});
    const app = buildApp({
      sessionConfiguration,
      sessionLifecycle: {
        authenticateSession: vi.fn(async () => null),
        revokeSession,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/auth/session",
      headers: {
        cookie: `event_hub_id=${"A".repeat(43)}`,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toContain(
      "event_hub_id=; Max-Age=0;",
    );
    expect(response.headers["set-cookie"]).toContain(
      "Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
    );
    expect(revokeSession).toHaveBeenCalledWith("A".repeat(43));
  });
});
