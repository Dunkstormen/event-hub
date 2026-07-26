import { type Static, Type } from "@sinclair/typebox";

import { VatsimCidSchema } from "./auth.js";
import {
  AuthorizationAuditRecordSchema,
  AuthorizationFirSchema,
} from "./authorization.js";
import { IcaoCodeSchema } from "./reference-data.js";

const IdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 30,
});

export const FirMembershipSourceSchema = Type.Union([
  Type.Literal("automatic"),
  Type.Literal("manual"),
]);

export type FirMembershipSource = Static<
  typeof FirMembershipSourceSchema
>;

export const FirMembershipStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("revoked"),
]);

export type FirMembershipStatus = Static<
  typeof FirMembershipStatusSchema
>;

export const FirMembershipSchema = Type.Object(
  {
    id: IdentifierSchema,
    fir: AuthorizationFirSchema,
    source: FirMembershipSourceSchema,
    status: FirMembershipStatusSchema,
    sourceProvider: Type.Union([
      Type.String({ minLength: 1, maxLength: 64 }),
      Type.Null(),
    ]),
    providerFreshUntil: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    reason: Type.Union([
      Type.String({ minLength: 3, maxLength: 500 }),
      Type.Null(),
    ]),
    changedBy: Type.Union([
      Type.Object(
        {
          cid: VatsimCidSchema,
          displayName: Type.String({ minLength: 1, maxLength: 191 }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    activeSince: Type.String({ format: "date-time" }),
    revokedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type FirMembership = Static<typeof FirMembershipSchema>;

export const FirMembershipUserSchema = Type.Object(
  {
    id: IdentifierSchema,
    cid: VatsimCidSchema,
    displayName: Type.String({ minLength: 1, maxLength: 191 }),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("disabled"),
    ]),
    memberships: Type.Array(FirMembershipSchema),
  },
  { additionalProperties: false },
);

export type FirMembershipUser = Static<
  typeof FirMembershipUserSchema
>;

export const FirMembershipOverviewSchema = Type.Object(
  {
    firs: Type.Array(AuthorizationFirSchema),
    recentAuditRecords: Type.Array(AuthorizationAuditRecordSchema, {
      maxItems: 25,
    }),
  },
  { additionalProperties: false },
);

export type FirMembershipOverview = Static<
  typeof FirMembershipOverviewSchema
>;

export const FirMembershipUsersQuerySchema = Type.Object(
  {
    q: Type.Optional(
      Type.String({ minLength: 1, maxLength: 191 }),
    ),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    limit: Type.Optional(
      Type.Integer({ minimum: 1, maximum: 50, default: 25 }),
    ),
  },
  { additionalProperties: false },
);

export type FirMembershipUsersQuery = Static<
  typeof FirMembershipUsersQuerySchema
>;

export const FirMembershipUsersResponseSchema = Type.Object(
  {
    items: Type.Array(FirMembershipUserSchema),
    pageInfo: Type.Object(
      {
        hasNextPage: Type.Boolean(),
        nextCursor: Type.Union([Type.String(), Type.Null()]),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type FirMembershipUsersResponse = Static<
  typeof FirMembershipUsersResponseSchema
>;

export const FirMembershipParamsSchema = Type.Object(
  {
    userId: IdentifierSchema,
    firIcaoCode: IcaoCodeSchema,
  },
  { additionalProperties: false },
);

export type FirMembershipParams = Static<
  typeof FirMembershipParamsSchema
>;

export const ManualFirMembershipChangeSchema = Type.Object(
  {
    reason: Type.String({ minLength: 3, maxLength: 500 }),
  },
  { additionalProperties: false },
);

export type ManualFirMembershipChange = Static<
  typeof ManualFirMembershipChangeSchema
>;
