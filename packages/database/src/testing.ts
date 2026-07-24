import { parseMySqlDatabaseUrl } from "./url.js";

const testDatabasePattern = /(?:^|_)test$/i;

export function assertSafeTestDatabaseUrl(value: string): string {
  const { databaseName } = parseMySqlDatabaseUrl(value);

  if (!testDatabasePattern.test(databaseName)) {
    throw new Error(
      `Refusing test database operation: "${databaseName}" is not explicitly named as a test database.`,
    );
  }

  return value;
}

export function requireTestDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment.TEST_DATABASE_URL;

  if (value === undefined || value.trim() === "") {
    throw new Error(
      "TEST_DATABASE_URL is required; DATABASE_URL is never used for test database operations.",
    );
  }

  return assertSafeTestDatabaseUrl(value);
}
