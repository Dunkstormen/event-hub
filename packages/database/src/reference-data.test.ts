import { describe, expect, it } from "vitest";

import { INITIAL_AIRPORTS, INITIAL_FIRS } from "./reference-data.js";

const ICAO_CODE = /^[A-Z]{4}$/;

describe("initial reference data", () => {
  it("contains unique, uppercase ICAO codes", () => {
    const firCodes = INITIAL_FIRS.map((fir) => fir.icaoCode);
    const airportCodes = INITIAL_AIRPORTS.map((airport) => airport.icaoCode);

    expect(new Set(firCodes).size).toBe(firCodes.length);
    expect(new Set(airportCodes).size).toBe(airportCodes.length);
    expect([...firCodes, ...airportCodes].every((code) => ICAO_CODE.test(code))).toBe(
      true,
    );
  });

  it("associates every airport with a seeded FIR", () => {
    const firCodes = new Set(INITIAL_FIRS.map((fir) => fir.icaoCode));

    expect(
      INITIAL_AIRPORTS.every((airport) => firCodes.has(airport.firIcaoCode)),
    ).toBe(true);
  });
});
