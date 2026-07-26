export const LOCAL_WEB_ORIGIN = "http://localhost:3000";

export type WebOriginEnvironment = Readonly<{
  NODE_ENV?: string;
  WEB_ORIGIN?: string;
}>;

export function parseWebOrigin(environment: WebOriginEnvironment) {
  const configured = environment.WEB_ORIGIN?.trim();
  const local =
    environment.NODE_ENV === "development" ||
    environment.NODE_ENV === "test";
  const value =
    configured === undefined || configured === ""
      ? local
        ? LOCAL_WEB_ORIGIN
        : undefined
      : configured;

  if (value === undefined) {
    throw new Error("WEB_ORIGIN is required outside development and test.");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("WEB_ORIGIN must be an absolute HTTP origin.");
  }

  const allowedProtocol =
    url.protocol === "https:" ||
    (local && url.protocol === "http:");

  if (
    !allowedProtocol ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `WEB_ORIGIN must be an absolute ${local ? "HTTP or HTTPS" : "HTTPS"} origin without credentials, path, query, or fragment.`,
    );
  }

  return url.origin;
}
