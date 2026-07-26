import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  FirMembershipOverviewSchema,
  FirMembershipParamsSchema,
  FirMembershipSchema,
  FirMembershipUsersQuerySchema,
  FirMembershipUsersResponseSchema,
  ManualFirMembershipChangeSchema,
  type FirMembershipParams,
  type FirMembershipUsersQuery,
  type ManualFirMembershipChange,
} from "@event-hub/contracts";
import { FIR_MEMBERSHIPS_MANAGE_CAPABILITY } from "@event-hub/database";

import { ApiError } from "../errors.js";
import type { AuthorizationApiGuard } from "./api-guard.js";
import {
  type FirMembershipAdministration,
  FirMembershipDeniedError,
  FirMembershipModelError,
  FirMembershipNotFoundError,
} from "./fir-memberships.js";

const defaultUserPageSize = 25;

function encodeUserCursor(cid: string) {
  return Buffer.from(cid, "utf8").toString("base64url");
}

function decodeUserCursor(cursor: string) {
  const cid = Buffer.from(cursor, "base64url").toString("utf8");

  if (
    !/^[0-9]{1,16}$/u.test(cid) ||
    encodeUserCursor(cid) !== cursor
  ) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The pagination cursor is invalid.",
    );
  }

  return cid;
}

function translateMembershipError(error: unknown): never {
  if (error instanceof FirMembershipDeniedError) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You cannot manage FIR memberships.",
    );
  }

  if (error instanceof FirMembershipNotFoundError) {
    throw new ApiError(404, "NOT_FOUND", error.message);
  }

  if (error instanceof FirMembershipModelError) {
    throw new ApiError(400, "BAD_REQUEST", error.message);
  }

  throw error;
}

async function requireActor(
  request: FastifyRequest,
  guard: AuthorizationApiGuard,
) {
  return guard.requireGlobal(
    request,
    FIR_MEMBERSHIPS_MANAGE_CAPABILITY,
    "You cannot manage FIR memberships.",
  );
}

export function registerFirMembershipAdministrationRoutes(
  app: FastifyInstance,
  administration: FirMembershipAdministration,
  guard: AuthorizationApiGuard,
) {
  app.get(
    `${API_PREFIX}/admin/fir-memberships`,
    {
      schema: {
        response: {
          200: FirMembershipOverviewSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await requireActor(request, guard);

      try {
        return await administration.getOverview(actor.id);
      } catch (error) {
        translateMembershipError(error);
      }
    },
  );

  app.get<{ Querystring: FirMembershipUsersQuery }>(
    `${API_PREFIX}/admin/fir-memberships/users`,
    {
      schema: {
        querystring: FirMembershipUsersQuerySchema,
        response: {
          200: FirMembershipUsersResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await requireActor(request, guard);
      const limit = request.query.limit ?? defaultUserPageSize;

      try {
        const page = await administration.listUsers(actor.id, {
          limit,
          ...(request.query.q === undefined
            ? {}
            : { query: request.query.q }),
          ...(request.query.cursor === undefined
            ? {}
            : {
                afterCid: decodeUserCursor(request.query.cursor),
              }),
        });
        const lastUser = page.items.at(-1);

        return {
          items: page.items,
          pageInfo: {
            hasNextPage: page.hasNextPage,
            nextCursor:
              page.hasNextPage && lastUser !== undefined
                ? encodeUserCursor(lastUser.cid)
                : null,
          },
        };
      } catch (error) {
        translateMembershipError(error);
      }
    },
  );

  app.put<{
    Params: FirMembershipParams;
    Body: ManualFirMembershipChange;
  }>(
    `${API_PREFIX}/admin/fir-memberships/users/:userId/firs/:firIcaoCode`,
    {
      schema: {
        params: FirMembershipParamsSchema,
        body: ManualFirMembershipChangeSchema,
        response: {
          200: FirMembershipSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const actor = await requireActor(request, guard);

      try {
        return await administration.assignManual(actor.id, {
          userId: request.params.userId,
          firIcaoCode: request.params.firIcaoCode,
          reason: request.body.reason,
        });
      } catch (error) {
        translateMembershipError(error);
      }
    },
  );

  app.delete<{
    Params: FirMembershipParams;
    Body: ManualFirMembershipChange;
  }>(
    `${API_PREFIX}/admin/fir-memberships/users/:userId/firs/:firIcaoCode`,
    {
      schema: {
        params: FirMembershipParamsSchema,
        body: ManualFirMembershipChangeSchema,
        response: {
          200: FirMembershipSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const actor = await requireActor(request, guard);

      try {
        return await administration.revokeManual(actor.id, {
          userId: request.params.userId,
          firIcaoCode: request.params.firIcaoCode,
          reason: request.body.reason,
        });
      } catch (error) {
        translateMembershipError(error);
      }
    },
  );
}
