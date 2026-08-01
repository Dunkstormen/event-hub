import type { ManagedEvent } from "@event-hub/contracts";

export const eventWizardSteps = [
  { id: "basics", label: "Basics" },
  { id: "schedule", label: "Schedule" },
  { id: "participants", label: "Participants" },
  { id: "content", label: "Content" },
  { id: "rostering", label: "Rostering" },
  { id: "review", label: "Review" },
] as const;

export type EventWizardStep = (typeof eventWizardSteps)[number]["id"];
export type EventWizardRosteringType =
  | ""
  | "open-interest"
  | "predefined";

export type EventWizardValues = Readonly<{
  ownerFirIcaoCode: string;
  name: string;
  shortDescription: string;
  localStart: string;
  localEnd: string;
  timeZone: string;
  participatingFirIcaoCodes: readonly string[];
  participatingAirportIcaoCodes: readonly string[];
  description: string;
  bannerStorageKey: string | null;
  rosteringType: EventWizardRosteringType;
}>;

export type EventWizardErrors = Readonly<Record<string, string>>;

type StoredEventWizardDraft = Readonly<{
  schemaVersion: 1;
  savedAt: string;
  values: EventWizardValues;
}>;

export function emptyEventWizardValues(): EventWizardValues {
  return {
    ownerFirIcaoCode: "",
    name: "",
    shortDescription: "",
    localStart: "",
    localEnd: "",
    timeZone: "Europe/Copenhagen",
    participatingFirIcaoCodes: [],
    participatingAirportIcaoCodes: [],
    description: "",
    bannerStorageKey: null,
    rosteringType: "open-interest",
  };
}

export function eventToWizardValues(event: ManagedEvent): EventWizardValues {
  return {
    ownerFirIcaoCode: event.ownerFir.icaoCode,
    name: event.name,
    shortDescription: event.shortDescription,
    localStart: event.schedule.localStart.slice(0, 16),
    localEnd: event.schedule.localEnd.slice(0, 16),
    timeZone: event.schedule.timeZone,
    participatingFirIcaoCodes: event.participatingFirs.map(
      ({ icaoCode }) => icaoCode,
    ),
    participatingAirportIcaoCodes: event.participatingAirports.map(
      ({ icaoCode }) => icaoCode,
    ),
    description: event.description,
    bannerStorageKey: event.bannerStorageKey,
    rosteringType: event.rosteringType,
  };
}

export function toWireDateTime(value: string) {
  return value.length === 16 ? `${value}:00` : value;
}

function required(value: string, message: string) {
  return value.trim() === "" ? message : undefined;
}

export function validateEventWizardStep(
  step: EventWizardStep,
  values: EventWizardValues,
): EventWizardErrors {
  const errors: Record<string, string> = {};

  if (step === "basics") {
    errors.ownerFirIcaoCode = required(
      values.ownerFirIcaoCode,
      "Select the FIR that owns this event.",
    ) ?? "";
    errors.name = required(values.name, "Enter an event name.") ?? "";
    errors.shortDescription =
      required(values.shortDescription, "Enter a short description.") ?? "";
    if (values.name.length > 191) {
      errors.name = "Keep the event name within 191 characters.";
    }
    if (values.shortDescription.length > 500) {
      errors.shortDescription =
        "Keep the short description within 500 characters.";
    }
  }

  if (step === "schedule") {
    errors.localStart =
      required(values.localStart, "Choose a local start time.") ?? "";
    errors.localEnd =
      required(values.localEnd, "Choose a local end time.") ?? "";
    errors.timeZone = required(values.timeZone, "Select a time zone.") ?? "";
    if (
      errors.localStart === "" &&
      errors.localEnd === "" &&
      values.localEnd <= values.localStart
    ) {
      errors.localEnd = "The end must be after the start.";
    }
  }

  if (step === "content") {
    errors.description =
      required(values.description, "Enter the full event description.") ?? "";
    if (values.description.length > 65_535) {
      errors.description = "Keep the description within 65,535 characters.";
    }
  }

  if (step === "rostering" && values.rosteringType === "") {
    errors.rosteringType = "Choose a rostering approach.";
  }

  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== ""),
  );
}

export function validateEventWizard(
  values: EventWizardValues,
): EventWizardErrors {
  return Object.assign(
    {},
    ...eventWizardSteps.map(({ id }) => validateEventWizardStep(id, values)),
  ) as EventWizardErrors;
}

export function firstInvalidEventWizardStep(
  errors: EventWizardErrors,
): EventWizardStep | undefined {
  const fieldsByStep: Readonly<Record<EventWizardStep, readonly string[]>> = {
    basics: ["ownerFirIcaoCode", "name", "shortDescription"],
    schedule: ["localStart", "localEnd", "timeZone"],
    participants: [],
    content: ["description"],
    rostering: ["rosteringType"],
    review: [],
  };

  return eventWizardSteps.find(({ id }) =>
    fieldsByStep[id].some((field) => errors[field] !== undefined),
  )?.id;
}

export function wizardStorageKey(eventId?: string) {
  return eventId === undefined
    ? "event-hub:event-wizard:new:v1"
    : `event-hub:event-wizard:${eventId}:v1`;
}

export function serializeEventWizardDraft(values: EventWizardValues) {
  return JSON.stringify({
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    values,
  } satisfies StoredEventWizardDraft);
}

export function parseEventWizardDraft(
  value: string | null,
): StoredEventWizardDraft | undefined {
  if (value === null) {
    return undefined;
  }

  try {
    const draft = JSON.parse(value) as Partial<StoredEventWizardDraft>;
    const values = draft.values as Partial<EventWizardValues> | undefined;

    if (
      draft.schemaVersion !== 1 ||
      typeof draft.savedAt !== "string" ||
      values === undefined ||
      typeof values.ownerFirIcaoCode !== "string" ||
      typeof values.name !== "string" ||
      typeof values.shortDescription !== "string" ||
      typeof values.localStart !== "string" ||
      typeof values.localEnd !== "string" ||
      typeof values.timeZone !== "string" ||
      !Array.isArray(values.participatingFirIcaoCodes) ||
      !Array.isArray(values.participatingAirportIcaoCodes) ||
      typeof values.description !== "string" ||
      !(typeof values.bannerStorageKey === "string" ||
        values.bannerStorageKey === null) ||
      !["", "open-interest", "predefined"].includes(
        values.rosteringType ?? "invalid",
      )
    ) {
      return undefined;
    }

    return draft as StoredEventWizardDraft;
  } catch {
    return undefined;
  }
}
