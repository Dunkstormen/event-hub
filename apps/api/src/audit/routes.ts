import type { FastifyInstance } from "fastify";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  AuditRecordsQuerySchema,
  AuditRecordsResponseSchema,
  DEFAULT_PAGE_SIZE,
  type AuditRecordsQuery,
} from "@event-hub/contracts";

import type { AuthorizationApiGuard } from "../authorization/api-guard.js";
import { ApiError } from "../errors.js";
import type {
  AuditAdministration,
  AuditRecordCursor,
} from "./administration.js";

function encodeCursor(cursor: AuditRecordCursor) {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): AuditRecordCursor {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;

    if (
      value === null ||
      typeof value !== "object" ||
      !("createdAt" in value) ||
      !("id" in value) ||
      typeof value.createdAt !== "string" ||
      typeof value.id !== "string"
    ) {
      throw new Error("Invalid cursor payload.");
    }

    const createdAt = new Date(value.createdAt);
    const decoded = { createdAt, id: value.id };

    if (
      Number.isNaN(createdAt.valueOf()) ||
      value.id.length < 1 ||
      value.id.length > 30 ||
      encodeCursor(decoded) !== cursor
    ) {
      throw new Error("Invalid cursor value.");
    }

    return decoded;
  } catch {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The pagination cursor is invalid.",
    );
  }
}

export function registerAuditAdministrationRoutes(
  app: FastifyInstance,
  administration: AuditAdministration,
  guard: AuthorizationApiGuard,
) {
  app.get<{ Querystring: AuditRecordsQuery }>(
    `${API_PREFIX}/admin/audit`,
    {
      schema: {
        querystring: AuditRecordsQuerySchema,
        response: {
          200: AuditRecordsResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await guard.requireAdministrator(request);

      const from =
        request.query.from === undefined
          ? undefined
          : new Date(request.query.from);
      const to =
        request.query.to === undefined
          ? undefined
          : new Date(request.query.to);

      if (from !== undefined && to !== undefined && from > to) {
        throw new ApiError(
          400,
          "BAD_REQUEST",
          "The start time must not be after the end time.",
        );
      }

      const page = await administration.list(
        {
          ...(request.query.q === undefined
            ? {}
            : { query: request.query.q }),
          ...(request.query.actorCid === undefined
            ? {}
            : { actorCid: request.query.actorCid }),
          ...(request.query.action === undefined
            ? {}
            : { action: request.query.action }),
          ...(request.query.targetKind === undefined
            ? {}
            : { targetKind: request.query.targetKind }),
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
        },
        {
          limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
          ...(request.query.cursor === undefined
            ? {}
            : { after: decodeCursor(request.query.cursor) }),
        },
      );
      const lastRecord = page.items.at(-1);

      return {
        items: page.items,
        pageInfo: {
          hasNextPage: page.hasNextPage,
          nextCursor:
            page.hasNextPage && lastRecord !== undefined
              ? encodeCursor({
                  createdAt: new Date(lastRecord.createdAt),
                  id: lastRecord.id,
                })
              : null,
        },
      };
    },
  );
}
