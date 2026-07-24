import {
  createDatabaseClient,
  INITIAL_AIRPORTS,
  INITIAL_FIRS,
  VATSIM_SCANDINAVIA_VACC,
} from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const database = createDatabaseClient(databaseUrl);

try {
  await database.$transaction(async (transaction) => {
    await transaction.vacc.upsert({
      where: { id: VATSIM_SCANDINAVIA_VACC.id },
      update: { name: VATSIM_SCANDINAVIA_VACC.name },
      create: VATSIM_SCANDINAVIA_VACC,
    });

    for (const fir of INITIAL_FIRS) {
      await transaction.fir.upsert({
        where: { icaoCode: fir.icaoCode },
        update: {
          name: fir.name,
          vaccId: VATSIM_SCANDINAVIA_VACC.id,
        },
        create: {
          ...fir,
          active: true,
          vaccId: VATSIM_SCANDINAVIA_VACC.id,
        },
      });
    }

    const firs = await transaction.fir.findMany({
      where: {
        icaoCode: { in: INITIAL_FIRS.map((fir) => fir.icaoCode) },
      },
      select: { id: true, icaoCode: true },
    });
    const firIds = new Map(firs.map((fir) => [fir.icaoCode, fir.id]));

    for (const airport of INITIAL_AIRPORTS) {
      const firId = firIds.get(airport.firIcaoCode);

      if (firId === undefined) {
        throw new Error(
          `Cannot seed ${airport.icaoCode}: FIR ${airport.firIcaoCode} is missing.`,
        );
      }

      await transaction.airport.upsert({
        where: { icaoCode: airport.icaoCode },
        update: {
          name: airport.name,
          firId,
        },
        create: {
          icaoCode: airport.icaoCode,
          name: airport.name,
          active: true,
          firId,
        },
      });
    }
  });

  console.info("Database seed completed.");
} finally {
  await database.$disconnect();
}
