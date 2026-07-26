import { describe, expect, it, vi } from "vitest";

import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";

import {
  VatsimConnectClient,
  VatsimConnectProviderError,
} from "./vatsim-connect-client.js";

const configuration: VatsimConnectConfiguration = {
  baseUrl: "https://auth-dev.vatsim.test",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:4000/v1/auth/vatsim/callback",
  successRedirectUri: "http://localhost:3000",
  transactionCookieName: "event_hub_vatsim_oauth",
  transactionCookieSecure: false,
  transactionTtlSeconds: 600,
  requestTimeoutMs: 10_000,
};

describe("VatsimConnectClient", () => {
  it("builds the documented authorization request", () => {
    const client = new VatsimConnectClient(configuration);
    const url = new URL(client.createAuthorizationUrl("state.nonce"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://auth-dev.vatsim.test/oauth/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-id",
      redirect_uri:
        "http://localhost:4000/v1/auth/vatsim/callback",
      scope: "full_name email",
      state: "state.nonce",
    });
  });

  it("exchanges the code and normalizes the user without retaining tokens", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          token_type: "Bearer",
          access_token: "provider-access-token",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            cid: "1234567",
            personal: {
              name_first: "Ada",
              name_last: "Lovelace",
              name_full: "Ada Lovelace",
              email: "ada@example.test",
            },
          },
        }),
      );
    const client = new VatsimConnectClient(configuration, {
      fetchImplementation,
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    await expect(client.authenticateCode("authorization-code")).resolves
      .toEqual({
        cid: "1234567",
        displayName: "Ada Lovelace",
        givenName: "Ada",
        familyName: "Lovelace",
        email: "ada@example.test",
        synchronizedAt: new Date("2026-07-26T08:00:00.000Z"),
      });

    const tokenRequest = fetchImplementation.mock.calls[0];
    const profileRequest = fetchImplementation.mock.calls[1];

    expect(tokenRequest?.[0].toString()).toBe(
      "https://auth-dev.vatsim.test/oauth/token",
    );
    expect(tokenRequest?.[1]?.body?.toString()).toContain(
      "code=authorization-code",
    );
    expect(profileRequest?.[0].toString()).toBe(
      "https://auth-dev.vatsim.test/api/user",
    );
    expect(profileRequest?.[1]?.headers).toMatchObject({
      Authorization: "Bearer provider-access-token",
    });
  });

  it.each([
    [
      "a rejected token request",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    ],
    [
      "a malformed token response",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ access_token: "missing-token-type" }),
      ),
    ],
    [
      "a network failure",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("socket error")),
    ],
  ])("fails closed for %s", async (_case, fetchImplementation) => {
    const client = new VatsimConnectClient(configuration, {
      fetchImplementation,
    });

    await expect(client.authenticateCode("code")).rejects.toBeInstanceOf(
      VatsimConnectProviderError,
    );
  });
});
