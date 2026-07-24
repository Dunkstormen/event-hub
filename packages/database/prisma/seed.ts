import { createDatabaseClient } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const database = createDatabaseClient(databaseUrl);

try {
  await database.vacc.upsert({
    where: {
      id: "vatsim-scandinavia",
    },
    update: {},
    create: {
      id: "vatsim-scandinavia",
      name: "VATSIM Scandinavia",
    },
  });
  console.info("Database seed completed.");
} finally {
  await database.$disconnect();
}
