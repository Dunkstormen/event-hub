import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";

import { requireTestDatabaseUrl } from "../src/testing.js";

loadEnvironment({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const operation = process.argv[2];

if (operation !== "migrate" && operation !== "reset") {
  throw new Error('Expected test database operation "migrate" or "reset".');
}

const testDatabaseUrl = requireTestDatabaseUrl();
const prismaArguments =
  operation === "migrate"
    ? ["exec", "prisma", "migrate", "deploy"]
    : ["exec", "prisma", "migrate", "reset", "--force"];
const packageManager = process.env.npm_execpath;

if (packageManager === undefined || packageManager.trim() === "") {
  throw new Error("Unable to locate pnpm for the test database operation.");
}

const result = spawnSync(process.execPath, [packageManager, ...prismaArguments], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  },
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
