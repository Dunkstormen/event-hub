import { describe, expect, it } from "vitest";

import {
  EventScheduleError,
  validateEventSchedule,
} from "./schedule.js";

describe("event schedule validation", () => {
  it("preserves local civil values and derives their instants", () => {
    expect(
      validateEventSchedule({
        localStart: "2026-07-31T18:00:00",
        localEnd: "2026-07-31T21:00:00",
        timeZone: "Europe/Copenhagen",
      }),
    ).toEqual({
      localStart: "2026-07-31T18:00:00",
      localEnd: "2026-07-31T21:00:00",
      timeZone: "Europe/Copenhagen",
      startInstant: "2026-07-31T16:00:00Z",
      endInstant: "2026-07-31T19:00:00Z",
    });
  });

  it.each([
    [
      "nonexistent",
      "2026-03-29T02:30:00",
      "2026-03-29T04:00:00",
    ],
    [
      "ambiguous",
      "2026-10-25T02:30:00",
      "2026-10-25T04:00:00",
    ],
  ])("rejects a %s local start", (_, localStart, localEnd) => {
    expect(() =>
      validateEventSchedule({
        localStart,
        localEnd,
        timeZone: "Europe/Copenhagen",
      }),
    ).toThrow(
      "ambiguous and nonexistent local times are not allowed",
    );
  });

  it("rejects malformed dates, unknown zones, and non-positive ranges", () => {
    expect(() =>
      validateEventSchedule({
        localStart: "2026-02-30T18:00:00",
        localEnd: "2026-02-30T20:00:00",
        timeZone: "Europe/Copenhagen",
      }),
    ).toThrow("Local start must be a valid local date and time.");

    expect(() =>
      validateEventSchedule({
        localStart: "2026-07-31T18:00:00",
        localEnd: "2026-07-31T20:00:00",
        timeZone: "Copenhagen/Unknown",
      }),
    ).toThrow("valid IANA time zone identifier");

    expect(() =>
      validateEventSchedule({
        localStart: "2026-07-31T20:00:00",
        localEnd: "2026-07-31T18:00:00",
        timeZone: "Europe/Copenhagen",
      }),
    ).toThrow(EventScheduleError);
  });
});
