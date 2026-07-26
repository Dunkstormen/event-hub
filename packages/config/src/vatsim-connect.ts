export const DEFAULT_VATSIM_CONNECT_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_VATSIM_CONNECT_TRANSACTION_TTL_SECONDS = 10 * 60;
export const LOCAL_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME =
  "event_hub_vatsim_oauth";
export const PRODUCTION_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME =
  "__Host-vatsim-oauth";

export type VatsimConnectConfiguration = Readonly<{
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  successRedirectUri: string;
  transactionCookieName: string;
  transactionCookieSecure: boolean;
  transactionTtlSeconds: number;
  requestTimeoutMs: number;
}>;

export type VatsimConnectEnvironment = Readonly<{
  NODE_ENV?: string;
  VATSIM_CONNECT_BASE_URL?: string;
  VATSIM_CONNECT_CLIENT_ID?: string;
  VATSIM_CONNECT_CLIENT_SECRET?: string;
  VATSIM_CONNECT_REDIRECT_URI?: string;
  VATSIM_CONNECT_SUCCESS_REDIRECT_URI?: string;
}>;

function normalizedValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function requireValue(
  environment: VatsimConnectEnvironment,
  key:
    | "VATSIM_CONNECT_CLIENT_ID"
    | "VATSIM_CONNECT_CLIENT_SECRET"
    | "VATSIM_CONNECT_REDIRECT_URI",
) {
  const value = normalizedValue(environment[key]);

  if (value === undefined) {
    throw new Error(`${key} is required when VATSIM Connect is configured.`);
  }

  return value;
}

function parseUrl(
  value: string,
  key: string,
  { requireHttps }: { requireHttps: boolean },
) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute HTTP URL.`);
  }

  const allowedProtocol =
    url.protocol === "https:" ||
    (!requireHttps && url.protocol === "http:");

  if (!allowedProtocol || url.username !== "" || url.password !== "") {
    throw new Error(
      `${key} must be an absolute ${requireHttps ? "HTTPS" : "HTTP or HTTPS"} URL without credentials.`,
    );
  }

  return url;
}

function parseBaseUrl(value: string) {
  const url = parseUrl(value, "VATSIM_CONNECT_BASE_URL", {
    requireHttps: true,
  });

  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "VATSIM_CONNECT_BASE_URL must contain only the provider origin.",
    );
  }

  return url.toString().replace(/\/$/u, "");
}

export function parseVatsimConnectConfiguration(
  environment: VatsimConnectEnvironment,
): VatsimConnectConfiguration | null {
  const clientId = normalizedValue(environment.VATSIM_CONNECT_CLIENT_ID);
  const clientSecret = normalizedValue(
    environment.VATSIM_CONNECT_CLIENT_SECRET,
  );
  const redirectUri = normalizedValue(
    environment.VATSIM_CONNECT_REDIRECT_URI,
  );
  const successRedirectUri = normalizedValue(
    environment.VATSIM_CONNECT_SUCCESS_REDIRECT_URI,
  );
  const configuredValues = [
    clientId,
    clientSecret,
    redirectUri,
    successRedirectUri,
  ];

  if (configuredValues.every((value) => value === undefined)) {
    return null;
  }

  const local =
    environment.NODE_ENV === "development" ||
    environment.NODE_ENV === "test";
  const resolvedRedirectUri = requireValue(
    environment,
    "VATSIM_CONNECT_REDIRECT_URI",
  );
  const resolvedSuccessRedirectUri =
    successRedirectUri ??
    (local
      ? "http://localhost:3000"
      : (() => {
          throw new Error(
            "VATSIM_CONNECT_SUCCESS_REDIRECT_URI is required outside development and test.",
          );
        })());

  parseUrl(resolvedRedirectUri, "VATSIM_CONNECT_REDIRECT_URI", {
    requireHttps: !local,
  });
  parseUrl(
    resolvedSuccessRedirectUri,
    "VATSIM_CONNECT_SUCCESS_REDIRECT_URI",
    { requireHttps: !local },
  );

  return {
    baseUrl: parseBaseUrl(
      normalizedValue(environment.VATSIM_CONNECT_BASE_URL) ??
        (local
          ? "https://auth-dev.vatsim.net"
          : "https://auth.vatsim.net"),
    ),
    clientId: requireValue(environment, "VATSIM_CONNECT_CLIENT_ID"),
    clientSecret: requireValue(
      environment,
      "VATSIM_CONNECT_CLIENT_SECRET",
    ),
    redirectUri: resolvedRedirectUri,
    successRedirectUri: resolvedSuccessRedirectUri,
    transactionCookieName: local
      ? LOCAL_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME
      : PRODUCTION_VATSIM_CONNECT_TRANSACTION_COOKIE_NAME,
    transactionCookieSecure: !local,
    transactionTtlSeconds:
      DEFAULT_VATSIM_CONNECT_TRANSACTION_TTL_SECONDS,
    requestTimeoutMs: DEFAULT_VATSIM_CONNECT_REQUEST_TIMEOUT_MS,
  };
}
