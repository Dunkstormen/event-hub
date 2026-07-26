export type EligibilityProviderKey =
  | "control-center"
  | "vateud";

export type NormalizedControllerRating = Readonly<{
  code: string;
  value: number | null;
}>;

export type NormalizedControllerEndorsement = Readonly<{
  kind:
    | "examiner"
    | "facility"
    | "solo"
    | "tier-1"
    | "tier-2"
    | "visiting";
  position: string | null;
  rating: string | null;
  sourceKey: string;
  validFrom: Date | null;
  validUntil: Date | null;
}>;

export type NormalizedController = Readonly<{
  cid: string;
  displayName: string | null;
  endorsements: readonly NormalizedControllerEndorsement[];
  firIcaoCodes: readonly string[];
  rating: NormalizedControllerRating | null;
  rostered: boolean;
}>;

export type NormalizedControllerPosition = Readonly<{
  callsign: string;
  frequency: string | null;
  name: string;
}>;

export type NormalizedEligibilityBatch = Readonly<{
  controllers: readonly NormalizedController[];
  fetchedAt: Date;
  positions: readonly NormalizedControllerPosition[];
  provider: EligibilityProviderKey;
}>;

export interface ControllerEligibilityProvider {
  readonly key: EligibilityProviderKey;
  fetchEligibility(): Promise<NormalizedEligibilityBatch>;
}

export class EligibilityProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "EligibilityProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

const ratingValues = new Map([
  ["OBS", 1],
  ["S1", 2],
  ["S2", 3],
  ["S3", 4],
  ["C1", 5],
  ["C2", 6],
  ["C3", 7],
  ["I1", 8],
  ["I2", 9],
  ["I3", 10],
  ["SUP", 11],
  ["ADM", 12],
]);

const ratingCodes = new Map(
  [...ratingValues].map(([code, value]) => [value, code]),
);

export function ratingFromCode(
  value: string | null | undefined,
): NormalizedControllerRating | null {
  const code = value?.trim().toUpperCase();

  if (code === undefined || code === "") {
    return null;
  }

  return {
    code,
    value: ratingValues.get(code) ?? null,
  };
}

export function ratingFromValue(
  value: number | null | undefined,
): NormalizedControllerRating | null {
  if (value === undefined || value === null || !Number.isInteger(value)) {
    return null;
  }

  return {
    code: ratingCodes.get(value) ?? String(value),
    value,
  };
}
