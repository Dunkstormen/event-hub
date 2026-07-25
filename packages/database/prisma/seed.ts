import {
  createDatabaseClient,
  seedReferenceData,
} from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const database = createDatabaseClient(databaseUrl);

try {
  await seedReferenceData(database);

  console.info("Database seed completed.");
} finally {
  await database.$disconnect();
}
