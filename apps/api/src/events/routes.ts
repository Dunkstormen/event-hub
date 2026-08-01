import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";

import {
  API_ERROR_RESPONSE_SCHEMAS,
  API_PREFIX,
  CreateEventDraftSchema,
  DEFAULT_PAGE_SIZE,
  DeleteEventQuerySchema,
  EventManagementContextSchema,
  EventParamsSchema,
  EventScheduleInputSchema,
  EventScheduleSchema,
  FirEventParamsSchema,
  ManageableEventsQuerySchema,
  ManageableEventsResponseSchema,
  ManagedEventSchema,
  TransferEventOwnershipSchema,
  UpdateEventDraftSchema,
  type CreateEventDraft,
  type DeleteEventQuery,
  type EventScheduleInput,
  type EventParams,
  type FirEventParams,
  type ManageableEventsQuery,
  type ManagedEvent,
  type ManagedEventSummary,
  type TransferEventOwnership,
  type UpdateEventDraft,
} from "@event-hub/contracts";

import type { AuthorizationApiGuard } from "../authorization/api-guard.js";
import { ApiError } from "../errors.js";
import {
  EventAggregateConflictError,
  EventAggregateDeniedError,
  EventAggregateError,
  EventAggregateNotFoundError,
  type EventAggregateRecord,
} from "./aggregate.js";
import {
  type EventCursor,
  type EventManagement,
  type ManagedEventRecord,
} from "./management.js";
import { EventScheduleError, validateEventSchedule } from "./schedule.js";

const lifecycleStateFromWire = {
  draft: "DRAFT",
  published: "PUBLISHED",
  cancelled: "CANCELLED",
  archived: "ARCHIVED",
} as const;

const lifecycleStateToWire = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
} as const;

const rosteringTypeFromWire = {
  "open-interest": "OPEN_INTEREST",
  predefined: "PREDEFINED",
} as const;

const rosteringTypeToWire = {
  OPEN_INTEREST: "open-interest",
  PREDEFINED: "predefined",
} as const;

function translateEventError(error: unknown): never {
  if (error instanceof EventAggregateDeniedError) {
    throw new ApiError(403, "FORBIDDEN", "You cannot manage this event.");
  }
  if (error instanceof EventAggregateNotFoundError) {
    throw new ApiError(404, "NOT_FOUND", error.message);
  }
  if (error instanceof EventAggregateConflictError) {
    throw new ApiError(409, "CONFLICT", error.message);
  }
  if (
    error instanceof EventAggregateError ||
    error instanceof EventScheduleError
  ) {
    throw new ApiError(400, "BAD_REQUEST", error.message);
  }

  throw error;
}

function mapFir(fir: EventAggregateRecord["ownerFir"]) {
  return {
    icaoCode: fir.icaoCode,
    name: fir.name,
    active: fir.active,
  };
}

function eventPermissions(record: ManagedEventRecord) {
  const ownsEvent = record.managementRole === "OWNER";
  const isDraft = record.event.lifecycleState === "DRAFT";

  return {
    edit: isDraft,
    transferOwnership: ownsEvent,
    delete: ownsEvent && isDraft,
  };
}

function mapSchedule(event: EventAggregateRecord) {
  return validateEventSchedule({
    localStart: event.localStart,
    localEnd: event.localEnd,
    timeZone: event.timeZone,
  });
}

function mapSummary(record: ManagedEventRecord): ManagedEventSummary {
  const { event } = record;

  return {
    id: event.id,
    name: event.name,
    shortDescription: event.shortDescription,
    lifecycleState: lifecycleStateToWire[event.lifecycleState],
    schedule: mapSchedule(event),
    ownerFir: mapFir(event.ownerFir),
    participatingFirs: event.participatingFirs.map(({ fir }) => mapFir(fir)),
    managementRole:
      record.managementRole === "OWNER" ? "owner" : "collaborator",
    permissions: eventPermissions(record),
    version: event.version,
    updatedAt: event.updatedAt.toISOString(),
  };
}

function mapEvent(record: ManagedEventRecord): ManagedEvent {
  const { event } = record;

  return {
    ...mapSummary(record),
    description: event.description,
    bannerStorageKey: event.bannerStorageKey,
    rosteringType: rosteringTypeToWire[event.rosteringType],
    cancellationReason: event.cancellationReason,
    participatingAirports: event.participatingAirports.map(({ airport }) => ({
      icaoCode: airport.icaoCode,
      name: airport.name,
      active: airport.active,
      fir: {
        icaoCode: airport.fir.icaoCode,
        name: airport.fir.name,
      },
    })),
    createdBy: event.createdBy,
    createdAt: event.createdAt.toISOString(),
  };
}

function encodeCursor(cursor: EventCursor) {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): EventCursor {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;

    if (
      value === null ||
      typeof value !== "object" ||
      !("updatedAt" in value) ||
      !("id" in value) ||
      typeof value.updatedAt !== "string" ||
      typeof value.id !== "string"
    ) {
      throw new Error("Invalid cursor payload.");
    }

    const updatedAt = new Date(value.updatedAt);
    const decoded = { updatedAt, id: value.id };

    if (
      Number.isNaN(updatedAt.valueOf()) ||
      value.id.length < 1 ||
      value.id.length > 30 ||
      encodeCursor(decoded) !== cursor
    ) {
      throw new Error("Invalid cursor value.");
    }

    return decoded;
  } catch {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The pagination cursor is invalid.",
    );
  }
}

export function registerEventManagementRoutes(
  app: FastifyInstance,
  management: EventManagement,
  guard: AuthorizationApiGuard,
) {
  app.post<{ Params: FirEventParams; Body: CreateEventDraft }>(
    `${API_PREFIX}/firs/:firIcaoCode/events`,
    {
      schema: {
        params: FirEventParamsSchema,
        body: CreateEventDraftSchema,
        response: {
          201: ManagedEventSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        const event = await management.createDraft(actor.id, {
          ...request.body,
          rosteringType: rosteringTypeFromWire[request.body.rosteringType],
          ownerFirIcaoCode: request.params.firIcaoCode,
        });
        return reply.code(201).send(mapEvent(event));
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.get<{ Querystring: ManageableEventsQuery }>(
    `${API_PREFIX}/events/manageable`,
    {
      schema: {
        querystring: ManageableEventsQuerySchema,
        response: {
          200: ManageableEventsResponseSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        const page = await management.listManageable(actor.id, {
          limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
          ...(request.query.q === undefined
            ? {}
            : { query: request.query.q }),
          ...(request.query.lifecycleState === undefined
            ? {}
            : {
                lifecycleState:
                  lifecycleStateFromWire[request.query.lifecycleState],
              }),
          ...(request.query.cursor === undefined
            ? {}
            : { after: decodeCursor(request.query.cursor) }),
        });
        const lastEvent = page.items.at(-1)?.event;

        return {
          items: page.items.map(mapSummary),
          pageInfo: {
            hasNextPage: page.hasNextPage,
            nextCursor:
              page.hasNextPage && lastEvent !== undefined
                ? encodeCursor({
                    updatedAt: lastEvent.updatedAt,
                    id: lastEvent.id,
                  })
                : null,
          },
        };
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.get(
    `${API_PREFIX}/events/management-context`,
    {
      schema: {
        response: {
          200: EventManagementContextSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        return await management.getContext(actor.id);
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.post<{ Body: EventScheduleInput }>(
    `${API_PREFIX}/events/schedule-preview`,
    {
      schema: {
        body: EventScheduleInputSchema,
        response: {
          200: EventScheduleSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        await management.getContext(actor.id);
        return validateEventSchedule(request.body);
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.get<{ Params: EventParams }>(
    `${API_PREFIX}/events/:eventId`,
    {
      schema: {
        params: EventParamsSchema,
        response: {
          200: ManagedEventSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        return mapEvent(
          await management.getManageable(actor.id, request.params.eventId),
        );
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.patch<{ Params: EventParams; Body: UpdateEventDraft }>(
    `${API_PREFIX}/events/:eventId`,
    {
      schema: {
        params: EventParamsSchema,
        body: UpdateEventDraftSchema,
        response: {
          200: ManagedEventSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        const { rosteringType, ...input } = request.body;
        return mapEvent(
          await management.updateDraft(actor.id, request.params.eventId, {
            ...input,
            ...(rosteringType === undefined
              ? {}
              : {
                  rosteringType:
                    rosteringTypeFromWire[rosteringType],
                }),
          }),
        );
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.post<{ Params: EventParams; Body: TransferEventOwnership }>(
    `${API_PREFIX}/events/:eventId/ownership-transfer`,
    {
      schema: {
        params: EventParamsSchema,
        body: TransferEventOwnershipSchema,
        response: {
          200: ManagedEventSchema,
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        return mapEvent(
          await management.transferOwnership(
            actor.id,
            request.params.eventId,
            request.body.targetFirIcaoCode,
            request.body.expectedVersion,
          ),
        );
      } catch (error) {
        translateEventError(error);
      }
    },
  );

  app.delete<{ Params: EventParams; Querystring: DeleteEventQuery }>(
    `${API_PREFIX}/events/:eventId`,
    {
      schema: {
        params: EventParamsSchema,
        querystring: DeleteEventQuerySchema,
        response: {
          204: Type.Null(),
          ...API_ERROR_RESPONSE_SCHEMAS,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actor = await guard.requireActor(request);

      try {
        await management.deleteDraft(
          actor.id,
          request.params.eventId,
          request.query.expectedVersion,
        );
        return reply.code(204).send();
      } catch (error) {
        translateEventError(error);
      }
    },
  );
}
