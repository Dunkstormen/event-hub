import { describe, expect, it } from "vitest";

import {
  LOCAL_WEB_ORIGIN,
  parseWebOrigin,
} from "./web-origin.js";

describe("parseWebOrigin", () => {
  it("uses the local web application during development", () => {
    expect(parseWebOrigin({ NODE_ENV: "development" })).toBe(
      LOCAL_WEB_ORIGIN,
    );
  });

  it("accepts one exact HTTPS production origin", () => {
    expect(
      parseWebOrigin({
        NODE_ENV: "production",
        WEB_ORIGIN: "https://events.example.com",
      }),
    ).toBe("https://events.example.com");
  });

  it.each([
    "http://events.example.com",
    "https://events.example.com/admin",
    "https://user:secret@events.example.com",
  ])("rejects an unsafe production origin of %s", (origin) => {
    expect(() =>
      parseWebOrigin({
        NODE_ENV: "production",
        WEB_ORIGIN: origin,
      }),
    ).toThrow("WEB_ORIGIN");
  });

  it("requires an explicit production origin", () => {
    expect(() =>
      parseWebOrigin({ NODE_ENV: "production" }),
    ).toThrow("required");
  });
});
