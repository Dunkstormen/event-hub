import { type Static, Type } from "@sinclair/typebox";

const NullableDateTimeSchema = Type.Union([
  Type.String({ format: "date-time" }),
  Type.Null(),
]);

export const ControllerEligibilityProviderSchema = Type.Union([
  Type.Literal("control-center"),
  Type.Literal("vateud"),
]);

export type ControllerEligibilityProvider = Static<
  typeof ControllerEligibilityProviderSchema
>;

export const ControllerEligibilityProviderParamsSchema = Type.Object(
  {
    provider: ControllerEligibilityProviderSchema,
  },
  { additionalProperties: false },
);

export type ControllerEligibilityProviderParams = Static<
  typeof ControllerEligibilityProviderParamsSchema
>;

export const ControllerEligibilityProviderStatusSchema = Type.Object(
  {
    provider: ControllerEligibilityProviderSchema,
    configured: Type.Boolean(),
    state: Type.Union([
      Type.Literal("never"),
      Type.Literal("succeeded"),
      Type.Literal("failed"),
    ]),
    freshness: Type.Union([
      Type.Literal("disabled"),
      Type.Literal("never"),
      Type.Literal("fresh"),
      Type.Literal("stale"),
    ]),
    lastAttemptedAt: NullableDateTimeSchema,
    lastSucceededAt: NullableDateTimeSchema,
    freshUntil: NullableDateTimeSchema,
    lastErrorCode: Type.Union([
      Type.String({ minLength: 1, maxLength: 64 }),
      Type.Null(),
    ]),
    lastErrorMessage: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    consecutiveFailures: Type.Integer({ minimum: 0 }),
    recordsSeen: Type.Integer({ minimum: 0 }),
    nextRetryAt: NullableDateTimeSchema,
  },
  { additionalProperties: false },
);

export type ControllerEligibilityProviderStatus = Static<
  typeof ControllerEligibilityProviderStatusSchema
>;

export const ControllerEligibilitySyncRunSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 30 }),
    provider: ControllerEligibilityProviderSchema,
    trigger: Type.Union([
      Type.Literal("startup"),
      Type.Literal("periodic"),
      Type.Literal("on-demand"),
    ]),
    status: Type.Union([
      Type.Literal("running"),
      Type.Literal("succeeded"),
      Type.Literal("failed"),
    ]),
    startedAt: Type.String({ format: "date-time" }),
    completedAt: NullableDateTimeSchema,
    controllersSeen: Type.Integer({ minimum: 0 }),
    membershipsChanged: Type.Integer({ minimum: 0 }),
    errorCode: Type.Union([
      Type.String({ minLength: 1, maxLength: 64 }),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);

export const ControllerEligibilityStatusSchema = Type.Object(
  {
    generatedAt: Type.String({ format: "date-time" }),
    providers: Type.Array(ControllerEligibilityProviderStatusSchema, {
      minItems: 2,
      maxItems: 2,
    }),
    recentRuns: Type.Array(ControllerEligibilitySyncRunSchema, {
      maxItems: 20,
    }),
  },
  { additionalProperties: false },
);

export type ControllerEligibilityStatus = Static<
  typeof ControllerEligibilityStatusSchema
>;

export const ControllerEligibilitySyncResultSchema = Type.Object(
  {
    runId: Type.String({ minLength: 1, maxLength: 30 }),
    provider: ControllerEligibilityProviderSchema,
    controllersSeen: Type.Integer({ minimum: 0 }),
    membershipsChanged: Type.Integer({ minimum: 0 }),
    freshUntil: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type ControllerEligibilitySyncResult = Static<
  typeof ControllerEligibilitySyncResultSchema
>;
