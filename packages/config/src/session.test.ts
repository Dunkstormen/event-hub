import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_TTL_SECONDS,
  LOCAL_SESSION_COOKIE_NAME,
  parseSessionConfiguration,
  PRODUCTION_SESSION_COOKIE_NAME,
} from "./session.js";

describe("parseSessionConfiguration", () => {
  it("uses a local HTTP-compatible cookie outside production", () => {
    expect(parseSessionConfiguration({ NODE_ENV: "development" })).toEqual({
      cookieName: LOCAL_SESSION_COOKIE_NAME,
      cookieSecure: false,
      ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    });
  });

  it("uses a secure host-only cookie in production", () => {
    expect(parseSessionConfiguration({ NODE_ENV: "production" })).toEqual({
      cookieName: PRODUCTION_SESSION_COOKIE_NAME,
      cookieSecure: true,
      ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    });
  });

  it("fails secure when the runtime mode is missing or non-local", () => {
    expect(parseSessionConfiguration({})).toMatchObject({
      cookieName: PRODUCTION_SESSION_COOKIE_NAME,
      cookieSecure: true,
    });
    expect(
      parseSessionConfiguration({ NODE_ENV: "staging" }),
    ).toMatchObject({
      cookieName: PRODUCTION_SESSION_COOKIE_NAME,
      cookieSecure: true,
    });
  });

  it("accepts an explicitly bounded session lifetime", () => {
    expect(
      parseSessionConfiguration({
        NODE_ENV: "production",
        SESSION_TTL_SECONDS: "3600",
      }).ttlSeconds,
    ).toBe(3600);
  });

  it.each(["299", "604801", "1.5", "forever"])(
    "rejects an unsafe session lifetime of %s",
    (ttlSeconds) => {
      expect(() =>
        parseSessionConfiguration({ SESSION_TTL_SECONDS: ttlSeconds }),
      ).toThrow("SESSION_TTL_SECONDS");
    },
  );
});
