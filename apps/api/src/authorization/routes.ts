import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  AuthorizationAssignmentParamsSchema,
  AuthorizationAssignmentSchema,
  AuthorizationOverviewSchema,
  AuthorizationRoleParamsSchema,
  AuthorizationRoleSchema,
  AuthorizationUserParamsSchema,
  AuthorizationUsersQuerySchema,
  AuthorizationUsersResponseSchema,
  CreateAuthorizationAssignmentSchema,
  CreateAuthorizationRoleSchema,
  UpdateAuthorizationRoleSchema,
  type AuthorizationAssignmentParams,
  type AuthorizationRoleParams,
  type AuthorizationUserParams,
  type AuthorizationUsersQuery,
  type CreateAuthorizationAssignment,
  type CreateAuthorizationRole,
  type UpdateAuthorizationRole,
} from "@event-hub/contracts";
import { AUTHORIZATION_MANAGE_CAPABILITY } from "@event-hub/database";

import { ApiError } from "../errors.js";
import type { SessionService } from "../auth/session-service.js";
import type { AuthorizationApiGuard } from "./api-guard.js";
import {
  type AuthorizationAdministration,
  AuthorizationConflictError,
  AuthorizationDeniedError,
  AuthorizationModelError,
  AuthorizationNotFoundError,
} from "./administration.js";

const defaultUserPageSize = 25;

export type AuthorizationSessions = Pick<
  SessionService,
  "authenticateActor"
>;

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

function translateAuthorizationError(error: unknown): never {
  if (error instanceof AuthorizationDeniedError) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You cannot manage authorization.",
    );
  }

  if (error instanceof AuthorizationNotFoundError) {
    throw new ApiError(404, "NOT_FOUND", error.message);
  }

  if (error instanceof AuthorizationConflictError) {
    throw new ApiError(409, "CONFLICT", error.message);
  }

  if (error instanceof AuthorizationModelError) {
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
    AUTHORIZATION_MANAGE_CAPABILITY,
    "You cannot manage authorization.",
  );
}

export function registerAuthorizationAdministrationRoutes(
  app: FastifyInstance,
  administration: AuthorizationAdministration,
  guard: AuthorizationApiGuard,
) {
  app.get(
    `${API_PREFIX}/admin/authorization`,
    {
      schema: {
        response: {
          200: AuthorizationOverviewSchema,
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
        translateAuthorizationError(error);
      }
    },
  );

  app.get<{ Querystring: AuthorizationUsersQuery }>(
    `${API_PREFIX}/admin/authorization/users`,
    {
      schema: {
        querystring: AuthorizationUsersQuerySchema,
        response: {
          200: AuthorizationUsersResponseSchema,
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
        translateAuthorizationError(error);
      }
    },
  );

  app.post<{ Body: CreateAuthorizationRole }>(
    `${API_PREFIX}/admin/authorization/roles`,
    {
      schema: {
        body: CreateAuthorizationRoleSchema,
        response: {
          201: AuthorizationRoleSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      const actor = await requireActor(request, guard);

      try {
        const role = await administration.createRole(
          actor.id,
          request.body,
        );
        return reply.code(201).send(role);
      } catch (error) {
        translateAuthorizationError(error);
      }
    },
  );

  app.patch<{
    Params: AuthorizationRoleParams;
    Body: UpdateAuthorizationRole;
  }>(
    `${API_PREFIX}/admin/authorization/roles/:roleKey`,
    {
      schema: {
        params: AuthorizationRoleParamsSchema,
        body: UpdateAuthorizationRoleSchema,
        response: {
          200: AuthorizationRoleSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const actor = await requireActor(request, guard);

      try {
        return await administration.updateRole(
          actor.id,
          request.params.roleKey,
          request.body,
        );
      } catch (error) {
        translateAuthorizationError(error);
      }
    },
  );

  app.delete<{ Params: AuthorizationRoleParams }>(
    `${API_PREFIX}/admin/authorization/roles/:roleKey`,
    {
      schema: {
        params: AuthorizationRoleParamsSchema,
        response: {
          204: Type.Null(),
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      const actor = await requireActor(request, guard);

      try {
        const deleted = await administration.deleteRole(
          actor.id,
          request.params.roleKey,
        );

        if (!deleted) {
          throw new ApiError(404, "NOT_FOUND", "Role not found.");
        }

        return reply.code(204).send();
      } catch (error) {
        translateAuthorizationError(error);
      }
    },
  );

  app.post<{
    Params: AuthorizationUserParams;
    Body: CreateAuthorizationAssignment;
  }>(
    `${API_PREFIX}/admin/authorization/users/:userId/assignments`,
    {
      schema: {
        params: AuthorizationUserParamsSchema,
        body: CreateAuthorizationAssignmentSchema,
        response: {
          201: AuthorizationAssignmentSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      const actor = await requireActor(request, guard);

      try {
        const assignment = await administration.assignRole(actor.id, {
          userId: request.params.userId,
          roleKey: request.body.roleKey,
          ...(request.body.firIcaoCode === undefined
            ? {}
            : { firIcaoCode: request.body.firIcaoCode }),
        });
        return reply.code(201).send(assignment);
      } catch (error) {
        translateAuthorizationError(error);
      }
    },
  );

  app.delete<{ Params: AuthorizationAssignmentParams }>(
    `${API_PREFIX}/admin/authorization/assignments/:assignmentId`,
    {
      schema: {
        params: AuthorizationAssignmentParamsSchema,
        response: {
          204: Type.Null(),
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      const actor = await requireActor(request, guard);

      try {
        const revoked = await administration.revokeAssignment(
          actor.id,
          request.params.assignmentId,
        );

        if (!revoked) {
          throw new ApiError(
            404,
            "NOT_FOUND",
            "Role assignment not found.",
          );
        }

        return reply.code(204).send();
      } catch (error) {
        translateAuthorizationError(error);
      }
    },
  );
}
