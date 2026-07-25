import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  seedReferenceData,
} from "@event-hub/database";
import { requireTestDatabaseUrl } from "@event-hub/database/testing";

import { buildApp } from "../app.js";
import { createReferenceDataRepository } from "./repository.js";

const database = createDatabaseClient(requireTestDatabaseUrl());
const app = buildApp({
  referenceDataRepository: createReferenceDataRepository(database),
});
let referenceDataPrepared = false;

async function clearReferenceData() {
  await database.airport.deleteMany();
  await database.fir.deleteMany();
  await database.vacc.deleteMany();
}

beforeAll(async () => {
  await clearReferenceData();
  await seedReferenceData(database);
  referenceDataPrepared = true;
});

afterAll(async () => {
  try {
    await app.close();

    if (referenceDataPrepared) {
      await clearReferenceData();
    }
  } finally {
    await database.$disconnect();
  }
});

describe("reference-data API integration", () => {
  it("paginates canonical FIR records from the isolated database", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/firs?limit=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          icaoCode: "BIRD",
          name: "Reykjavík FIR",
          active: true,
        },
        {
          icaoCode: "EFIN",
          name: "Helsinki FIR",
          active: true,
        },
      ],
      pageInfo: {
        hasNextPage: true,
        nextCursor: "RUZJTg",
      },
    });
  });

  it("filters airports through their persisted FIR relation", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/airports?firIcaoCode=EKDK&q=cope",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          icaoCode: "EKCH",
          name: "Copenhagen/Kastrup",
          active: true,
          fir: {
            icaoCode: "EKDK",
            name: "Copenhagen FIR",
          },
        },
      ],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null,
      },
    });
  });
});
