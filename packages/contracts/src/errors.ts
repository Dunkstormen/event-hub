import { type Static, Type } from "@sinclair/typebox";

export const ApiErrorCodeSchema = Type.Union([
  Type.Literal("BAD_REQUEST"),
  Type.Literal("VALIDATION_ERROR"),
  Type.Literal("AUTHENTICATION_REQUIRED"),
  Type.Literal("FORBIDDEN"),
  Type.Literal("NOT_FOUND"),
  Type.Literal("METHOD_NOT_ALLOWED"),
  Type.Literal("CONFLICT"),
  Type.Literal("PAYLOAD_TOO_LARGE"),
  Type.Literal("UNSUPPORTED_MEDIA_TYPE"),
  Type.Literal("RATE_LIMITED"),
  Type.Literal("INTERNAL_ERROR"),
]);

export type ApiErrorCode = Static<typeof ApiErrorCodeSchema>;

export const ApiErrorDetailSchema = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type ApiErrorDetail = Static<typeof ApiErrorDetailSchema>;

export const ApiErrorResponseSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: ApiErrorCodeSchema,
        message: Type.String({ minLength: 1 }),
        requestId: Type.String({ minLength: 1 }),
        details: Type.Optional(Type.Array(ApiErrorDetailSchema)),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ApiErrorResponse = Static<typeof ApiErrorResponseSchema>;

export const API_ERROR_RESPONSE_SCHEMAS = {
  400: ApiErrorResponseSchema,
  401: ApiErrorResponseSchema,
  403: ApiErrorResponseSchema,
  404: ApiErrorResponseSchema,
  405: ApiErrorResponseSchema,
  409: ApiErrorResponseSchema,
  413: ApiErrorResponseSchema,
  415: ApiErrorResponseSchema,
  429: ApiErrorResponseSchema,
  500: ApiErrorResponseSchema,
  502: ApiErrorResponseSchema,
  503: ApiErrorResponseSchema,
} as const;
