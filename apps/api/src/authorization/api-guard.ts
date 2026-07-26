import type { SessionConfiguration } from "@event-hub/config/session";
import type { FastifyRequest } from "fastify";

import type { AuthenticatedActor } from "../auth/session-service.js";
import { ApiError } from "../errors.js";
import type { AuthorizationSessions } from "./routes.js";
import {
  AuthorizationPolicy,
  AuthorizationPolicyDeniedError,
  canReadEvent,
  type EventReadTarget,
} from "./policy.js";

type RequestWithCookies = Pick<FastifyRequest, "cookies">;

function forbidden(message: string): never {
  throw new ApiError(403, "FORBIDDEN", message);
}

export class AuthorizationApiGuard {
  readonly #configuration: SessionConfiguration;
  readonly #policy: AuthorizationPolicy;
  readonly #sessions: AuthorizationSessions;

  constructor(
    sessions: AuthorizationSessions,
    policy: AuthorizationPolicy,
    configuration: SessionConfiguration,
  ) {
    this.#configuration = configuration;
    this.#policy = policy;
    this.#sessions = sessions;
  }

  async optionalActor(
    request: RequestWithCookies,
  ): Promise<AuthenticatedActor | null> {
    return this.#sessions.authenticateActor(
      request.cookies[this.#configuration.cookieName],
    );
  }

  async requireActor(
    request: RequestWithCookies,
  ): Promise<AuthenticatedActor> {
    const actor = await this.optionalActor(request);

    if (actor === null) {
      throw new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      );
    }

    return actor;
  }

  async requireGlobal(
    request: RequestWithCookies,
    capabilityKey: string,
    message = "You do not have permission to perform this operation.",
  ) {
    const actor = await this.requireActor(request);

    try {
      await this.#policy.requireGlobal(actor.id, capabilityKey);
    } catch (error) {
      if (error instanceof AuthorizationPolicyDeniedError) {
        forbidden(message);
      }
      throw error;
    }

    return actor;
  }

  async requireFir(
    request: RequestWithCookies,
    capabilityKey: string,
    firIcaoCode: string,
    message = "You do not have permission in this FIR.",
  ) {
    const actor = await this.requireActor(request);

    try {
      await this.#policy.requireFir(
        actor.id,
        capabilityKey,
        firIcaoCode,
      );
    } catch (error) {
      if (error instanceof AuthorizationPolicyDeniedError) {
        forbidden(message);
      }
      throw error;
    }

    return actor;
  }

  async requireAdministrator(
    request: RequestWithCookies,
    message = "Administrator permission is required.",
  ) {
    const actor = await this.requireActor(request);

    try {
      await this.#policy.requireAdministrator(actor.id);
    } catch (error) {
      if (error instanceof AuthorizationPolicyDeniedError) {
        forbidden(message);
      }
      throw error;
    }

    return actor;
  }

  async requireController(
    request: RequestWithCookies,
    firIcaoCode?: string,
    message = "Current controller eligibility is required.",
  ) {
    const actor = await this.requireActor(request);

    try {
      await this.#policy.requireController(actor.id, firIcaoCode);
    } catch (error) {
      if (error instanceof AuthorizationPolicyDeniedError) {
        forbidden(message);
      }
      throw error;
    }

    return actor;
  }

  async canReadEvent(
    request: RequestWithCookies,
    event: EventReadTarget,
  ) {
    if (event.published) {
      return true;
    }

    const actor = await this.optionalActor(request);
    if (actor === null) {
      return false;
    }

    const authorization = await this.#policy.evaluate(actor.id);
    return canReadEvent(authorization, event);
  }
}
