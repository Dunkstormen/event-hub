import { type Static, Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionConfiguration } from "@event-hub/config/session";
import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";
import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
} from "@event-hub/contracts";

import { ApiError } from "../errors.js";
import { setSessionCookie } from "./cookie.js";
import { InvalidOAuthTransactionError } from "./oauth-transaction.js";
import { DisabledUserError } from "./session-service.js";
import type { VatsimAuthenticationFlow } from "./vatsim-authentication.js";
import {
  clearVatsimTransactionCookie,
  setVatsimTransactionCookie,
} from "./vatsim-cookie.js";
import { VatsimConnectProviderError } from "./vatsim-connect-client.js";

const callbackQuerySchema = Type.Object(
  {
    code: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
    state: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    error: Type.Optional(Type.String({ minLength: 1, maxLength: 191 })),
    error_description: Type.Optional(
      Type.String({ minLength: 1, maxLength: 1024 }),
    ),
    error_uri: Type.Optional(
      Type.String({ minLength: 1, maxLength: 2048 }),
    ),
  },
  { additionalProperties: false },
);
type CallbackQuery = Static<typeof callbackQuerySchema>;

function unavailableError() {
  return new ApiError(
    503,
    "INTERNAL_ERROR",
    "VATSIM Connect is not configured.",
  );
}

export function registerVatsimAuthenticationRoutes(
  app: FastifyInstance,
  flow: VatsimAuthenticationFlow | null,
  connectConfiguration: VatsimConnectConfiguration | null,
  sessionConfiguration: SessionConfiguration,
) {
  app.get(
    `${API_PREFIX}/auth/vatsim`,
    {
      schema: {
        response: API_ERROR_RESPONSE_SCHEMAS,
      },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");

      if (flow === null || connectConfiguration === null) {
        throw unavailableError();
      }

      const authorization = flow.begin();
      setVatsimTransactionCookie(
        reply,
        authorization.transactionCookieValue,
        connectConfiguration,
      );

      return reply.redirect(authorization.authorizationUrl);
    },
  );

  app.get<{ Querystring: CallbackQuery }>(
    `${API_PREFIX}/auth/vatsim/callback`,
    {
      schema: {
        querystring: callbackQuerySchema,
        response: API_ERROR_RESPONSE_SCHEMAS,
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");

      if (flow === null || connectConfiguration === null) {
        throw unavailableError();
      }

      clearVatsimTransactionCookie(reply, connectConfiguration);

      if (request.query.error !== undefined) {
        throw new ApiError(
          400,
          "BAD_REQUEST",
          "VATSIM authorization was not completed. Start sign-in again.",
        );
      }

      if (
        request.query.code === undefined ||
        request.query.state === undefined
      ) {
        throw new ApiError(
          400,
          "BAD_REQUEST",
          "The VATSIM callback is missing required information. Start sign-in again.",
        );
      }

      try {
        const session = await flow.complete({
          code: request.query.code,
          providerState: request.query.state,
          transactionCookieValue:
            request.cookies[connectConfiguration.transactionCookieName],
        });

        setSessionCookie(
          reply,
          session.token,
          sessionConfiguration,
        );

        return reply.redirect(connectConfiguration.successRedirectUri);
      } catch (error) {
        if (error instanceof InvalidOAuthTransactionError) {
          throw new ApiError(
            400,
            "BAD_REQUEST",
            "The sign-in request expired or could not be verified. Start sign-in again.",
          );
        }

        if (error instanceof DisabledUserError) {
          throw new ApiError(
            403,
            "FORBIDDEN",
            "This Event Hub account is disabled.",
          );
        }

        if (error instanceof VatsimConnectProviderError) {
          throw new ApiError(
            502,
            "INTERNAL_ERROR",
            "VATSIM Connect could not complete sign-in. Please try again.",
          );
        }

        throw error;
      }
    },
  );
}
