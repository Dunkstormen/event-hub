import type { Airport, Fir } from "@event-hub/contracts";
import type { Prisma, PrismaClient } from "@event-hub/database";

export type ReferenceDataFilters = {
  query?: string;
  active?: boolean;
  afterIcaoCode?: string;
  limit: number;
};

export type AirportFilters = ReferenceDataFilters & {
  firIcaoCode?: string;
};

export type ReferenceDataPage<T> = {
  items: T[];
  hasNextPage: boolean;
};

export interface ReferenceDataRepository {
  listFirs(filters: ReferenceDataFilters): Promise<ReferenceDataPage<Fir>>;
  findFir(icaoCode: string): Promise<Fir | null>;
  listAirports(filters: AirportFilters): Promise<ReferenceDataPage<Airport>>;
  findAirport(icaoCode: string): Promise<Airport | null>;
}

export const emptyReferenceDataRepository: ReferenceDataRepository = {
  async listFirs() {
    return { items: [], hasNextPage: false };
  },
  async findFir() {
    return null;
  },
  async listAirports() {
    return { items: [], hasNextPage: false };
  },
  async findAirport() {
    return null;
  },
};

function searchWhere(query: string | undefined) {
  if (query === undefined) {
    return {};
  }

  return {
    OR: [
      { icaoCode: { contains: query } },
      { name: { contains: query } },
    ],
  };
}

export function createReferenceDataRepository(
  database: PrismaClient,
): ReferenceDataRepository {
  return {
    async listFirs({ query, active, afterIcaoCode, limit }) {
      const where: Prisma.FirWhereInput = {
        ...searchWhere(query),
        ...(active === undefined ? {} : { active }),
        ...(afterIcaoCode === undefined
          ? {}
          : { icaoCode: { gt: afterIcaoCode } }),
      };
      const rows = await database.fir.findMany({
        where,
        orderBy: { icaoCode: "asc" },
        take: limit + 1,
        select: {
          icaoCode: true,
          name: true,
          active: true,
        },
      });

      return {
        items: rows.slice(0, limit),
        hasNextPage: rows.length > limit,
      };
    },

    async findFir(icaoCode) {
      return database.fir.findUnique({
        where: { icaoCode },
        select: {
          icaoCode: true,
          name: true,
          active: true,
        },
      });
    },

    async listAirports({
      query,
      active,
      afterIcaoCode,
      firIcaoCode,
      limit,
    }) {
      const where: Prisma.AirportWhereInput = {
        ...searchWhere(query),
        ...(active === undefined ? {} : { active }),
        ...(afterIcaoCode === undefined
          ? {}
          : { icaoCode: { gt: afterIcaoCode } }),
        ...(firIcaoCode === undefined
          ? {}
          : { fir: { icaoCode: firIcaoCode } }),
      };
      const rows = await database.airport.findMany({
        where,
        orderBy: { icaoCode: "asc" },
        take: limit + 1,
        select: {
          icaoCode: true,
          name: true,
          active: true,
          fir: {
            select: {
              icaoCode: true,
              name: true,
            },
          },
        },
      });

      return {
        items: rows.slice(0, limit),
        hasNextPage: rows.length > limit,
      };
    },

    async findAirport(icaoCode) {
      return database.airport.findUnique({
        where: { icaoCode },
        select: {
          icaoCode: true,
          name: true,
          active: true,
          fir: {
            select: {
              icaoCode: true,
              name: true,
            },
          },
        },
      });
    },
  };
}
