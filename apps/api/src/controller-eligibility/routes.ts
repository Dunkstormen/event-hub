import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  ControllerEligibilityProviderParamsSchema,
  ControllerEligibilityStatusSchema,
  ControllerEligibilitySyncResultSchema,
  type ControllerEligibilityProviderParams,
} from "@event-hub/contracts";
import { FIR_MEMBERSHIPS_MANAGE_CAPABILITY } from "@event-hub/database";

import type { AuthorizationApiGuard } from "../authorization/api-guard.js";
import { ApiError } from "../errors.js";
import {
  type ControllerEligibilityAdministration,
  ControllerEligibilityDeniedError,
  ControllerEligibilityNotConfiguredError,
} from "./administration.js";
import { EligibilityProviderError } from "./provider.js";

async function requireActor(
  request: FastifyRequest,
  guard: AuthorizationApiGuard,
) {
  return guard.requireGlobal(
    request,
    FIR_MEMBERSHIPS_MANAGE_CAPABILITY,
    "You cannot manage controller eligibility synchronization.",
  );
}

function translateError(error: unknown): never {
  if (error instanceof ControllerEligibilityDeniedError) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You cannot manage controller eligibility synchronization.",
    );
  }
  if (error instanceof ControllerEligibilityNotConfiguredError) {
    throw new ApiError(409, "CONFLICT", error.message);
  }
  if (error instanceof EligibilityProviderError) {
    throw new ApiError(
      502,
      "INTERNAL_ERROR",
      "The eligibility provider synchronization failed. Existing evidence was not changed.",
    );
  }
  throw error;
}

export function registerControllerEligibilityRoutes(
  app: FastifyInstance,
  administration: ControllerEligibilityAdministration,
  guard: AuthorizationApiGuard,
) {
  app.get(
    `${API_PREFIX}/admin/controller-eligibility`,
    {
      schema: {
        response: {
          200: ControllerEligibilityStatusSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await requireActor(request, guard);
      try {
        return await administration.getStatus(actor.id);
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: ControllerEligibilityProviderParams }>(
    `${API_PREFIX}/admin/controller-eligibility/:provider/sync`,
    {
      schema: {
        params: ControllerEligibilityProviderParamsSchema,
        response: {
          200: ControllerEligibilitySyncResultSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const actor = await requireActor(request, guard);
      try {
        return await administration.synchronize(
          actor.id,
          request.params.provider,
        );
      } catch (error) {
        translateError(error);
      }
    },
  );
}
