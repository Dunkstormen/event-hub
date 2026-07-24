import { describe, expect, it } from "vitest";

import { API_VERSION } from "./index.js";

describe("API version", () => {
  it("starts with the v1 contract boundary", () => {
    expect(API_VERSION).toBe("v1");
  });
});
