import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  parsePort,
} from "@event-hub/config/server";
import { parseControllerEligibilityConfiguration } from "@event-hub/config/controller-eligibility";
import { parseSessionConfiguration } from "@event-hub/config/session";
import { parseVatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";
import { createDatabaseClient } from "@event-hub/database";

import { buildApp } from "./app.js";
import { createIdentitySessionRepository } from "./auth/repository.js";
import { SessionService } from "./auth/session-service.js";
import { OAuthTransactionManager } from "./auth/oauth-transaction.js";
import { VatsimAuthenticationService } from "./auth/vatsim-authentication.js";
import { VatsimConnectClient } from "./auth/vatsim-connect-client.js";
import { createAuthorizationAdministration } from "./authorization/administration.js";
import { AuthorizationPolicy } from "./authorization/policy.js";
import { createFirMembershipAdministration } from "./authorization/fir-memberships.js";
import { createControllerEligibilityAdministration } from "./controller-eligibility/administration.js";
import { ControlCenterEligibilityProvider } from "./controller-eligibility/control-center-provider.js";
import { ProviderHttpClient } from "./controller-eligibility/http-client.js";
import type { ControllerEligibilityProvider } from "./controller-eligibility/provider.js";
import { ControllerEligibilityScheduler } from "./controller-eligibility/scheduler.js";
import { ControllerEligibilitySynchronization } from "./controller-eligibility/synchronization.js";
import { VateudEligibilityProvider } from "./controller-eligibility/vateud-provider.js";
import { createReferenceDataRepository } from "./reference-data/repository.js";

try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL;

const host = process.env.API_HOST ?? DEFAULT_API_HOST;
const port = parsePort(process.env.API_PORT, DEFAULT_API_PORT);

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to start the API.");
}

const database = createDatabaseClient(databaseUrl);
const sessionConfiguration = parseSessionConfiguration(process.env);
const controllerEligibilityConfiguration =
  parseControllerEligibilityConfiguration(process.env);
const vatsimConnectConfiguration =
  parseVatsimConnectConfiguration(process.env);
const sessionService = new SessionService(
  createIdentitySessionRepository(database),
  { ttlSeconds: sessionConfiguration.ttlSeconds },
);
const eligibilityHttpClient = new ProviderHttpClient({
  requestTimeoutMs:
    controllerEligibilityConfiguration.requestTimeoutMs,
});
const eligibilityProviders: ControllerEligibilityProvider[] = [];
if (controllerEligibilityConfiguration.controlCenter !== null) {
  eligibilityProviders.push(
    new ControlCenterEligibilityProvider(
      controllerEligibilityConfiguration.controlCenter,
      { httpClient: eligibilityHttpClient },
    ),
  );
}
if (controllerEligibilityConfiguration.vateud !== null) {
  eligibilityProviders.push(
    new VateudEligibilityProvider(
      controllerEligibilityConfiguration.vateud,
      { httpClient: eligibilityHttpClient },
    ),
  );
}
const controllerEligibilitySynchronization =
  new ControllerEligibilitySynchronization(
    database,
    eligibilityProviders,
    {
      freshnessSeconds:
        controllerEligibilityConfiguration.freshnessSeconds,
    },
  );
const vatsimAuthentication =
  vatsimConnectConfiguration === null
    ? null
    : new VatsimAuthenticationService(
        new VatsimConnectClient(vatsimConnectConfiguration),
        sessionService,
        new OAuthTransactionManager(),
      );
const app = buildApp({
  authorizationAdministration:
    createAuthorizationAdministration(database),
  authorizationPolicy: new AuthorizationPolicy(database),
  authorizationSessions: sessionService,
  controllerEligibilityAdministration:
    createControllerEligibilityAdministration(
      database,
      controllerEligibilitySynchronization,
    ),
  firMembershipAdministration:
    createFirMembershipAdministration(database),
  logger: true,
  referenceDataRepository: createReferenceDataRepository(database),
  sessionConfiguration,
  sessionLifecycle: sessionService,
  vatsimAuthentication,
  vatsimConnectConfiguration,
});
const controllerEligibilityScheduler =
  new ControllerEligibilityScheduler(
    database,
    controllerEligibilitySynchronization,
    {
      logger: app.log,
      syncIntervalSeconds:
        controllerEligibilityConfiguration.syncIntervalSeconds,
    },
  );

app.addHook("onClose", async () => {
  controllerEligibilityScheduler.stop();
  await database.$disconnect();
});

try {
  await app.listen({ host, port });
  controllerEligibilityScheduler.start();
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
