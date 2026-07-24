import { describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl, requireTestDatabaseUrl } from "./testing.js";
import { parseMySqlDatabaseUrl } from "./url.js";

describe("database URL validation", () => {
  it("parses a MySQL connection URL", () => {
    expect(
      parseMySqlDatabaseUrl(
        "mysql://event_hub:secret@database.internal:3307/event_hub",
      ),
    ).toEqual({
      databaseName: "event_hub",
      hostname: "database.internal",
      port: 3307,
    });
  });

  it("rejects non-MySQL URLs and incomplete URLs", () => {
    expect(() =>
      parseMySqlDatabaseUrl("postgresql://user:secret@localhost/event_hub"),
    ).toThrow("mysql://");
    expect(() =>
      parseMySqlDatabaseUrl("mysql://user:secret@localhost"),
    ).toThrow("database name");
  });
});

describe("test database isolation", () => {
  it("accepts only an explicitly named test database", () => {
    const value =
      "mysql://event_hub_test:secret@127.0.0.1:3307/event_hub_test";

    expect(assertSafeTestDatabaseUrl(value)).toBe(value);
    expect(() =>
      assertSafeTestDatabaseUrl(
        "mysql://event_hub:secret@127.0.0.1:3306/event_hub",
      ),
    ).toThrow("not explicitly named as a test database");
  });

  it("never falls back to DATABASE_URL for test operations", () => {
    expect(() =>
      requireTestDatabaseUrl({
        DATABASE_URL:
          "mysql://event_hub:secret@127.0.0.1:3306/event_hub",
      }),
    ).toThrow("TEST_DATABASE_URL is required");
  });
});
