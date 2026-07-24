import Fastify, { type FastifyServerOptions } from "fastify";

import { API_VERSION, type HealthResponse } from "@event-hub/contracts";

type BuildAppOptions = Pick<FastifyServerOptions, "logger">;

export function buildApp({ logger = false }: BuildAppOptions = {}) {
  const app = Fastify({ logger });

  app.get<{ Reply: HealthResponse }>(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status", "service", "version"],
            properties: {
              status: { const: "ok" },
              service: { const: "event-hub-api" },
              version: { const: API_VERSION },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      service: "event-hub-api",
      version: API_VERSION,
    }),
  );

  return app;
}
