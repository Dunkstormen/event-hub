import {
  EVENTS_MANAGE_CAPABILITY,
  Prisma,
  type PrismaClient,
} from "@event-hub/database";

import { appendAuditRecord } from "../audit/service.js";
import {
  AuthorizationPolicyDeniedError,
  requireFirCapability,
} from "../authorization/policy.js";
import { validateEventSchedule } from "./schedule.js";

const maximumTransactionAttempts = 4;
const icaoCodePattern = /^[A-Z]{4}$/u;

const eventAggregateInclude = {
  ownerFir: true,
  createdBy: {
    select: { id: true, cid: true },
  },
  participatingFirs: {
    include: { fir: true },
    orderBy: { fir: { icaoCode: "asc" as const } },
  },
  participatingAirports: {
    include: { airport: true },
    orderBy: { airport: { icaoCode: "asc" as const } },
  },
} as const;

export type EventAggregateRecord = Prisma.EventGetPayload<{
  include: typeof eventAggregateInclude;
}>;

export type EventRosteringTypeInput =
  | "OPEN_INTEREST"
  | "PREDEFINED";

export type CreateEventDraftInput = Readonly<{
  name: string;
  shortDescription: string;
  description: string;
  bannerStorageKey?: string;
  rosteringType: EventRosteringTypeInput;
  localStart: string;
  localEnd: string;
  timeZone: string;
  ownerFirIcaoCode: string;
  participatingFirIcaoCodes?: readonly string[];
  participatingAirportIcaoCodes?: readonly string[];
}>;

export class EventAggregateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventAggregateError";
  }
}

export class EventAggregateDeniedError extends EventAggregateError {
  constructor() {
    super("Current owning-FIR event-management permission is required.");
    this.name = "EventAggregateDeniedError";
  }
}

export class EventAggregateNotFoundError extends EventAggregateError {
  constructor(message = "Event was not found.") {
    super(message);
    this.name = "EventAggregateNotFoundError";
  }
}

export type EventAggregateService = Readonly<{
  createDraft(
    actorUserId: string,
    input: CreateEventDraftInput,
  ): Promise<EventAggregateRecord>;
  transferOwnership(
    actorUserId: string,
    eventId: string,
    targetFirIcaoCodeInput: string,
  ): Promise<EventAggregateRecord>;
  cancelPublished(
    actorUserId: string,
    eventId: string,
    publicReason: string,
  ): Promise<EventAggregateRecord>;
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

function optionalText(
  value: string | undefined,
  label: string,
  maximum: number,
) {
  if (value === undefined) {
    return undefined;
  }

  return requiredText(value, label, maximum);
}

function bannerStorageKey(value: string | undefined) {
  const normalized = optionalText(value, "Banner storage key", 191);

  if (normalized === undefined) {
    return null;
  }

  const safeCharacters = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
  const hasParentSegment = normalized.split("/").includes("..");

  if (!safeCharacters.test(normalized) || hasParentSegment) {
    throw new EventAggregateError(
      "Banner storage key must be an opaque relative key.",
    );
  }

  return normalized;
}

function normalizeIcaoCode(value: string, label: string) {
  const normalized = value.trim().toUpperCase();

  if (!icaoCodePattern.test(normalized)) {
    throw new EventAggregateError(
      `${label} must be a four-letter ICAO code.`,
    );
  }

  return normalized;
}

function normalizeIcaoCodes(
  values: readonly string[] | undefined,
  label: string,
) {
  return [
    ...new Set(
      (values ?? []).map((value) => normalizeIcaoCode(value, label)),
    ),
  ];
}

async function serializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maximumTransactionAttempts;
    attempt += 1
  ) {
    try {
      return await database.$transaction(operation, {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
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

  throw new Error("Event aggregate transaction retry limit exceeded.");
}

async function requireOwningFirManager(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  ownerFirIcaoCode: string,
) {
  try {
    await requireFirCapability(
      transaction,
      actorUserId,
      EVENTS_MANAGE_CAPABILITY,
      ownerFirIcaoCode,
    );
  } catch (error) {
    if (error instanceof AuthorizationPolicyDeniedError) {
      throw new EventAggregateDeniedError();
    }
    throw error;
  }
}

function eventAuditState(event: {
  lifecycleState: string;
  ownerFir: { icaoCode: string };
  cancellationReason: string | null;
}) {
  return {
    lifecycleState: event.lifecycleState,
    ownerFirIcaoCode: event.ownerFir.icaoCode,
    cancellationReason: event.cancellationReason,
  };
}

export function createEventAggregate(
  database: PrismaClient,
): EventAggregateService {
  return {
    async createDraft(
      actorUserId: string,
      input: CreateEventDraftInput,
    ) {
      const ownerFirIcaoCode = normalizeIcaoCode(
        input.ownerFirIcaoCode,
        "Owning FIR",
      );
      const participatingFirIcaoCodes = new Set([
        ownerFirIcaoCode,
        ...normalizeIcaoCodes(
          input.participatingFirIcaoCodes,
          "Participating FIR",
        ),
      ]);
      const participatingAirportIcaoCodes = normalizeIcaoCodes(
        input.participatingAirportIcaoCodes,
        "Participating airport",
      );
      const schedule = validateEventSchedule(input);
      const eventData = {
        name: requiredText(input.name, "Event name", 191),
        shortDescription: requiredText(
          input.shortDescription,
          "Short description",
          500,
        ),
        description: requiredText(
          input.description,
          "Description",
          65_535,
        ),
        bannerStorageKey: bannerStorageKey(input.bannerStorageKey),
        rosteringType: input.rosteringType,
      } as const;

      return serializableTransaction(database, async (transaction) => {
        await requireOwningFirManager(
          transaction,
          actorUserId,
          ownerFirIcaoCode,
        );

        const firs = await transaction.fir.findMany({
          where: {
            active: true,
            icaoCode: { in: [...participatingFirIcaoCodes] },
          },
          select: { id: true, icaoCode: true },
        });
        const foundFirCodes = new Set(
          firs.map((fir) => fir.icaoCode),
        );
        const missingFirCodes = [...participatingFirIcaoCodes].filter(
          (icaoCode) => !foundFirCodes.has(icaoCode),
        );

        if (missingFirCodes.length > 0) {
          throw new EventAggregateNotFoundError(
            `Active participating FIRs were not found: ${missingFirCodes.join(", ")}.`,
          );
        }

        const airports = await transaction.airport.findMany({
          where: {
            active: true,
            icaoCode: { in: participatingAirportIcaoCodes },
          },
          select: { id: true, icaoCode: true },
        });
        const foundAirportCodes = new Set(
          airports.map((airport) => airport.icaoCode),
        );
        const missingAirportCodes = participatingAirportIcaoCodes.filter(
          (icaoCode) => !foundAirportCodes.has(icaoCode),
        );

        if (missingAirportCodes.length > 0) {
          throw new EventAggregateNotFoundError(
            `Active participating airports were not found: ${missingAirportCodes.join(", ")}.`,
          );
        }

        const ownerFir = firs.find(
          (fir) => fir.icaoCode === ownerFirIcaoCode,
        );

        if (ownerFir === undefined) {
          throw new EventAggregateNotFoundError(
            `Active owning FIR ${ownerFirIcaoCode} was not found.`,
          );
        }

        const created = await transaction.event.create({
          data: {
            ...eventData,
            localStart: schedule.localStart,
            localEnd: schedule.localEnd,
            timeZone: schedule.timeZone,
            ownerFirId: ownerFir.id,
            createdByUserId: actorUserId,
          },
          select: { id: true },
        });

        await transaction.eventFir.createMany({
          data: firs.map((fir) => ({
            eventId: created.id,
            firId: fir.id,
          })),
          skipDuplicates: true,
        });
        await transaction.eventAirport.createMany({
          data: airports.map((airport) => ({
            eventId: created.id,
            airportId: airport.id,
          })),
          skipDuplicates: true,
        });

        await appendAuditRecord(transaction, {
          actorUserId,
          action: "event.created",
          targetKind: "event",
          targetKey: created.id,
          summary: `Created draft event ${eventData.name}.`,
          afterState: {
            lifecycleState: "DRAFT",
            ownerFirIcaoCode,
            cancellationReason: null,
          },
        });

        return transaction.event.findUniqueOrThrow({
          where: { id: created.id },
          include: eventAggregateInclude,
        });
      });
    },

    async transferOwnership(
      actorUserId: string,
      eventId: string,
      targetFirIcaoCodeInput: string,
    ) {
      const targetFirIcaoCode = normalizeIcaoCode(
        targetFirIcaoCodeInput,
        "Target FIR",
      );

      return serializableTransaction(database, async (transaction) => {
        const event = await transaction.event.findUnique({
          where: { id: eventId },
          include: eventAggregateInclude,
        });

        if (event === null) {
          throw new EventAggregateNotFoundError();
        }

        await requireOwningFirManager(
          transaction,
          actorUserId,
          event.ownerFir.icaoCode,
        );

        if (event.ownerFir.icaoCode === targetFirIcaoCode) {
          throw new EventAggregateError(
            "Target FIR already owns this event.",
          );
        }

        const targetParticipation = event.participatingFirs.find(
          ({ fir }) =>
            fir.active && fir.icaoCode === targetFirIcaoCode,
        );

        if (targetParticipation === undefined) {
          throw new EventAggregateError(
            "Ownership can only transfer to an active participating FIR.",
          );
        }

        const updated = await transaction.event.update({
          where: { id: event.id },
          data: { ownerFirId: targetParticipation.firId },
          include: eventAggregateInclude,
        });

        await appendAuditRecord(transaction, {
          actorUserId,
          action: "event.ownership-transferred",
          targetKind: "event",
          targetKey: event.id,
          summary: `Transferred event ownership from ${event.ownerFir.icaoCode} to ${targetFirIcaoCode}.`,
          beforeState: eventAuditState(event),
          afterState: eventAuditState(updated),
        });

        return updated;
      });
    },

    async cancelPublished(
      actorUserId: string,
      eventId: string,
      publicReason: string,
    ) {
      const cancellationReason = requiredText(
        publicReason,
        "Public cancellation reason",
        500,
      );

      return serializableTransaction(database, async (transaction) => {
        const event = await transaction.event.findUnique({
          where: { id: eventId },
          include: eventAggregateInclude,
        });

        if (event === null) {
          throw new EventAggregateNotFoundError();
        }

        await requireOwningFirManager(
          transaction,
          actorUserId,
          event.ownerFir.icaoCode,
        );

        if (event.lifecycleState !== "PUBLISHED") {
          throw new EventAggregateError(
            "Only a published event can be cancelled.",
          );
        }

        const updated = await transaction.event.update({
          where: { id: event.id },
          data: {
            lifecycleState: "CANCELLED",
            cancellationReason,
          },
          include: eventAggregateInclude,
        });

        await appendAuditRecord(transaction, {
          actorUserId,
          action: "event.cancelled",
          targetKind: "event",
          targetKey: event.id,
          summary: `Cancelled published event ${event.name}.`,
          beforeState: eventAuditState(event),
          afterState: eventAuditState(updated),
        });

        return updated;
      });
    },
  };
}
