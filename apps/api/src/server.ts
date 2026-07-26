import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  parsePort,
} from "@event-hub/config/server";
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
import { createFirMembershipAdministration } from "./authorization/fir-memberships.js";
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
const vatsimConnectConfiguration =
  parseVatsimConnectConfiguration(process.env);
const sessionService = new SessionService(
  createIdentitySessionRepository(database),
  { ttlSeconds: sessionConfiguration.ttlSeconds },
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
  authorizationSessions: sessionService,
  firMembershipAdministration:
    createFirMembershipAdministration(database),
  logger: true,
  referenceDataRepository: createReferenceDataRepository(database),
  sessionConfiguration,
  sessionLifecycle: sessionService,
  vatsimAuthentication,
  vatsimConnectConfiguration,
});

app.addHook("onClose", async () => {
  await database.$disconnect();
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
