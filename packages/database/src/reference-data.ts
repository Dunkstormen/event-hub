export const VATSIM_SCANDINAVIA_VACC = {
  id: "vatsim-scandinavia",
  name: "VATSIM Scandinavia",
} as const;

export type FirSeedRecord = {
  icaoCode: string;
  name: string;
};

export type AirportSeedRecord = {
  icaoCode: string;
  name: string;
  firIcaoCode: string;
};

export const INITIAL_FIRS = [
  { icaoCode: "BIRD", name: "Reykjavík FIR" },
  { icaoCode: "EFIN", name: "Helsinki FIR" },
  { icaoCode: "EKDK", name: "Copenhagen FIR" },
  { icaoCode: "ENOR", name: "Polaris FIR" },
  { icaoCode: "ESAA", name: "Sweden FIR" },
] as const satisfies readonly FirSeedRecord[];

export const INITIAL_AIRPORTS = [
  { icaoCode: "BIAR", name: "Akureyri", firIcaoCode: "BIRD" },
  { icaoCode: "BIEG", name: "Egilsstaðir", firIcaoCode: "BIRD" },
  { icaoCode: "BIKF", name: "Keflavík", firIcaoCode: "BIRD" },
  { icaoCode: "BIRK", name: "Reykjavík", firIcaoCode: "BIRD" },
  { icaoCode: "EFHK", name: "Helsinki-Vantaa", firIcaoCode: "EFIN" },
  { icaoCode: "EFOU", name: "Oulu", firIcaoCode: "EFIN" },
  { icaoCode: "EFTP", name: "Tampere-Pirkkala", firIcaoCode: "EFIN" },
  { icaoCode: "EFTU", name: "Turku", firIcaoCode: "EFIN" },
  { icaoCode: "EKAH", name: "Aarhus", firIcaoCode: "EKDK" },
  { icaoCode: "EKBI", name: "Billund", firIcaoCode: "EKDK" },
  { icaoCode: "EKCH", name: "Copenhagen/Kastrup", firIcaoCode: "EKDK" },
  { icaoCode: "EKYT", name: "Aalborg", firIcaoCode: "EKDK" },
  { icaoCode: "EKVG", name: "Vágar", firIcaoCode: "BIRD" },
  { icaoCode: "ENBR", name: "Bergen/Flesland", firIcaoCode: "ENOR" },
  { icaoCode: "ENGM", name: "Oslo/Gardermoen", firIcaoCode: "ENOR" },
  { icaoCode: "ENVA", name: "Trondheim/Værnes", firIcaoCode: "ENOR" },
  { icaoCode: "ENZV", name: "Stavanger/Sola", firIcaoCode: "ENOR" },
  { icaoCode: "ESGG", name: "Göteborg/Landvetter", firIcaoCode: "ESAA" },
  { icaoCode: "ESMS", name: "Malmö/Sturup", firIcaoCode: "ESAA" },
  { icaoCode: "ESPA", name: "Luleå/Kallax", firIcaoCode: "ESAA" },
  { icaoCode: "ESSA", name: "Stockholm/Arlanda", firIcaoCode: "ESAA" },
] as const satisfies readonly AirportSeedRecord[];
