import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS,
  DEFAULT_CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS,
  DEFAULT_VATEUD_API_BASE_URL,
  parseControllerEligibilityConfiguration,
} from "./controller-eligibility.js";

describe("parseControllerEligibilityConfiguration", () => {
  it("keeps both integrations disabled without credentials", () => {
    expect(parseControllerEligibilityConfiguration({})).toEqual({
      controlCenter: null,
      freshnessSeconds:
        DEFAULT_CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS,
      requestTimeoutMs: 10_000,
      syncIntervalSeconds:
        DEFAULT_CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS,
      vateud: null,
    });
  });

  it("requires an explicit Control Center URL and defaults VATEUD", () => {
    expect(
      parseControllerEligibilityConfiguration({
        CONTROL_CENTER_API_BASE_URL:
          "https://control.example.test/api",
        CONTROL_CENTER_API_KEY: "control-key",
        VATEUD_API_KEY: "vateud-key",
      }),
    ).toMatchObject({
      controlCenter: {
        apiKey: "control-key",
        baseUrl: "https://control.example.test/api",
      },
      vateud: {
        apiKey: "vateud-key",
        baseUrl: DEFAULT_VATEUD_API_BASE_URL,
      },
    });
  });

  it("rejects partial, insecure, and unsafe provider configuration", () => {
    expect(() =>
      parseControllerEligibilityConfiguration({
        CONTROL_CENTER_API_KEY: "control-key",
      }),
    ).toThrow("CONTROL_CENTER_API_BASE_URL");
    expect(() =>
      parseControllerEligibilityConfiguration({
        VATEUD_API_BASE_URL: "https://core.vateud.net/api",
      }),
    ).toThrow("VATEUD_API_KEY");
    expect(() =>
      parseControllerEligibilityConfiguration({
        VATEUD_API_BASE_URL: "http://core.vateud.net/api",
        VATEUD_API_KEY: "vateud-key",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      parseControllerEligibilityConfiguration({
        VATEUD_API_BASE_URL:
          "https://user:secret@core.vateud.net/api",
        VATEUD_API_KEY: "vateud-key",
      }),
    ).toThrow("without credentials");
  });

  it("requires freshness to cover the synchronization interval", () => {
    expect(() =>
      parseControllerEligibilityConfiguration({
        CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS: "300",
        CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS: "600",
      }),
    ).toThrow("greater than or equal");
  });
});
