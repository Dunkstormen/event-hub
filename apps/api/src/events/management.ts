import {
  EVENTS_MANAGE_CAPABILITY,
  Prisma,
  type PrismaClient,
} from "@event-hub/database";

import { appendAuditRecord } from "../audit/service.js";
import {
  AuthorizationPolicyDeniedError,
  evaluateAuthorization,
  hasFirCapability,
  hasGlobalCapability,
  requireEventCollaboration,
  type EffectiveAuthorization,
} from "../authorization/policy.js";
import {
  createEventAggregate,
  EventAggregateConflictError,
  EventAggregateDeniedError,
  EventAggregateError,
  EventAggregateNotFoundError,
  eventAggregateInclude,
  type CreateEventDraftInput,
  type EventAggregateRecord,
} from "./aggregate.js";
import { validateEventSchedule } from "./schedule.js";

const maximumTransactionAttempts = 4;

export type EventManagementRole = "OWNER" | "COLLABORATOR";

export type ManagedEventRecord = Readonly<{
  event: EventAggregateRecord;
  managementRole: EventManagementRole;
}>;

export type EventCursor = Readonly<{
  updatedAt: Date;
  id: string;
}>;

export type ListManageableEventsInput = Readonly<{
  limit: number;
  query?: string;
  lifecycleState?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
  after?: EventCursor;
}>;

export type UpdateEventDraftInput = Readonly<{
  expectedVersion: number;
  name?: string;
  shortDescription?: string;
  description?: string;
  bannerStorageKey?: string | null;
  rosteringType?: "OPEN_INTEREST" | "PREDEFINED";
  localStart?: string;
  localEnd?: string;
  timeZone?: string;
  participatingFirIcaoCodes?: readonly string[];
  participatingAirportIcaoCodes?: readonly string[];
}>;

export type EventManagementContextRecord = Readonly<{
  ownerFirs: readonly Readonly<{
    icaoCode: string;
    name: string;
    active: boolean;
  }>[];
}>;

export type EventManagement = Readonly<{
  getContext(actorUserId: string): Promise<EventManagementContextRecord>;
  createDraft(
    actorUserId: string,
    input: CreateEventDraftInput,
  ): Promise<ManagedEventRecord>;
  listManageable(
    actorUserId: string,
    input: ListManageableEventsInput,
  ): Promise<Readonly<{ items: ManagedEventRecord[]; hasNextPage: boolean }>>;
  getManageable(
    actorUserId: string,
    eventId: string,
  ): Promise<ManagedEventRecord>;
  updateDraft(
    actorUserId: string,
    eventId: string,
    input: UpdateEventDraftInput,
  ): Promise<ManagedEventRecord>;
  transferOwnership(
    actorUserId: string,
    eventId: string,
    targetFirIcaoCode: string,
    expectedVersion: number,
  ): Promise<ManagedEventRecord>;
  deleteDraft(
    actorUserId: string,
    eventId: string,
    expectedVersion: number,
  ): Promise<void>;
}>;

function requiredText(value: string, label: string, maximum: number) {
  const normalized = value.trim();

  if (normalized === "" || normalized.length > maximum) {
    throw new EventAggregateError(
      `${label} must contain between 1 and ${maximum} characters.`,
    );
  }

  return normalized;
}

function normalizedBannerStorageKey(value: string | null) {
  if (value === null) {
    return null;
  }

  const normalized = requiredText(value, "Banner storage key", 191);
  const safeCharacters = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;

  if (
    !safeCharacters.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new EventAggregateError(
      "Banner storage key must be an opaque relative key.",
    );
  }

  return normalized;
}

function normalizeIcaoCodes(values: readonly string[], label: string) {
  const normalized = values.map((value) => value.trim().toUpperCase());
  const invalid = normalized.find((value) => !/^[A-Z]{4}$/u.test(value));

  if (invalid !== undefined) {
    throw new EventAggregateError(`${label} must be a four-letter ICAO code.`);
  }

  return [...new Set(normalized)];
}

function collaborationTarget(event: EventAggregateRecord) {
  return {
    owningFirIcaoCode: event.ownerFir.icaoCode,
    participatingFirIcaoCodes: event.participatingFirs.map(
      ({ fir }) => fir.icaoCode,
    ),
  };
}

function managementRole(
  authorization: EffectiveAuthorization,
  event: EventAggregateRecord,
): EventManagementRole {
  return hasFirCapability(
    authorization,
    EVENTS_MANAGE_CAPABILITY,
    event.ownerFir.icaoCode,
  )
    ? "OWNER"
    : "COLLABORATOR";
}

function managed(
  authorization: EffectiveAuthorization,
  event: EventAggregateRecord,
): ManagedEventRecord {
  return { event, managementRole: managementRole(authorization, event) };
}

function eventAuditState(event: EventAggregateRecord) {
  return {
    name: event.name,
    shortDescription: event.shortDescription,
    description: event.description,
    bannerStorageKey: event.bannerStorageKey,
    rosteringType: event.rosteringType,
    lifecycleState: event.lifecycleState,
    localStart: event.localStart,
    localEnd: event.localEnd,
    timeZone: event.timeZone,
    ownerFirIcaoCode: event.ownerFir.icaoCode,
    participatingFirIcaoCodes: event.participatingFirs.map(
      ({ fir }) => fir.icaoCode,
    ),
    participatingAirportIcaoCodes: event.participatingAirports.map(
      ({ airport }) => airport.icaoCode,
    ),
    version: event.version,
  };
}

async function requireAuthorization(
  database: Pick<Prisma.TransactionClient, "user">,
  actorUserId: string,
) {
  const authorization = await evaluateAuthorization(database, actorUserId);

  if (authorization === null) {
    throw new EventAggregateDeniedError();
  }

  return authorization;
}

async function requireCollaboration(
  database: Pick<Prisma.TransactionClient, "user">,
  actorUserId: string,
  event: EventAggregateRecord,
  action: Parameters<typeof requireEventCollaboration>[3],
) {
  try {
    const authorization = await requireEventCollaboration(
      database,
      actorUserId,
      collaborationTarget(event),
      action,
    );

    if (authorization === null) {
      throw new EventAggregateDeniedError();
    }

    return authorization;
  } catch (error) {
    if (error instanceof AuthorizationPolicyDeniedError) {
      throw new EventAggregateDeniedError();
    }
    throw error;
  }
}

async function serializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= maximumTransactionAttempts; attempt += 1) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (!retryable || attempt === maximumTransactionAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Event-management transaction retry limit exceeded.");
}

async function findEvent(
  database: Pick<Prisma.TransactionClient, "event">,
  eventId: string,
) {
  const event = await database.event.findUnique({
    where: { id: eventId },
    include: eventAggregateInclude,
  });

  if (event === null) {
    throw new EventAggregateNotFoundError();
  }

  return event;
}

export function createEventManagement(
  database: PrismaClient,
): EventManagement {
  const aggregate = createEventAggregate(database);

  return {
    async getContext(actorUserId) {
      const authorization = await requireAuthorization(database, actorUserId);
      const globallyAuthorized = hasGlobalCapability(
        authorization,
        EVENTS_MANAGE_CAPABILITY,
      );
      const firIcaoCodes = authorization.firCapabilities
        .filter(({ capabilityKeys }) =>
          capabilityKeys.includes(EVENTS_MANAGE_CAPABILITY),
        )
        .map(({ firIcaoCode }) => firIcaoCode);

      if (!globallyAuthorized && firIcaoCodes.length === 0) {
        throw new EventAggregateDeniedError();
      }

      const ownerFirs = await database.fir.findMany({
        where: {
          active: true,
          ...(globallyAuthorized ? {} : { icaoCode: { in: firIcaoCodes } }),
        },
        select: { icaoCode: true, name: true, active: true },
        orderBy: { icaoCode: "asc" },
      });

      return { ownerFirs };
    },

    async createDraft(actorUserId, input) {
      const event = await aggregate.createDraft(actorUserId, input);
      const authorization = await requireAuthorization(database, actorUserId);
      return managed(authorization, event);
    },

    async listManageable(actorUserId, input) {
      const authorization = await requireAuthorization(database, actorUserId);
      const globallyAuthorized = hasGlobalCapability(
        authorization,
        EVENTS_MANAGE_CAPABILITY,
      );
      const firIcaoCodes = authorization.firCapabilities
        .filter(({ capabilityKeys }) =>
          capabilityKeys.includes(EVENTS_MANAGE_CAPABILITY),
        )
        .map(({ firIcaoCode }) => firIcaoCode);

      if (!globallyAuthorized && firIcaoCodes.length === 0) {
        return { items: [], hasNextPage: false };
      }

      const accessWhere: Prisma.EventWhereInput = globallyAuthorized
        ? {}
        : {
            OR: [
              { ownerFir: { icaoCode: { in: firIcaoCodes } } },
              {
                participatingFirs: {
                  some: { fir: { icaoCode: { in: firIcaoCodes } } },
                },
              },
            ],
          };
      const afterWhere: Prisma.EventWhereInput | undefined =
        input.after === undefined
          ? undefined
          : {
              OR: [
                { updatedAt: { lt: input.after.updatedAt } },
                {
                  updatedAt: input.after.updatedAt,
                  id: { lt: input.after.id },
                },
              ],
            };
      const events = await database.event.findMany({
        where: {
          AND: [
            accessWhere,
            ...(input.query === undefined
              ? []
              : [{ name: { contains: input.query.trim() } }]),
            ...(input.lifecycleState === undefined
              ? []
              : [{ lifecycleState: input.lifecycleState }]),
            ...(afterWhere === undefined ? [] : [afterWhere]),
          ],
        },
        include: eventAggregateInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasNextPage = events.length > input.limit;

      return {
        items: events
          .slice(0, input.limit)
          .map((event) => managed(authorization, event)),
        hasNextPage,
      };
    },

    async getManageable(actorUserId, eventId) {
      const event = await findEvent(database, eventId);
      const authorization = await requireCollaboration(
        database,
        actorUserId,
        event,
        { kind: "view-draft" },
      );
      return managed(authorization, event);
    },

    async updateDraft(actorUserId, eventId, input) {
      return serializableTransaction(database, async (transaction) => {
        const event = await findEvent(transaction, eventId);
        const authorization = await requireCollaboration(
          transaction,
          actorUserId,
          event,
          { kind: "edit-content" },
        );

        if (event.lifecycleState !== "DRAFT") {
          throw new EventAggregateConflictError(
            "Only a draft event can be edited.",
          );
        }
        if (event.version !== input.expectedVersion) {
          throw new EventAggregateConflictError(
            "The event changed after it was loaded.",
          );
        }

        const currentFirIcaoCodes = event.participatingFirs.map(
          ({ fir }) => fir.icaoCode,
        );
        const participatingFirIcaoCodes =
          input.participatingFirIcaoCodes === undefined
            ? currentFirIcaoCodes
            : [
                ...new Set([
                  event.ownerFir.icaoCode,
                  ...normalizeIcaoCodes(
                    input.participatingFirIcaoCodes,
                    "Participating FIR",
                  ),
                ]),
              ];
        const currentAirportIcaoCodes = event.participatingAirports.map(
          ({ airport }) => airport.icaoCode,
        );
        const participatingAirportIcaoCodes =
          input.participatingAirportIcaoCodes === undefined
            ? currentAirportIcaoCodes
            : normalizeIcaoCodes(
                input.participatingAirportIcaoCodes,
                "Participating airport",
              );
        const currentFirSet = new Set(currentFirIcaoCodes);
        const nextFirSet = new Set(participatingFirIcaoCodes);
        const addedFirIcaoCodes = participatingFirIcaoCodes.filter(
          (icaoCode) => !currentFirSet.has(icaoCode),
        );
        const removedFirIcaoCodes = currentFirIcaoCodes.filter(
          (icaoCode) => !nextFirSet.has(icaoCode),
        );

        if (addedFirIcaoCodes.length > 0) {
          await requireCollaboration(
            transaction,
            actorUserId,
            event,
            { kind: "add-participating-fir" },
          );
        }
        for (const targetFirIcaoCode of removedFirIcaoCodes) {
          await requireCollaboration(
            transaction,
            actorUserId,
            event,
            { kind: "remove-participating-fir", targetFirIcaoCode },
          );
        }

        const [participatingFirs, participatingAirports] = await Promise.all([
          transaction.fir.findMany({
            where: {
              active: true,
              icaoCode: { in: participatingFirIcaoCodes },
            },
            select: { id: true, icaoCode: true },
          }),
          transaction.airport.findMany({
            where: {
              active: true,
              icaoCode: { in: participatingAirportIcaoCodes },
            },
            select: { id: true, icaoCode: true },
          }),
        ]);
        const foundFirIcaoCodes = new Set(
          participatingFirs.map(({ icaoCode }) => icaoCode),
        );
        const missingFirIcaoCodes = participatingFirIcaoCodes.filter(
          (icaoCode) => !foundFirIcaoCodes.has(icaoCode),
        );
        const foundAirportIcaoCodes = new Set(
          participatingAirports.map(({ icaoCode }) => icaoCode),
        );
        const missingAirportIcaoCodes = participatingAirportIcaoCodes.filter(
          (icaoCode) => !foundAirportIcaoCodes.has(icaoCode),
        );

        if (missingFirIcaoCodes.length > 0) {
          throw new EventAggregateNotFoundError(
            `Active participating FIRs were not found: ${missingFirIcaoCodes.join(", ")}.`,
          );
        }
        if (missingAirportIcaoCodes.length > 0) {
          throw new EventAggregateNotFoundError(
            `Active participating airports were not found: ${missingAirportIcaoCodes.join(", ")}.`,
          );
        }

        const schedule = validateEventSchedule({
          localStart: input.localStart ?? event.localStart,
          localEnd: input.localEnd ?? event.localEnd,
          timeZone: input.timeZone ?? event.timeZone,
        });
        const updatedCount = await transaction.event.updateMany({
          where: { id: event.id, version: event.version },
          data: {
            ...(input.name === undefined
              ? {}
              : { name: requiredText(input.name, "Event name", 191) }),
            ...(input.shortDescription === undefined
              ? {}
              : {
                  shortDescription: requiredText(
                    input.shortDescription,
                    "Short description",
                    500,
                  ),
                }),
            ...(input.description === undefined
              ? {}
              : {
                  description: requiredText(
                    input.description,
                    "Description",
                    65_535,
                  ),
                }),
            ...(input.bannerStorageKey === undefined
              ? {}
              : {
                  bannerStorageKey: normalizedBannerStorageKey(
                    input.bannerStorageKey,
                  ),
                }),
            ...(input.rosteringType === undefined
              ? {}
              : { rosteringType: input.rosteringType }),
            localStart: schedule.localStart,
            localEnd: schedule.localEnd,
            timeZone: schedule.timeZone,
            version: { increment: 1 },
          },
        });

        if (updatedCount.count !== 1) {
          throw new EventAggregateConflictError(
            "The event changed while it was being updated.",
          );
        }

        if (input.participatingFirIcaoCodes !== undefined) {
          await transaction.eventFir.deleteMany({ where: { eventId: event.id } });
          await transaction.eventFir.createMany({
            data: participatingFirs.map(({ id: firId }) => ({
              eventId: event.id,
              firId,
            })),
          });
        }
        if (input.participatingAirportIcaoCodes !== undefined) {
          await transaction.eventAirport.deleteMany({
            where: { eventId: event.id },
          });
          if (participatingAirports.length > 0) {
            await transaction.eventAirport.createMany({
              data: participatingAirports.map(({ id: airportId }) => ({
                eventId: event.id,
                airportId,
              })),
            });
          }
        }

        const updated = await findEvent(transaction, event.id);
        await appendAuditRecord(transaction, {
          actorUserId,
          action: "event.updated",
          targetKind: "event",
          targetKey: event.id,
          summary: `Updated draft event ${updated.name}.`,
          beforeState: eventAuditState(event),
          afterState: eventAuditState(updated),
        });

        return managed(authorization, updated);
      });
    },

    async transferOwnership(
      actorUserId,
      eventId,
      targetFirIcaoCode,
      expectedVersion,
    ) {
      const event = await aggregate.transferOwnership(
        actorUserId,
        eventId,
        targetFirIcaoCode,
        expectedVersion,
      );
      const authorization = await requireAuthorization(database, actorUserId);
      return managed(authorization, event);
    },

    async deleteDraft(actorUserId, eventId, expectedVersion) {
      await serializableTransaction(database, async (transaction) => {
        const event = await findEvent(transaction, eventId);
        await requireCollaboration(
          transaction,
          actorUserId,
          event,
          { kind: "delete-series" },
        );

        if (event.lifecycleState !== "DRAFT") {
          throw new EventAggregateConflictError(
            "Only a draft event can be permanently deleted.",
          );
        }
        if (event.version !== expectedVersion) {
          throw new EventAggregateConflictError(
            "The event changed after it was loaded.",
          );
        }

        await appendAuditRecord(transaction, {
          actorUserId,
          action: "event.deleted",
          targetKind: "event",
          targetKey: event.id,
          summary: `Permanently deleted draft event ${event.name}.`,
          beforeState: eventAuditState(event),
        });
        const deleted = await transaction.event.deleteMany({
          where: { id: event.id, version: event.version },
        });

        if (deleted.count !== 1) {
          throw new EventAggregateConflictError(
            "The event changed while it was being deleted.",
          );
        }
      });
    },
  };
}
