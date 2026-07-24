import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  API_PREFIX,
  API_VERSION,
  ApiErrorResponseSchema,
  DEFAULT_PAGE_SIZE,
  HealthResponseSchema,
  MAX_PAGE_SIZE,
  PaginationQuerySchema,
  listQuerySchema,
  paginatedResponseSchema,
} from "./index.js";

describe("API contracts", () => {
  it("uses the v1 URL boundary", () => {
    expect(API_VERSION).toBe("v1");
    expect(API_PREFIX).toBe("/v1");
  });

  it("validates health responses at runtime", () => {
    expect(
      Value.Check(HealthResponseSchema, {
        status: "ok",
        service: "event-hub-api",
        version: "v1",
      }),
    ).toBe(true);
    expect(
      Value.Check(HealthResponseSchema, {
        status: "ok",
        service: "event-hub-api",
        version: "v2",
      }),
    ).toBe(false);
  });

  it("enforces the common error envelope", () => {
    expect(
      Value.Check(ApiErrorResponseSchema, {
        error: {
          code: "FORBIDDEN",
          message: "You cannot manage this event.",
          requestId: "request-123",
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(ApiErrorResponseSchema, {
        code: "FORBIDDEN",
        message: "The envelope is missing.",
      }),
    ).toBe(false);
  });

  it("defines bounded cursor pagination", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(Value.Check(PaginationQuerySchema, { limit: 100 })).toBe(true);
    expect(Value.Check(PaginationQuerySchema, { limit: 101 })).toBe(false);
  });

  it("rejects filters outside an endpoint allowlist", () => {
    const schema = listQuerySchema({
      status: Type.Optional(
        Type.Union([Type.Literal("published"), Type.Literal("cancelled")]),
      ),
    });

    expect(Value.Check(schema, { status: "published" })).toBe(true);
    expect(Value.Check(schema, { status: "draft" })).toBe(false);
    expect(Value.Check(schema, { owner: "EKDK" })).toBe(false);
  });

  it("creates typed paginated response schemas", () => {
    const schema = paginatedResponseSchema(
      Type.Object({ id: Type.String() }, { additionalProperties: false }),
    );

    expect(
      Value.Check(schema, {
        items: [{ id: "event-1" }],
        pageInfo: {
          hasNextPage: false,
          nextCursor: null,
        },
      }),
    ).toBe(true);
  });
});
