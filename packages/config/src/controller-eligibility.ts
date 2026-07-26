export const DEFAULT_CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS =
  2 * 60 * 60;
export const DEFAULT_CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS =
  60 * 60;
export const DEFAULT_CONTROLLER_ELIGIBILITY_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_VATEUD_API_BASE_URL =
  "https://core.vateud.net/api";

export type EligibilityProviderConfiguration = Readonly<{
  apiKey: string;
  baseUrl: string;
}>;

export type ControllerEligibilityConfiguration = Readonly<{
  controlCenter: EligibilityProviderConfiguration | null;
  freshnessSeconds: number;
  requestTimeoutMs: number;
  syncIntervalSeconds: number;
  vateud: EligibilityProviderConfiguration | null;
}>;

export type ControllerEligibilityEnvironment = Readonly<{
  CONTROL_CENTER_API_BASE_URL?: string;
  CONTROL_CENTER_API_KEY?: string;
  CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS?: string;
  CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS?: string;
  VATEUD_API_BASE_URL?: string;
  VATEUD_API_KEY?: string;
}>;

function normalizedValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  key: string,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function parseProviderBaseUrl(value: string, key: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute HTTPS URL.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${key} must be an absolute HTTPS URL without credentials, query, or fragment.`,
    );
  }

  return url.toString().replace(/\/$/u, "");
}

function parseProvider(
  environment: ControllerEligibilityEnvironment,
  provider: "CONTROL_CENTER" | "VATEUD",
) {
  const apiKeyName = `${provider}_API_KEY` as const;
  const baseUrlName = `${provider}_API_BASE_URL` as const;
  const apiKey = normalizedValue(environment[apiKeyName]);
  const configuredBaseUrl = normalizedValue(environment[baseUrlName]);

  if (apiKey === undefined && configuredBaseUrl === undefined) {
    return null;
  }

  if (apiKey === undefined) {
    throw new Error(
      `${apiKeyName} is required when ${provider.replaceAll("_", " ")} eligibility synchronization is configured.`,
    );
  }

  const baseUrl =
    configuredBaseUrl ??
    (provider === "VATEUD"
      ? DEFAULT_VATEUD_API_BASE_URL
      : undefined);

  if (baseUrl === undefined) {
    throw new Error(
      `${baseUrlName} is required when CONTROL CENTER eligibility synchronization is configured.`,
    );
  }

  return {
    apiKey,
    baseUrl: parseProviderBaseUrl(baseUrl, baseUrlName),
  };
}

export function parseControllerEligibilityConfiguration(
  environment: ControllerEligibilityEnvironment,
): ControllerEligibilityConfiguration {
  const syncIntervalSeconds = parseBoundedInteger(
    environment.CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS,
    DEFAULT_CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS,
    "CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS",
    5 * 60,
    24 * 60 * 60,
  );
  const freshnessSeconds = parseBoundedInteger(
    environment.CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS,
    DEFAULT_CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS,
    "CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS",
    5 * 60,
    7 * 24 * 60 * 60,
  );

  if (freshnessSeconds < syncIntervalSeconds) {
    throw new Error(
      "CONTROLLER_ELIGIBILITY_FRESHNESS_SECONDS must be greater than or equal to CONTROLLER_ELIGIBILITY_SYNC_INTERVAL_SECONDS.",
    );
  }

  return {
    controlCenter: parseProvider(environment, "CONTROL_CENTER"),
    freshnessSeconds,
    requestTimeoutMs:
      DEFAULT_CONTROLLER_ELIGIBILITY_REQUEST_TIMEOUT_MS,
    syncIntervalSeconds,
    vateud: parseProvider(environment, "VATEUD"),
  };
}
