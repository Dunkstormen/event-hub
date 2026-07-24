import { DEFAULT_API_HOST, DEFAULT_API_PORT, parsePort } from "@event-hub/config/server";

import { buildApp } from "./app.js";

const app = buildApp({ logger: true });

const host = process.env.API_HOST ?? DEFAULT_API_HOST;
const port = parsePort(process.env.API_PORT, DEFAULT_API_PORT);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
