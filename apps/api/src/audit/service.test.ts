import { describe, expect, it } from "vitest";

import {
  AuditRecordInputError,
  assertSafeAuditSnapshot,
} from "./service.js";

describe("audit snapshot safety", () => {
  it("accepts nested domain state", () => {
    expect(() =>
      assertSafeAuditSnapshot({
        role: { key: "event-coordinator", capabilities: ["events.manage"] },
        active: true,
      }),
    ).not.toThrow();
  });

  it.each([
    { token: "raw-token" },
    { provider: { access_token: "raw-token" } },
    { headers: { Authorization: "Bearer raw-token" } },
    { credentials: [{ clientSecret: "raw-secret" }] },
  ])("rejects sensitive values at any depth", (snapshot) => {
    expect(() => assertSafeAuditSnapshot(snapshot)).toThrow(
      AuditRecordInputError,
    );
  });
});
