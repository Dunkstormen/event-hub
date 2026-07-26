import { describe, expect, it, vi } from "vitest";

import { ControlCenterEligibilityProvider } from "./control-center-provider.js";
import { ProviderHttpClient } from "./http-client.js";
import { EligibilityProviderError } from "./provider.js";
import { VateudEligibilityProvider } from "./vateud-provider.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("eligibility provider HTTP behavior", () => {
  it("retries transient responses and rejects invalid credentials immediately", async () => {
    const retryingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const sleep = vi.fn(async () => {});
    const client = new ProviderHttpClient({
      fetchImplementation: retryingFetch,
      requestTimeoutMs: 100,
      retryDelaysMs: [1],
      sleep,
    });

    await expect(
      client.getJson(new URL("https://provider.test/data"), {}),
    ).resolves.toEqual({ data: [] });
    expect(retryingFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1);

    const deniedClient = new ProviderHttpClient({
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({}, 401)),
      requestTimeoutMs: 100,
      retryDelaysMs: [1, 2],
      sleep,
    });

    await expect(
      deniedClient.getJson(
        new URL("https://provider.test/data"),
        {},
      ),
    ).rejects.toMatchObject<Partial<EligibilityProviderError>>({
      code: "AUTHENTICATION_FAILED",
      retryable: false,
    });
  });
});

describe("Control Center eligibility adapter", () => {
  it("maps explicit areas, ratings, endorsements, and known positions", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (input) => {
        const url = new URL(String(input));

        if (url.pathname.endsWith("/users")) {
          expect(url.searchParams.getAll("include[]")).toEqual([
            "allUsers",
            "endorsements",
            "name",
            "activeAreas",
            "divisions",
          ]);

          return jsonResponse({
            data: [
              {
                id: 1234567,
                first_name: "Ada",
                last_name: "Controller",
                rating: "S3",
                atc_active: true,
                atc_active_areas: {
                  denmark: true,
                  finland: false,
                  iceland: false,
                  norway: false,
                  sweden: true,
                  unsupported: true,
                },
                endorsements: {
                  solo: [
                    {
                      valid_from: "2026-07-01T00:00:00.000Z",
                      valid_to: "2026-08-01T00:00:00.000Z",
                      positions: ["EKCH_TWR"],
                    },
                  ],
                  visiting: [
                    {
                      valid_from: "2026-06-01T00:00:00.000Z",
                      valid_to: null,
                      rating: "C1",
                    },
                  ],
                },
              },
            ],
          });
        }

        return jsonResponse({
          data: [
            {
              callsign: "EKCH_TWR",
              name: "Copenhagen Tower",
              frequency: "118.100",
            },
          ],
        });
      },
    );
    const provider = new ControlCenterEligibilityProvider(
      {
        apiKey: "secret",
        baseUrl: "https://control.example.test/api",
      },
      {
        clock: () => new Date("2026-07-26T10:00:00.000Z"),
        httpClient: new ProviderHttpClient({
          fetchImplementation,
          requestTimeoutMs: 100,
          retryDelaysMs: [],
        }),
      },
    );

    await expect(provider.fetchEligibility()).resolves.toEqual({
      provider: "control-center",
      fetchedAt: new Date("2026-07-26T10:00:00.000Z"),
      controllers: [
        {
          cid: "1234567",
          displayName: "Ada Controller",
          firIcaoCodes: ["EKDK", "ESAA"],
          rostered: true,
          rating: { code: "S3", value: 4 },
          endorsements: [
            {
              kind: "visiting",
              position: null,
              rating: "C1",
              sourceKey:
                "visiting::C1:2026-06-01T00:00:00.000Z:",
              validFrom: new Date("2026-06-01T00:00:00.000Z"),
              validUntil: null,
            },
            {
              kind: "solo",
              position: "EKCH_TWR",
              rating: null,
              sourceKey:
                "solo:EKCH_TWR::2026-07-01T00:00:00.000Z:2026-08-01T00:00:00.000Z",
              validFrom: new Date("2026-07-01T00:00:00.000Z"),
              validUntil: new Date("2026-08-01T00:00:00.000Z"),
            },
          ],
        },
      ],
      positions: [
        {
          callsign: "EKCH_TWR",
          frequency: "118.100",
          name: "Copenhagen Tower",
        },
      ],
    });
  });

  it("fails a complete batch when a user cannot be normalized", async () => {
    const provider = new ControlCenterEligibilityProvider(
      {
        apiKey: "secret",
        baseUrl: "https://control.example.test/api",
      },
      {
        httpClient: new ProviderHttpClient({
          fetchImplementation: vi.fn<typeof fetch>(async (input) =>
            new URL(String(input)).pathname.endsWith("/users")
              ? jsonResponse({ data: [{ id: "not-a-cid" }] })
              : jsonResponse({ data: [] }),
          ),
          requestTimeoutMs: 100,
          retryDelaysMs: [],
        }),
      },
    );

    await expect(provider.fetchEligibility()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

describe("VATEUD eligibility adapter", () => {
  it("maps roster, rating, and endorsement evidence without inferring FIRs", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (input) => {
        const path = new URL(String(input)).pathname;

        if (path.endsWith("/roster")) {
          return jsonResponse({
            success: true,
            data: {
              facility: "SCA",
              staff: [],
              controllers: [1234567],
            },
          });
        }

        if (path.endsWith("/solo")) {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 10,
                user_cid: 1234567,
                position: "EKCH_TWR",
                expiry: "2026-08-01T00:00:00.000Z",
                created_at: "2026-07-01T00:00:00.000Z",
              },
            ],
          });
        }

        if (path.endsWith("/tier-1")) {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 11,
                user_cid: 1234567,
                position: "EKCH_APP",
                created_at: "2026-06-01T00:00:00.000Z",
              },
            ],
          });
        }

        if (path.endsWith("/tier-2")) {
          return jsonResponse({ success: true, data: [] });
        }

        return jsonResponse({
          success: true,
          data: {
            cid: 1234567,
            first_name: "Ada",
            last_name: "Controller",
            rating: 5,
          },
        });
      },
    );
    const provider = new VateudEligibilityProvider(
      {
        apiKey: "secret",
        baseUrl: "https://core.vateud.net/api",
      },
      {
        clock: () => new Date("2026-07-26T10:00:00.000Z"),
        httpClient: new ProviderHttpClient({
          fetchImplementation,
          requestTimeoutMs: 100,
          retryDelaysMs: [],
        }),
      },
    );
    const result = await provider.fetchEligibility();

    expect(result).toMatchObject({
      provider: "vateud",
      fetchedAt: new Date("2026-07-26T10:00:00.000Z"),
      controllers: [
        {
          cid: "1234567",
          displayName: "Ada Controller",
          firIcaoCodes: [],
          rostered: true,
          rating: { code: "C1", value: 5 },
        },
      ],
      positions: [
        {
          callsign: "EKCH_TWR",
          name: "EKCH_TWR",
          frequency: null,
        },
        {
          callsign: "EKCH_APP",
          name: "EKCH_APP",
          frequency: null,
        },
      ],
    });
    expect(result.controllers[0]?.endorsements).toHaveLength(2);
  });
});
