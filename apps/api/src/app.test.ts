import { Value } from "@sinclair/typebox/value";
import { afterEach, describe, expect, it } from "vitest";

import { ApiErrorResponseSchema } from "@event-hub/contracts";

import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("health endpoint", () => {
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
