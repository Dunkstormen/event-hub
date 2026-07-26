import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "./generated/prisma/client.js";
import { parseMySqlDatabaseUrl } from "./url.js";

export { Prisma, PrismaClient } from "./generated/prisma/client.js";
export {
  ADMINISTRATOR_ROLE_KEY,
  EVENT_COORDINATOR_ROLE_KEY,
  GLOBAL_ROLE_SCOPE_KEY,
  INITIAL_CAPABILITIES,
  INITIAL_ROLES,
  PILOT_ROLE_KEY,
  parseBootstrapAdministratorCid,
  seedAuthorizationModel,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "./authorization.js";
export {
  INITIAL_AIRPORTS,
  INITIAL_FIRS,
  VATSIM_SCANDINAVIA_VACC,
  type AirportSeedRecord,
  type FirSeedRecord,
} from "./reference-data.js";
export { seedReferenceData } from "./seed.js";

export function createDatabaseClient(databaseUrl: string) {
  parseMySqlDatabaseUrl(databaseUrl);

  const adapter = new PrismaMariaDb(databaseUrl);

  return new PrismaClient({ adapter });
}
