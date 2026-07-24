import { type Static, Type } from "@sinclair/typebox";

import { listQuerySchema, paginatedResponseSchema } from "./pagination.js";

export const IcaoCodeSchema = Type.String({
  minLength: 4,
  maxLength: 4,
  pattern: "^[A-Z]{4}$",
});

export type IcaoCode = Static<typeof IcaoCodeSchema>;

export const ReferenceDataCodeParamsSchema = Type.Object(
  {
    icaoCode: IcaoCodeSchema,
  },
  { additionalProperties: false },
);

export type ReferenceDataCodeParams = Static<
  typeof ReferenceDataCodeParamsSchema
>;

export const ReferenceDataQuerySchema = listQuerySchema({
  q: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 100,
      pattern: "\\S",
    }),
  ),
  active: Type.Optional(Type.Boolean()),
});

export type ReferenceDataQuery = Static<typeof ReferenceDataQuerySchema>;

export const AirportQuerySchema = listQuerySchema({
  q: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 100,
      pattern: "\\S",
    }),
  ),
  active: Type.Optional(Type.Boolean()),
  firIcaoCode: Type.Optional(IcaoCodeSchema),
});

export type AirportQuery = Static<typeof AirportQuerySchema>;

export const FirSchema = Type.Object(
  {
    icaoCode: IcaoCodeSchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    active: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type Fir = Static<typeof FirSchema>;

export const FirListResponseSchema = paginatedResponseSchema(FirSchema);

export type FirListResponse = Static<typeof FirListResponseSchema>;

export const AirportFirSchema = Type.Object(
  {
    icaoCode: IcaoCodeSchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
  },
  { additionalProperties: false },
);

export const AirportSchema = Type.Object(
  {
    icaoCode: IcaoCodeSchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    active: Type.Boolean(),
    fir: AirportFirSchema,
  },
  { additionalProperties: false },
);

export type Airport = Static<typeof AirportSchema>;

export const AirportListResponseSchema = paginatedResponseSchema(AirportSchema);

export type AirportListResponse = Static<typeof AirportListResponseSchema>;
