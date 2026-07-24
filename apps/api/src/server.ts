import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { DEFAULT_API_HOST, DEFAULT_API_PORT, parsePort } from "@event-hub/config/server";
import { createDatabaseClient } from "@event-hub/database";

import { buildApp } from "./app.js";
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
const app = buildApp({
  logger: true,
  referenceDataRepository: createReferenceDataRepository(database),
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
