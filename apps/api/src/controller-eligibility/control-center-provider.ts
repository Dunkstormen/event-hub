import type { EligibilityProviderConfiguration } from "@event-hub/config/controller-eligibility";

import { ProviderHttpClient } from "./http-client.js";
import {
  type ControllerEligibilityProvider,
  EligibilityProviderError,
  type NormalizedController,
  type NormalizedControllerEndorsement,
  type NormalizedControllerPosition,
  type NormalizedEligibilityBatch,
  ratingFromCode,
} from "./provider.js";

const areaFirMap = new Map([
  ["denmark", "EKDK"],
  ["finland", "EFIN"],
  ["iceland", "BIRD"],
  ["norway", "ENOR"],
  ["sweden", "ESAA"],
]);

type Clock = () => Date;

type ControlCenterProviderOptions = Readonly<{
  clock?: Clock;
  httpClient: ProviderHttpClient;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function dateValue(value: unknown) {
  const candidate = stringValue(value);

  if (candidate === null) {
    return null;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function cidValue(value: unknown) {
  const candidate =
    typeof value === "number" || typeof value === "string"
      ? String(value)
      : "";

  return /^[0-9]{1,16}$/u.test(candidate) ? candidate : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizedPosition(value: unknown) {
  const candidate = stringValue(value)?.trim().toUpperCase();
  return candidate === undefined || candidate === ""
    ? null
    : candidate;
}

function endorsementKey(
  kind: NormalizedControllerEndorsement["kind"],
  endorsement: Record<string, unknown>,
  position: string | null,
) {
  return [
    kind,
    position ?? "",
    stringValue(endorsement.rating) ?? "",
    stringValue(endorsement.valid_from) ?? "",
    stringValue(endorsement.valid_to) ?? "",
  ].join(":");
}

function mapEndorsements(value: unknown) {
  const groups = record(value);

  if (groups === null) {
    return [];
  }

  const result: NormalizedControllerEndorsement[] = [];

  for (const kind of [
    "examiner",
    "facility",
    "visiting",
  ] as const) {
    for (const rawEndorsement of arrayValue(groups[kind])) {
      const endorsement = record(rawEndorsement);

      if (endorsement === null) {
        continue;
      }

      result.push({
        kind,
        position: null,
        rating: stringValue(endorsement.rating),
        sourceKey: endorsementKey(kind, endorsement, null),
        validFrom: dateValue(endorsement.valid_from),
        validUntil: dateValue(endorsement.valid_to),
      });
    }
  }

  for (const rawEndorsement of arrayValue(groups.solo)) {
    const endorsement = record(rawEndorsement);

    if (endorsement === null) {
      continue;
    }

    for (const rawPosition of arrayValue(endorsement.positions)) {
      const position = normalizedPosition(rawPosition);

      if (position !== null) {
        result.push({
          kind: "solo",
          position,
          rating: null,
          sourceKey: endorsementKey("solo", endorsement, position),
          validFrom: dateValue(endorsement.valid_from),
          validUntil: dateValue(endorsement.valid_to),
        });
      }
    }
  }

  return result;
}

function mapController(value: unknown): NormalizedController | null {
  const user = record(value);
  const cid = cidValue(user?.id);

  if (user === null || cid === null) {
    return null;
  }

  const activeAreas = record(user.atc_active_areas);
  const firIcaoCodes =
    activeAreas === null
      ? []
      : [...areaFirMap]
          .filter(([area]) => activeAreas[area] === true)
          .map(([, firIcaoCode]) => firIcaoCode);
  const firstName = stringValue(user.first_name)?.trim();
  const lastName = stringValue(user.last_name)?.trim();
  const displayName = [firstName, lastName]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

  return {
    cid,
    displayName: displayName === "" ? null : displayName,
    endorsements: mapEndorsements(user.endorsements),
    firIcaoCodes,
    rating: ratingFromCode(stringValue(user.rating)),
    rostered: user.atc_active === true,
  };
}

function mapPosition(value: unknown): NormalizedControllerPosition | null {
  const position = record(value);
  const callsign = normalizedPosition(position?.callsign);
  const name = stringValue(position?.name)?.trim();

  if (
    position === null ||
    callsign === null ||
    name === undefined ||
    name === ""
  ) {
    return null;
  }

  return {
    callsign,
    frequency: stringValue(position.frequency),
    name,
  };
}

function dataArray(payload: unknown, endpoint: string) {
  const data = record(payload)?.data;

  if (!Array.isArray(data)) {
    throw new EligibilityProviderError(
      "INVALID_RESPONSE",
      `Control Center ${endpoint} response did not contain a data array.`,
      false,
    );
  }

  return data;
}

export class ControlCenterEligibilityProvider
  implements ControllerEligibilityProvider
{
  readonly key = "control-center" as const;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #clock: Clock;
  readonly #httpClient: ProviderHttpClient;

  constructor(
    configuration: EligibilityProviderConfiguration,
    { clock = () => new Date(), httpClient }: ControlCenterProviderOptions,
  ) {
    this.#baseUrl = configuration.baseUrl;
    this.#apiKey = configuration.apiKey;
    this.#clock = clock;
    this.#httpClient = httpClient;
  }

  async fetchEligibility(): Promise<NormalizedEligibilityBatch> {
    const usersUrl = new URL(`${this.#baseUrl}/users`);

    for (const include of [
      "allUsers",
      "endorsements",
      "name",
      "activeAreas",
      "divisions",
    ]) {
      usersUrl.searchParams.append("include[]", include);
    }

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${this.#apiKey}`,
    };
    const [usersPayload, positionsPayload] = await Promise.all([
      this.#httpClient.getJson(usersUrl, headers),
      this.#httpClient.getJson(
        new URL(`${this.#baseUrl}/positions`),
        headers,
      ),
    ]);
    const rawUsers = dataArray(usersPayload, "users");
    const controllers = rawUsers
      .map(mapController)
      .filter(
        (controller): controller is NormalizedController =>
          controller !== null,
      );
    const rawPositions = dataArray(positionsPayload, "positions");
    const positions = rawPositions
      .map(mapPosition)
      .filter(
        (position): position is NormalizedControllerPosition =>
          position !== null,
      );

    if (controllers.length !== rawUsers.length) {
      throw new EligibilityProviderError(
        "INVALID_RESPONSE",
        "Control Center returned a user that could not be normalized.",
        false,
      );
    }
    if (positions.length !== rawPositions.length) {
      throw new EligibilityProviderError(
        "INVALID_RESPONSE",
        "Control Center returned a position that could not be normalized.",
        false,
      );
    }

    return {
      controllers,
      fetchedAt: this.#clock(),
      positions,
      provider: this.key,
    };
  }
}
