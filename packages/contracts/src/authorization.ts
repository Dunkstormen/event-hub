import { type Static, Type } from "@sinclair/typebox";

import { VatsimCidSchema } from "./auth.js";
import { IcaoCodeSchema } from "./reference-data.js";

const IdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 30,
});

export const RoleKeySchema = Type.String({
  minLength: 2,
  maxLength: 64,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
});

export const CapabilityKeySchema = Type.String({
  minLength: 3,
  maxLength: 96,
  pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)*$",
});

export const AuthorizationRoleScopeSchema = Type.Union([
  Type.Literal("global"),
  Type.Literal("fir"),
]);

export type AuthorizationRoleScope = Static<
  typeof AuthorizationRoleScopeSchema
>;

export const AuthorizationCapabilityScopeSchema = Type.Union([
  Type.Literal("global"),
  Type.Literal("global-or-fir"),
]);

export const AuthorizationCapabilitySchema = Type.Object(
  {
    key: CapabilityKeySchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    scope: AuthorizationCapabilityScopeSchema,
  },
  { additionalProperties: false },
);

export type AuthorizationCapability = Static<
  typeof AuthorizationCapabilitySchema
>;

export const AuthorizationRoleSchema = Type.Object(
  {
    key: RoleKeySchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    scope: AuthorizationRoleScopeSchema,
    protected: Type.Boolean(),
    capabilityKeys: Type.Array(CapabilityKeySchema, {
      maxItems: 100,
      uniqueItems: true,
    }),
    assignmentCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type AuthorizationRole = Static<typeof AuthorizationRoleSchema>;

export const AuthorizationFirSchema = Type.Object(
  {
    icaoCode: IcaoCodeSchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    active: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const EffectiveCapabilitySchema = Type.Object(
  {
    capabilityKey: CapabilityKeySchema,
    global: Type.Boolean(),
    firIcaoCodes: Type.Array(IcaoCodeSchema, {
      maxItems: 100,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);

export type EffectiveCapability = Static<
  typeof EffectiveCapabilitySchema
>;

export const AuthorizationAssignmentSchema = Type.Object(
  {
    id: IdentifierSchema,
    roleKey: RoleKeySchema,
    roleName: Type.String({ minLength: 1, maxLength: 191 }),
    roleScope: AuthorizationRoleScopeSchema,
    fir: Type.Union([AuthorizationFirSchema, Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type AuthorizationAssignment = Static<
  typeof AuthorizationAssignmentSchema
>;

export const AuthorizationUserSchema = Type.Object(
  {
    id: IdentifierSchema,
    cid: VatsimCidSchema,
    displayName: Type.String({ minLength: 1, maxLength: 191 }),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("disabled"),
    ]),
    assignments: Type.Array(AuthorizationAssignmentSchema),
    effectiveCapabilities: Type.Array(EffectiveCapabilitySchema),
  },
  { additionalProperties: false },
);

export type AuthorizationUser = Static<typeof AuthorizationUserSchema>;

export const AuthorizationAuditRecordSchema = Type.Object(
  {
    id: IdentifierSchema,
    action: Type.String({ minLength: 1, maxLength: 64 }),
    actor: Type.Object(
      {
        cid: VatsimCidSchema,
        displayName: Type.String({ minLength: 1, maxLength: 191 }),
      },
      { additionalProperties: false },
    ),
    targetKind: Type.String({ minLength: 1, maxLength: 32 }),
    targetKey: Type.String({ minLength: 1, maxLength: 191 }),
    summary: Type.String({ minLength: 1, maxLength: 500 }),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const AuthorizationOverviewSchema = Type.Object(
  {
    capabilities: Type.Array(AuthorizationCapabilitySchema),
    roles: Type.Array(AuthorizationRoleSchema),
    firs: Type.Array(AuthorizationFirSchema),
    recentAuditRecords: Type.Array(AuthorizationAuditRecordSchema, {
      maxItems: 25,
    }),
  },
  { additionalProperties: false },
);

export type AuthorizationOverview = Static<
  typeof AuthorizationOverviewSchema
>;

export const AuthorizationUsersQuerySchema = Type.Object(
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

export type AuthorizationUsersQuery = Static<
  typeof AuthorizationUsersQuerySchema
>;

export const AuthorizationUsersResponseSchema = Type.Object(
  {
    items: Type.Array(AuthorizationUserSchema),
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

export type AuthorizationUsersResponse = Static<
  typeof AuthorizationUsersResponseSchema
>;

export const AuthorizationRoleParamsSchema = Type.Object(
  { roleKey: RoleKeySchema },
  { additionalProperties: false },
);

export type AuthorizationRoleParams = Static<
  typeof AuthorizationRoleParamsSchema
>;

export const AuthorizationUserParamsSchema = Type.Object(
  { userId: IdentifierSchema },
  { additionalProperties: false },
);

export type AuthorizationUserParams = Static<
  typeof AuthorizationUserParamsSchema
>;

export const AuthorizationAssignmentParamsSchema = Type.Object(
  { assignmentId: IdentifierSchema },
  { additionalProperties: false },
);

export type AuthorizationAssignmentParams = Static<
  typeof AuthorizationAssignmentParamsSchema
>;

export const CreateAuthorizationRoleSchema = Type.Object(
  {
    key: RoleKeySchema,
    name: Type.String({ minLength: 1, maxLength: 191 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    scope: AuthorizationRoleScopeSchema,
    capabilityKeys: Type.Array(CapabilityKeySchema, {
      maxItems: 100,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);

export type CreateAuthorizationRole = Static<
  typeof CreateAuthorizationRoleSchema
>;

export const UpdateAuthorizationRoleSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 191 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    capabilityKeys: Type.Array(CapabilityKeySchema, {
      maxItems: 100,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);

export type UpdateAuthorizationRole = Static<
  typeof UpdateAuthorizationRoleSchema
>;

export const CreateAuthorizationAssignmentSchema = Type.Object(
  {
    roleKey: RoleKeySchema,
    firIcaoCode: Type.Optional(IcaoCodeSchema),
  },
  { additionalProperties: false },
);

export type CreateAuthorizationAssignment = Static<
  typeof CreateAuthorizationAssignmentSchema
>;
