import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnvironment({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const localDevelopmentUrl =
  "mysql://event_hub:event_hub@127.0.0.1:3306/event_hub";
const localShadowDatabaseUrl =
  "mysql://event_hub:event_hub@127.0.0.1:3306/event_hub_shadow";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDevelopmentUrl,
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ?? localShadowDatabaseUrl,
  },
});
