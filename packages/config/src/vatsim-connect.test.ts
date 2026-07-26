import { describe, expect, it } from "vitest";

import {
  LOCAL_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME,
  parseVatsimConnectConfiguration,
  PRODUCTION_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME,
} from "./vatsim-connect.js";

const localEnvironment = {
  NODE_ENV: "development",
  VATSIM_CONNECT_CLIENT_ID: "client-id",
  VATSIM_CONNECT_CLIENT_SECRET: "client-secret",
  VATSIM_CONNECT_REDIRECT_URI:
    "http://localhost:4000/v1/auth/vatsim/callback",
} as const;

describe("parseVatsimConnectConfiguration", () => {
  it("leaves the integration disabled when no credentials are supplied", () => {
    expect(
      parseVatsimConnectConfiguration({ NODE_ENV: "development" }),
    ).toBeNull();
  });

  it("uses sandbox and localhost-safe defaults in development", () => {
    expect(parseVatsimConnectConfiguration(localEnvironment)).toEqual({
      baseUrl: "https://auth-dev.vatsim.net",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri:
        "http://localhost:4000/v1/auth/vatsim/callback",
      successRedirectUri: "http://localhost:3000",
      transactionCookieName:
        LOCAL_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME,
      transactionCookieSecure: false,
      transactionTtlSeconds: 600,
      requestTimeoutMs: 10_000,
    });
  });

  it("uses secure production defaults", () => {
    expect(
      parseVatsimConnectConfiguration({
        NODE_ENV: "production",
        VATSIM_CONNECT_CLIENT_ID: "client-id",
        VATSIM_CONNECT_CLIENT_SECRET: "client-secret",
        VATSIM_CONNECT_REDIRECT_URI:
          "https://api.example.test/v1/auth/vatsim/callback",
        VATSIM_CONNECT_SUCCESS_REDIRECT_URI:
          "https://events.example.test",
      }),
    ).toMatchObject({
      baseUrl: "https://auth.vatsim.net",
      transactionCookieName:
        PRODUCTION_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME,
      transactionCookieSecure: true,
    });
  });

  it("rejects partial credentials and insecure production redirects", () => {
    expect(() =>
      parseVatsimConnectConfiguration({
        NODE_ENV: "development",
        VATSIM_CONNECT_CLIENT_ID: "client-id",
      }),
    ).toThrow("VATSIM_CONNECT_REDIRECT_URI");

    expect(() =>
      parseVatsimConnectConfiguration({
        NODE_ENV: "production",
        VATSIM_CONNECT_CLIENT_ID: "client-id",
        VATSIM_CONNECT_CLIENT_SECRET: "client-secret",
        VATSIM_CONNECT_REDIRECT_URI:
          "http://api.example.test/v1/auth/vatsim/callback",
        VATSIM_CONNECT_SUCCESS_REDIRECT_URI:
          "https://events.example.test",
      }),
    ).toThrow("VATSIM_CONNECT_REDIRECT_URI");
  });

  it("rejects non-HTTPS provider URLs and embedded credentials", () => {
    expect(() =>
      parseVatsimConnectConfiguration({
        ...localEnvironment,
        VATSIM_CONNECT_BASE_URL: "http://auth.example.test",
      }),
    ).toThrow("HTTPS");

    expect(() =>
      parseVatsimConnectConfiguration({
        ...localEnvironment,
        VATSIM_CONNECT_BASE_URL:
          "https://user:secret@auth.example.test",
      }),
    ).toThrow("without credentials");

    expect(() =>
      parseVatsimConnectConfiguration({
        ...localEnvironment,
        VATSIM_CONNECT_BASE_URL: "https://auth.example.test/oauth",
      }),
    ).toThrow("provider origin");
  });
});
