import { type Static, Type } from "@sinclair/typebox";

import { VatsimCidSchema } from "./auth.js";
import { listQuerySchema, paginatedResponseSchema } from "./pagination.js";

const IdentifierSchema = Type.String({ minLength: 1, maxLength: 30 });

export const AuditActionSchema = Type.String({
  minLength: 3,
  maxLength: 64,
  pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)*$",
});

export const AuditTargetKindSchema = Type.String({
  minLength: 1,
  maxLength: 32,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
});

export const AuditSnapshotSchema = Type.Record(
  Type.String({ minLength: 1, maxLength: 191 }),
  Type.Any(),
);

export const AuditRecordSchema = Type.Object(
  {
    id: IdentifierSchema,
    action: AuditActionSchema,
    actor: Type.Object(
      {
        cid: VatsimCidSchema,
        displayName: Type.String({ minLength: 1, maxLength: 191 }),
      },
      { additionalProperties: false },
    ),
    targetKind: AuditTargetKindSchema,
    targetKey: Type.String({ minLength: 1, maxLength: 191 }),
    summary: Type.String({ minLength: 1, maxLength: 500 }),
    beforeState: Type.Union([AuditSnapshotSchema, Type.Null()]),
    afterState: Type.Union([AuditSnapshotSchema, Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type AuditRecord = Static<typeof AuditRecordSchema>;

export const AuditRecordsQuerySchema = listQuerySchema({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 191 })),
  actorCid: Type.Optional(VatsimCidSchema),
  action: Type.Optional(AuditActionSchema),
  targetKind: Type.Optional(AuditTargetKindSchema),
  from: Type.Optional(Type.String({ format: "date-time" })),
  to: Type.Optional(Type.String({ format: "date-time" })),
});

export type AuditRecordsQuery = Static<typeof AuditRecordsQuerySchema>;

export const AuditRecordsResponseSchema = paginatedResponseSchema(
  AuditRecordSchema,
);

export type AuditRecordsResponse = Static<
  typeof AuditRecordsResponseSchema
>;
