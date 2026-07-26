import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionConfiguration } from "@event-hub/config/session";
import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  AuthenticatedSessionSchema,
} from "@event-hub/contracts";

import { ApiError } from "../errors.js";
import { clearSessionCookie } from "./cookie.js";
import type { SessionService } from "./session-service.js";

export type SessionLifecycle = Pick<
  SessionService,
  "authenticateSession" | "revokeSession"
>;

export const anonymousSessionLifecycle: SessionLifecycle = {
  async authenticateSession() {
    return null;
  },
  async revokeSession() {},
};

export function registerSessionRoutes(
  app: FastifyInstance,
  sessions: SessionLifecycle,
  configuration: SessionConfiguration,
) {
  app.get(
    `${API_PREFIX}/auth/session`,
    {
      schema: {
        response: {
          200: AuthenticatedSessionSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");

      const token = request.cookies[configuration.cookieName];
      const session = await sessions.authenticateSession(token);

      if (session === null) {
        if (token !== undefined) {
          clearSessionCookie(reply, configuration);
        }

        throw new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication is required.",
        );
      }

      return session;
    },
  );

  app.delete(
    `${API_PREFIX}/auth/session`,
    {
      schema: {
        response: {
          204: Type.Null(),
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");

      await sessions.revokeSession(
        request.cookies[configuration.cookieName],
      );
      clearSessionCookie(reply, configuration);

      return reply.code(204).send();
    },
  );
}
