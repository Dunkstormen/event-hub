import { type Static, Type } from "@sinclair/typebox";

import { VatsimCidSchema } from "./auth.js";
import { listQuerySchema, paginatedResponseSchema } from "./pagination.js";
import {
  AirportSchema,
  FirSchema,
  IcaoCodeSchema,
} from "./reference-data.js";

const IdentifierSchema = Type.String({ minLength: 1, maxLength: 30 });
const EventNameSchema = Type.String({
  minLength: 1,
  maxLength: 191,
  pattern: "\\S",
});
const ShortDescriptionSchema = Type.String({
  minLength: 1,
  maxLength: 500,
  pattern: "\\S",
});
const DescriptionSchema = Type.String({
  minLength: 1,
  maxLength: 65_535,
  pattern: "\\S",
});
const BannerStorageKeySchema = Type.String({
  minLength: 1,
  maxLength: 191,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._/-]*$",
});
const LocalDateTimeSchema = Type.String({
  minLength: 19,
  maxLength: 19,
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$",
});
const TimeZoneSchema = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: "\\S",
});
const EventVersionSchema = Type.Integer({ minimum: 1 });

export const EventLifecycleStateSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("cancelled"),
  Type.Literal("archived"),
]);

export type EventLifecycleState = Static<
  typeof EventLifecycleStateSchema
>;

export const EventRosteringTypeSchema = Type.Union([
  Type.Literal("open-interest"),
  Type.Literal("predefined"),
]);

export type EventRosteringType = Static<
  typeof EventRosteringTypeSchema
>;

export const EventManagementRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("collaborator"),
]);

export type EventManagementRole = Static<
  typeof EventManagementRoleSchema
>;

export const EventScheduleSchema = Type.Object(
  {
    localStart: LocalDateTimeSchema,
    localEnd: LocalDateTimeSchema,
    timeZone: TimeZoneSchema,
    startInstant: Type.String({ format: "date-time" }),
    endInstant: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type EventSchedule = Static<typeof EventScheduleSchema>;

export const EventPermissionsSchema = Type.Object(
  {
    edit: Type.Boolean(),
    transferOwnership: Type.Boolean(),
    delete: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ManagedEventSummarySchema = Type.Object(
  {
    id: IdentifierSchema,
    name: EventNameSchema,
    shortDescription: ShortDescriptionSchema,
    lifecycleState: EventLifecycleStateSchema,
    schedule: EventScheduleSchema,
    ownerFir: FirSchema,
    participatingFirs: Type.Array(FirSchema),
    managementRole: EventManagementRoleSchema,
    permissions: EventPermissionsSchema,
    version: EventVersionSchema,
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type ManagedEventSummary = Static<
  typeof ManagedEventSummarySchema
>;

export const ManagedEventSchema = Type.Object(
  {
    id: IdentifierSchema,
    name: EventNameSchema,
    shortDescription: ShortDescriptionSchema,
    description: DescriptionSchema,
    bannerStorageKey: Type.Union([
      BannerStorageKeySchema,
      Type.Null(),
    ]),
    rosteringType: EventRosteringTypeSchema,
    lifecycleState: EventLifecycleStateSchema,
    cancellationReason: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    schedule: EventScheduleSchema,
    ownerFir: FirSchema,
    participatingFirs: Type.Array(FirSchema),
    participatingAirports: Type.Array(AirportSchema),
    createdBy: Type.Object(
      {
        id: IdentifierSchema,
        cid: VatsimCidSchema,
      },
      { additionalProperties: false },
    ),
    managementRole: EventManagementRoleSchema,
    permissions: EventPermissionsSchema,
    version: EventVersionSchema,
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type ManagedEvent = Static<typeof ManagedEventSchema>;

export const EventParamsSchema = Type.Object(
  { eventId: IdentifierSchema },
  { additionalProperties: false },
);

export type EventParams = Static<typeof EventParamsSchema>;

export const FirEventParamsSchema = Type.Object(
  { firIcaoCode: IcaoCodeSchema },
  { additionalProperties: false },
);

export type FirEventParams = Static<typeof FirEventParamsSchema>;

export const CreateEventDraftSchema = Type.Object(
  {
    name: EventNameSchema,
    shortDescription: ShortDescriptionSchema,
    description: DescriptionSchema,
    bannerStorageKey: Type.Optional(BannerStorageKeySchema),
    rosteringType: EventRosteringTypeSchema,
    localStart: LocalDateTimeSchema,
    localEnd: LocalDateTimeSchema,
    timeZone: TimeZoneSchema,
    participatingFirIcaoCodes: Type.Optional(
      Type.Array(IcaoCodeSchema, { uniqueItems: true, maxItems: 20 }),
    ),
    participatingAirportIcaoCodes: Type.Optional(
      Type.Array(IcaoCodeSchema, { uniqueItems: true, maxItems: 100 }),
    ),
  },
  { additionalProperties: false },
);

export type CreateEventDraft = Static<typeof CreateEventDraftSchema>;

export const UpdateEventDraftSchema = Type.Object(
  {
    expectedVersion: EventVersionSchema,
    name: Type.Optional(EventNameSchema),
    shortDescription: Type.Optional(ShortDescriptionSchema),
    description: Type.Optional(DescriptionSchema),
    bannerStorageKey: Type.Optional(
      Type.Union([BannerStorageKeySchema, Type.Null()]),
    ),
    rosteringType: Type.Optional(EventRosteringTypeSchema),
    localStart: Type.Optional(LocalDateTimeSchema),
    localEnd: Type.Optional(LocalDateTimeSchema),
    timeZone: Type.Optional(TimeZoneSchema),
  },
  { additionalProperties: false, minProperties: 2 },
);

export type UpdateEventDraft = Static<typeof UpdateEventDraftSchema>;

export const TransferEventOwnershipSchema = Type.Object(
  {
    expectedVersion: EventVersionSchema,
    targetFirIcaoCode: IcaoCodeSchema,
  },
  { additionalProperties: false },
);

export type TransferEventOwnership = Static<
  typeof TransferEventOwnershipSchema
>;

export const DeleteEventQuerySchema = Type.Object(
  { expectedVersion: EventVersionSchema },
  { additionalProperties: false },
);

export type DeleteEventQuery = Static<typeof DeleteEventQuerySchema>;

export const ManageableEventsQuerySchema = listQuerySchema({
  q: Type.Optional(
    Type.String({ minLength: 1, maxLength: 191, pattern: "\\S" }),
  ),
  lifecycleState: Type.Optional(EventLifecycleStateSchema),
});

export type ManageableEventsQuery = Static<
  typeof ManageableEventsQuerySchema
>;

export const ManageableEventsResponseSchema = paginatedResponseSchema(
  ManagedEventSummarySchema,
);

export type ManageableEventsResponse = Static<
  typeof ManageableEventsResponseSchema
>;
