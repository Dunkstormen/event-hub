import { type Static, Type } from "@sinclair/typebox";

import { API_VERSION } from "./api.js";

export const HealthQuerySchema = Type.Object({}, { additionalProperties: false });

export type HealthQuery = Static<typeof HealthQuerySchema>;

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal("ok"),
    service: Type.Literal("event-hub-api"),
    version: Type.Literal(API_VERSION),
  },
  { additionalProperties: false },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;
