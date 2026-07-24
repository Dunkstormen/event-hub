import Fastify, { type FastifyServerOptions } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  API_VERSION,
  HealthQuerySchema,
  HealthResponseSchema,
  type HealthResponse,
} from "@event-hub/contracts";

import { registerErrorHandlers } from "./errors.js";
import {
  emptyReferenceDataRepository,
  type ReferenceDataRepository,
} from "./reference-data/repository.js";
import { registerReferenceDataRoutes } from "./reference-data/routes.js";

type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
  referenceDataRepository?: ReferenceDataRepository;
};

export function buildApp({
  logger = false,
  referenceDataRepository = emptyReferenceDataRepository,
}: BuildAppOptions = {}) {
  const app = Fastify({
    logger,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerErrorHandlers(app);
  registerReferenceDataRoutes(app, referenceDataRepository);

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
