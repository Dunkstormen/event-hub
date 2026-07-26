import type { EligibilityProviderConfiguration } from "@event-hub/config/controller-eligibility";

import { ProviderHttpClient } from "./http-client.js";
import {
  type ControllerEligibilityProvider,
  EligibilityProviderError,
  type NormalizedController,
  type NormalizedControllerEndorsement,
  type NormalizedEligibilityBatch,
  ratingFromValue,
} from "./provider.js";

type Clock = () => Date;

type VateudProviderOptions = Readonly<{
  clock?: Clock;
  httpClient: ProviderHttpClient;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : null;
}

function cidValue(value: unknown) {
  const candidate =
    typeof value === "number" || typeof value === "string"
      ? String(value)
      : "";

  return /^[0-9]{1,16}$/u.test(candidate) ? candidate : null;
}

function dateValue(value: unknown) {
  const candidate = stringValue(value);

  if (candidate === null) {
    return null;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function positionValue(value: unknown) {
  const candidate = stringValue(value)?.trim().toUpperCase();
  return candidate === undefined || candidate === ""
    ? null
    : candidate;
}

function dataValue(payload: unknown, endpoint: string) {
  const data = record(payload)?.data;

  if (data === undefined) {
    throw new EligibilityProviderError(
      "INVALID_RESPONSE",
      `VATEUD ${endpoint} response did not contain data.`,
      false,
    );
  }

  return data;
}

function endorsement(
  value: unknown,
  kind: "solo" | "tier-1" | "tier-2",
): NormalizedControllerEndorsement | null {
  const candidate = record(value);
  const id = integerValue(candidate?.id);
  const position = positionValue(candidate?.position);

  if (candidate === null || id === null || position === null) {
    return null;
  }

  return {
    kind,
    position,
    rating: null,
    sourceKey: `${kind}:${id}`,
    validFrom: dateValue(candidate.created_at),
    validUntil:
      kind === "solo" ? dateValue(candidate.expiry) : null,
  };
}

function endorsementsByCid(
  soloPayload: unknown,
  tierOnePayload: unknown,
  tierTwoPayload: unknown,
) {
  const result = new Map<string, NormalizedControllerEndorsement[]>();

  for (const [payload, kind] of [
    [soloPayload, "solo"],
    [tierOnePayload, "tier-1"],
    [tierTwoPayload, "tier-2"],
  ] as const) {
    for (const rawEndorsement of arrayValue(
      dataValue(payload, kind),
    )) {
      const cid = cidValue(record(rawEndorsement)?.user_cid);
      const normalized = endorsement(rawEndorsement, kind);

      if (cid !== null && normalized !== null) {
        const existing = result.get(cid) ?? [];
        existing.push(normalized);
        result.set(cid, existing);
      }
    }
  }

  return result;
}

export class VateudEligibilityProvider
  implements ControllerEligibilityProvider
{
  readonly key = "vateud" as const;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #clock: Clock;
  readonly #httpClient: ProviderHttpClient;

  constructor(
    configuration: EligibilityProviderConfiguration,
    { clock = () => new Date(), httpClient }: VateudProviderOptions,
  ) {
    this.#apiKey = configuration.apiKey;
    this.#baseUrl = configuration.baseUrl;
    this.#clock = clock;
    this.#httpClient = httpClient;
  }

  async fetchEligibility(): Promise<NormalizedEligibilityBatch> {
    const headers = {
      Accept: "application/json",
      "X-API-KEY": this.#apiKey,
    };
    const get = (path: string) =>
      this.#httpClient.getJson(
        new URL(`${this.#baseUrl}/${path}`),
        headers,
      );
    const [rosterPayload, soloPayload, tierOnePayload, tierTwoPayload] =
      await Promise.all([
        get("roster"),
        get("solo"),
        get("tier-1"),
        get("tier-2"),
      ]);
    const roster = record(dataValue(rosterPayload, "roster"));

    if (roster === null) {
      throw new EligibilityProviderError(
        "INVALID_RESPONSE",
        "VATEUD roster data was not an object.",
        false,
      );
    }

    const cids = new Set<string>();

    for (const rawCid of arrayValue(roster.controllers)) {
      const cid = cidValue(rawCid);
      if (cid !== null) {
        cids.add(cid);
      }
    }

    for (const rawStaff of arrayValue(roster.staff)) {
      const cid = cidValue(record(rawStaff)?.cid);
      if (cid !== null) {
        cids.add(cid);
      }
    }

    const endorsements = endorsementsByCid(
      soloPayload,
      tierOnePayload,
      tierTwoPayload,
    );
    const userPayloads = await Promise.all(
      [...cids].map(async (cid) => ({
        cid,
        payload: await get(cid),
      })),
    );
    const controllers: NormalizedController[] = userPayloads.map(
      ({ cid, payload }) => {
        const user = record(dataValue(payload, cid));
        const firstName = stringValue(user?.first_name)?.trim();
        const lastName = stringValue(user?.last_name)?.trim();
        const displayName = [firstName, lastName]
          .filter((part) => part !== undefined && part !== "")
          .join(" ");

        if (user === null || cidValue(user.cid) !== cid) {
          throw new EligibilityProviderError(
            "INVALID_RESPONSE",
            `VATEUD user response for CID ${cid} was invalid.`,
            false,
          );
        }

        return {
          cid,
          displayName: displayName === "" ? null : displayName,
          endorsements: endorsements.get(cid) ?? [],
          firIcaoCodes: [],
          rating: ratingFromValue(integerValue(user.rating)),
          rostered: true,
        };
      },
    );
    const positionMap = new Map(
      [...endorsements.values()]
        .flat()
        .flatMap((item) =>
          item.position === null
            ? []
            : [
                [
                  item.position,
                  {
                    callsign: item.position,
                    frequency: null,
                    name: item.position,
                  },
                ] as const,
              ],
        ),
    );

    return {
      controllers,
      fetchedAt: this.#clock(),
      positions: [...positionMap.values()],
      provider: this.key,
    };
  }
}
