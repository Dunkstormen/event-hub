export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const LOCAL_SESSION_COOKIE_NAME = "event_hub_id";
export const PRODUCTION_SESSION_COOKIE_NAME = "__Host-id";

const minimumSessionTtlSeconds = 5 * 60;
const maximumSessionTtlSeconds = 7 * 24 * 60 * 60;

export type SessionConfiguration = Readonly<{
  cookieName: string;
  cookieSecure: boolean;
  ttlSeconds: number;
}>;

export type SessionEnvironment = Readonly<{
  NODE_ENV?: string;
  SESSION_TTL_SECONDS?: string;
}>;

function parseSessionTtlSeconds(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_SESSION_TTL_SECONDS;
  }

  const ttlSeconds = Number(value);

  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < minimumSessionTtlSeconds ||
    ttlSeconds > maximumSessionTtlSeconds
  ) {
    throw new Error(
      `SESSION_TTL_SECONDS must be an integer between ${minimumSessionTtlSeconds} and ${maximumSessionTtlSeconds}.`,
    );
  }

  return ttlSeconds;
}

export function parseSessionConfiguration(
  environment: SessionEnvironment,
): SessionConfiguration {
  const local =
    environment.NODE_ENV === "development" ||
    environment.NODE_ENV === "test";

  return {
    cookieName: local
      ? LOCAL_SESSION_COOKIE_NAME
      : PRODUCTION_SESSION_COOKIE_NAME,
    cookieSecure: !local,
    ttlSeconds: parseSessionTtlSeconds(environment.SESSION_TTL_SECONDS),
  };
}
