import type { FastifyReply } from "fastify";

import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";

function transactionCookieOptions(
  configuration: VatsimConnectConfiguration,
) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: configuration.transactionCookieSecure,
  };
}

export function setVatsimTransactionCookie(
  reply: FastifyReply,
  value: string,
  configuration: VatsimConnectConfiguration,
) {
  reply.setCookie(configuration.transactionCookieName, value, {
    ...transactionCookieOptions(configuration),
    maxAge: configuration.transactionTtlSeconds,
  });
}

export function clearVatsimTransactionCookie(
  reply: FastifyReply,
  configuration: VatsimConnectConfiguration,
) {
  reply.clearCookie(
    configuration.transactionCookieName,
    transactionCookieOptions(configuration),
  );
}
