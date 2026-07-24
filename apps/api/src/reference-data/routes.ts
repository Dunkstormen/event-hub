import type { FastifyInstance } from "fastify";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  AirportListResponseSchema,
  AirportQuerySchema,
  AirportSchema,
  DEFAULT_PAGE_SIZE,
  FirListResponseSchema,
  FirSchema,
  ReferenceDataCodeParamsSchema,
  ReferenceDataQuerySchema,
  type AirportListResponse,
  type AirportQuery,
  type FirListResponse,
  type ReferenceDataCodeParams,
  type ReferenceDataQuery,
} from "@event-hub/contracts";

import { ApiError } from "../errors.js";
import type { ReferenceDataRepository } from "./repository.js";

function encodeCursor(icaoCode: string) {
  return Buffer.from(icaoCode, "utf8").toString("base64url");
}

function decodeCursor(cursor: string) {
  const icaoCode = Buffer.from(cursor, "base64url").toString("utf8");
  const canonicalCursor = encodeCursor(icaoCode);

  if (!/^[A-Z]{4}$/.test(icaoCode) || canonicalCursor !== cursor) {
    throw new ApiError(400, "BAD_REQUEST", "The pagination cursor is invalid.");
  }

  return icaoCode;
}

function nextCursor<T extends { icaoCode: string }>(
  items: T[],
  hasNextPage: boolean,
) {
  const lastItem = items.at(-1);

  return hasNextPage && lastItem !== undefined
    ? encodeCursor(lastItem.icaoCode)
    : null;
}

export function registerReferenceDataRoutes(
  app: FastifyInstance,
  repository: ReferenceDataRepository,
) {
  app.get<{ Querystring: ReferenceDataQuery }>(
    `${API_PREFIX}/firs`,
    {
      schema: {
        querystring: ReferenceDataQuerySchema,
        response: {
          200: FirListResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request): Promise<FirListResponse> => {
      const page = await repository.listFirs({
        limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
        ...(request.query.q === undefined
          ? {}
          : { query: request.query.q.trim() }),
        ...(request.query.active === undefined
          ? {}
          : { active: request.query.active }),
        ...(request.query.cursor === undefined
          ? {}
          : { afterIcaoCode: decodeCursor(request.query.cursor) }),
      });

      return {
        items: page.items,
        pageInfo: {
          hasNextPage: page.hasNextPage,
          nextCursor: nextCursor(page.items, page.hasNextPage),
        },
      };
    },
  );

  app.get<{ Params: ReferenceDataCodeParams }>(
    `${API_PREFIX}/firs/:icaoCode`,
    {
      schema: {
        params: ReferenceDataCodeParamsSchema,
        response: {
          200: FirSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const fir = await repository.findFir(request.params.icaoCode);

      if (fir === null) {
        throw new ApiError(404, "NOT_FOUND", "FIR not found.");
      }

      return fir;
    },
  );

  app.get<{ Querystring: AirportQuery }>(
    `${API_PREFIX}/airports`,
    {
      schema: {
        querystring: AirportQuerySchema,
        response: {
          200: AirportListResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request): Promise<AirportListResponse> => {
      const page = await repository.listAirports({
        limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
        ...(request.query.q === undefined
          ? {}
          : { query: request.query.q.trim() }),
        ...(request.query.active === undefined
          ? {}
          : { active: request.query.active }),
        ...(request.query.firIcaoCode === undefined
          ? {}
          : { firIcaoCode: request.query.firIcaoCode }),
        ...(request.query.cursor === undefined
          ? {}
          : { afterIcaoCode: decodeCursor(request.query.cursor) }),
      });

      return {
        items: page.items,
        pageInfo: {
          hasNextPage: page.hasNextPage,
          nextCursor: nextCursor(page.items, page.hasNextPage),
        },
      };
    },
  );

  app.get<{ Params: ReferenceDataCodeParams }>(
    `${API_PREFIX}/airports/:icaoCode`,
    {
      schema: {
        params: ReferenceDataCodeParamsSchema,
        response: {
          200: AirportSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request) => {
      const airport = await repository.findAirport(request.params.icaoCode);

      if (airport === null) {
        throw new ApiError(404, "NOT_FOUND", "Airport not found.");
      }

      return airport;
    },
  );
}
