export interface ParsedDatabaseUrl {
  databaseName: string;
  hostname: string;
  port: number;
}

export function parseMySqlDatabaseUrl(value: string): ParsedDatabaseUrl {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Database URL must be a valid mysql:// URL.");
  }

  if (url.protocol !== "mysql:") {
    throw new Error("Database URL must use the mysql:// protocol.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (
    url.hostname === "" ||
    url.username === "" ||
    databaseName === "" ||
    databaseName.includes("/")
  ) {
    throw new Error(
      "Database URL must include a host, username, and database name.",
    );
  }

  const port = url.port === "" ? 3306 : Number(url.port);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Database URL contains an invalid port.");
  }

  return {
    databaseName,
    hostname: url.hostname,
    port,
  };
}
