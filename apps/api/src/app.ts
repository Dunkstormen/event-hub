import cookie from "@fastify/cookie";
import Fastify, { type FastifyServerOptions } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import {
  parseSessionConfiguration,
  type SessionConfiguration,
} from "@event-hub/config/session";
import {
  parseVatsimConnectConfiguration,
  type VatsimConnectConfiguration,
} from "@event-hub/config/vatsim-connect";
import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  API_VERSION,
  HealthQuerySchema,
  HealthResponseSchema,
  type HealthResponse,
} from "@event-hub/contracts";

import {
  anonymousSessionLifecycle,
  registerSessionRoutes,
  type SessionLifecycle,
} from "./auth/routes.js";
import type { VatsimAuthenticationFlow } from "./auth/vatsim-authentication.js";
import { registerVatsimAuthenticationRoutes } from "./auth/vatsim-routes.js";
import { registerErrorHandlers } from "./errors.js";
import {
  emptyReferenceDataRepository,
  type ReferenceDataRepository,
} from "./reference-data/repository.js";
import { registerReferenceDataRoutes } from "./reference-data/routes.js";

type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
  referenceDataRepository?: ReferenceDataRepository;
  sessionConfiguration?: SessionConfiguration;
  sessionLifecycle?: SessionLifecycle;
  vatsimAuthentication?: VatsimAuthenticationFlow | null;
  vatsimConnectConfiguration?: VatsimConnectConfiguration | null;
};

export function buildApp({
  logger = false,
  referenceDataRepository = emptyReferenceDataRepository,
  sessionConfiguration = parseSessionConfiguration(process.env),
  sessionLifecycle = anonymousSessionLifecycle,
  vatsimAuthentication = null,
  vatsimConnectConfiguration = parseVatsimConnectConfiguration(
    process.env,
  ),
}: BuildAppOptions = {}) {
  const app = Fastify({
    logger,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(cookie);
  registerErrorHandlers(app);
  registerReferenceDataRoutes(app, referenceDataRepository);
  registerSessionRoutes(app, sessionLifecycle, sessionConfiguration);
  registerVatsimAuthenticationRoutes(
    app,
    vatsimAuthentication,
    vatsimConnectConfiguration,
    sessionConfiguration,
  );

  app.get(
    `${API_PREFIX}/health`,
    {
      schema: {
        querystring: HealthQuerySchema,
        response: {
          200: HealthResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "event-hub-api",
      version: API_VERSION,
    }),
  );

  return app;
}
