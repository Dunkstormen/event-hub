import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import {
  parseSessionConfiguration,
  type SessionConfiguration,
} from "@event-hub/config/session";
import {
  parseVatsimConnectConfiguration,
  type VatsimConnectConfiguration,
} from "@event-hub/config/vatsim-connect";
import { parseWebOrigin } from "@event-hub/config/web-origin";
import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  API_VERSION,
  HealthQuerySchema,
  HealthResponseSchema,
  type HealthResponse,
} from "@event-hub/contracts";

import {
  anonymousSessionLifecycle,
  registerSessionRoutes,
  type SessionLifecycle,
} from "./auth/routes.js";
import type { VatsimAuthenticationFlow } from "./auth/vatsim-authentication.js";
import { registerVatsimAuthenticationRoutes } from "./auth/vatsim-routes.js";
import type { AuthorizationAdministration } from "./authorization/administration.js";
import {
  type AuthorizationSessions,
  registerAuthorizationAdministrationRoutes,
} from "./authorization/routes.js";
import type { FirMembershipAdministration } from "./authorization/fir-memberships.js";
import { registerFirMembershipAdministrationRoutes } from "./authorization/fir-membership-routes.js";
import type { ControllerEligibilityAdministration } from "./controller-eligibility/administration.js";
import { registerControllerEligibilityRoutes } from "./controller-eligibility/routes.js";
import { registerErrorHandlers } from "./errors.js";
import {
  emptyReferenceDataRepository,
  type ReferenceDataRepository,
} from "./reference-data/repository.js";
import { registerReferenceDataRoutes } from "./reference-data/routes.js";

type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
  authorizationAdministration?: AuthorizationAdministration | null;
  authorizationSessions?: AuthorizationSessions | null;
  controllerEligibilityAdministration?: ControllerEligibilityAdministration | null;
  firMembershipAdministration?: FirMembershipAdministration | null;
  referenceDataRepository?: ReferenceDataRepository;
  sessionConfiguration?: SessionConfiguration;
  sessionLifecycle?: SessionLifecycle;
  vatsimAuthentication?: VatsimAuthenticationFlow | null;
  vatsimConnectConfiguration?: VatsimConnectConfiguration | null;
  webOrigin?: string;
};

export function buildApp({
  authorizationAdministration = null,
  authorizationSessions = null,
  controllerEligibilityAdministration = null,
  firMembershipAdministration = null,
  logger = false,
  referenceDataRepository = emptyReferenceDataRepository,
  sessionConfiguration = parseSessionConfiguration(process.env),
  sessionLifecycle = anonymousSessionLifecycle,
  vatsimAuthentication = null,
  vatsimConnectConfiguration = parseVatsimConnectConfiguration(
    process.env,
  ),
  webOrigin = parseWebOrigin(process.env),
}: BuildAppOptions = {}) {
  const app = Fastify({
    logger,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(cookie);
  app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || origin === webOrigin);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
    strictPreflight: true,
  });
  registerErrorHandlers(app);
  registerReferenceDataRoutes(app, referenceDataRepository);
  registerSessionRoutes(app, sessionLifecycle, sessionConfiguration);
  registerVatsimAuthenticationRoutes(
    app,
    vatsimAuthentication,
    vatsimConnectConfiguration,
    sessionConfiguration,
  );
  if (
    authorizationAdministration !== null &&
    authorizationSessions !== null
  ) {
    registerAuthorizationAdministrationRoutes(
      app,
      authorizationAdministration,
      authorizationSessions,
      sessionConfiguration,
    );
  }
  if (
    firMembershipAdministration !== null &&
    authorizationSessions !== null
  ) {
    registerFirMembershipAdministrationRoutes(
      app,
      firMembershipAdministration,
      authorizationSessions,
      sessionConfiguration,
    );
  }
  if (
    controllerEligibilityAdministration !== null &&
    authorizationSessions !== null
  ) {
    registerControllerEligibilityRoutes(
      app,
      controllerEligibilityAdministration,
      authorizationSessions,
      sessionConfiguration,
    );
  }

  app.get(
    `${API_PREFIX}/health`,
    {
      schema: {
        querystring: HealthQuerySchema,
        response: {
          200: HealthResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "event-hub-api",
      version: API_VERSION,
    }),
  );

  return app;
}
