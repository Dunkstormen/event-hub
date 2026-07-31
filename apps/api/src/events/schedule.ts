import { Temporal } from "@js-temporal/polyfill";

const localDateTimePattern =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$/u;

export type EventScheduleInput = Readonly<{
  localStart: string;
  localEnd: string;
  timeZone: string;
}>;

export type ValidatedEventSchedule = Readonly<{
  localStart: string;
  localEnd: string;
  timeZone: string;
  startInstant: string;
  endInstant: string;
}>;

export class EventScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventScheduleError";
  }
}

function parseLocalDateTime(value: string, label: string) {
  if (!localDateTimePattern.test(value)) {
    throw new EventScheduleError(
      `${label} must use the local civil-time format YYYY-MM-DDTHH:mm:ss.`,
    );
  }

  try {
    return Temporal.PlainDateTime.from(value, {
      overflow: "reject",
    });
  } catch {
    throw new EventScheduleError(
      `${label} must be a valid local date and time.`,
    );
  }
}

function canonicalTimeZone(value: string) {
  const timeZone = value.trim();

  if (timeZone === "") {
    throw new EventScheduleError(
      "Time zone must be a valid IANA time zone identifier.",
    );
  }

  try {
    const canonical = new Intl.DateTimeFormat("en", {
      timeZone,
    }).resolvedOptions().timeZone;
    const supportedTimeZones = Intl.supportedValuesOf("timeZone");

    if (canonical !== "UTC" && !supportedTimeZones.includes(canonical)) {
      throw new RangeError("Unsupported IANA time zone.");
    }

    return canonical;
  } catch {
    throw new EventScheduleError(
      "Time zone must be a valid IANA time zone identifier.",
    );
  }
}

function uniqueZonedDateTime(
  value: Temporal.PlainDateTime,
  label: string,
  timeZone: string,
) {
  try {
    return value.toZonedDateTime(timeZone, {
      disambiguation: "reject",
    });
  } catch {
    throw new EventScheduleError(
      `${label} must identify exactly one instant in ${timeZone}; ambiguous and nonexistent local times are not allowed.`,
    );
  }
}

export function validateEventSchedule(
  input: EventScheduleInput,
): ValidatedEventSchedule {
  const localStart = parseLocalDateTime(
    input.localStart,
    "Local start",
  );
  const localEnd = parseLocalDateTime(input.localEnd, "Local end");
  const timeZone = canonicalTimeZone(input.timeZone);
  const start = uniqueZonedDateTime(
    localStart,
    "Local start",
    timeZone,
  );
  const end = uniqueZonedDateTime(localEnd, "Local end", timeZone);

  if (Temporal.Instant.compare(start.toInstant(), end.toInstant()) >= 0) {
    throw new EventScheduleError(
      "Local end must resolve to an instant after local start.",
    );
  }

  return {
    localStart: localStart.toString({ smallestUnit: "second" }),
    localEnd: localEnd.toString({ smallestUnit: "second" }),
    timeZone,
    startInstant: start.toInstant().toString(),
    endInstant: end.toInstant().toString(),
  };
}
