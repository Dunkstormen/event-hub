import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  type ApiErrorCode,
  type ApiErrorDetail,
  type ApiErrorResponse,
} from "@event-hub/contracts";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[] | undefined;
  readonly statusCode: number;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const statusCodes = new Map<number, ApiErrorCode>([
  [400, "BAD_REQUEST"],
  [401, "AUTHENTICATION_REQUIRED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [405, "METHOD_NOT_ALLOWED"],
  [409, "CONFLICT"],
  [413, "PAYLOAD_TOO_LARGE"],
  [415, "UNSUPPORTED_MEDIA_TYPE"],
  [429, "RATE_LIMITED"],
]);

function validationDetails(error: FastifyError): ApiErrorDetail[] {
  const context = error.validationContext ?? "request";

  return (error.validation ?? []).map((issue) => {
    const property =
      "missingProperty" in issue.params
        ? `/${String(issue.params.missingProperty)}`
        : "additionalProperty" in issue.params
          ? `/${String(issue.params.additionalProperty)}`
          : "";

    return {
      path: `/${context}${issue.instancePath}${property}`,
      code: issue.keyword,
      message: issue.message ?? "Invalid value.",
    };
  });
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
) {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      requestId: request.id,
      ...(details === undefined ? {} : { details }),
    },
  };

  return reply.code(statusCode).send(response);
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error;
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    sendError(reply, request, 404, "NOT_FOUND", "Resource not found."),
  );

  app.setErrorHandler((error, request, reply) => {
    const fastifyError = isFastifyError(error) ? error : undefined;

    if (fastifyError?.validation !== undefined) {
      return sendError(
        reply,
        request,
        400,
        "VALIDATION_ERROR",
        "The request did not match the API contract.",
        validationDetails(fastifyError),
      );
    }

    if (error instanceof ApiError) {
      return sendError(
        reply,
        request,
        error.statusCode,
        error.code,
        error.message,
        error.details,
      );
    }

    const statusCode =
      fastifyError?.statusCode !== undefined &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
        ? fastifyError.statusCode
        : 500;
    const code = statusCodes.get(statusCode) ?? "INTERNAL_ERROR";
    const message =
      statusCode === 500
        ? "An unexpected error occurred."
        : (fastifyError?.message ?? "The request could not be processed.");

    if (statusCode === 500) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    return sendError(reply, request, statusCode, code, message);
  });
}
