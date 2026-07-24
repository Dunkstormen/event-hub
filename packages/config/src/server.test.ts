import { describe, expect, it } from "vitest";

import { parsePort } from "./server.js";

describe("parsePort", () => {
  it("uses the fallback for a missing value", () => {
    expect(parsePort(undefined, 4000)).toBe(4000);
  });

  it("parses a valid configured port", () => {
    expect(parsePort("4100", 4000)).toBe(4100);
  });

  it("rejects values outside the TCP port range", () => {
    expect(() => parsePort("70000", 4000)).toThrow("Invalid port");
  });
});
