import type { FastifyReply } from "fastify";

import type { SessionConfiguration } from "@event-hub/config/session";

function sessionCookieOptions(configuration: SessionConfiguration) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: configuration.cookieSecure,
  };
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  configuration: SessionConfiguration,
) {
  reply.setCookie(
    configuration.cookieName,
    token,
    sessionCookieOptions(configuration),
  );
}

export function clearSessionCookie(
  reply: FastifyReply,
  configuration: SessionConfiguration,
) {
  reply.clearCookie(
    configuration.cookieName,
    sessionCookieOptions(configuration),
  );
}
