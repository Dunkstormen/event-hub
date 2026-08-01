import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Airport,
  EventSchedule,
  Fir,
  ManagedEvent,
} from "@event-hub/contracts";

import * as apiClient from "@/lib/api-client";
import { EventWizard } from "./event-wizard";
import { EventWizardManager } from "./event-wizard-manager";
import {
  emptyEventWizardValues,
  firstInvalidEventWizardStep,
  parseEventWizardDraft,
  serializeEventWizardDraft,
  validateEventWizard,
  validateEventWizardStep,
  type EventWizardStep,
  type EventWizardValues,
} from "./event-wizard-model";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const firs: Fir[] = [
  { icaoCode: "EKDK", name: "Copenhagen FIR", active: true },
  { icaoCode: "EFIN", name: "Finland FIR", active: true },
];

const airports: Airport[] = [
  {
    icaoCode: "EKCH",
    name: "Copenhagen/Kastrup",
    active: true,
    fir: { icaoCode: "EKDK", name: "Copenhagen FIR" },
  },
];

const schedule: EventSchedule = {
  localStart: "2026-08-15T18:00:00",
  localEnd: "2026-08-15T22:00:00",
  timeZone: "Europe/Copenhagen",
  startInstant: "2026-08-15T16:00:00Z",
  endInstant: "2026-08-15T20:00:00Z",
};

const completeValues: EventWizardValues = {
  ownerFirIcaoCode: "EKDK",
  name: "Cross the Pond Nordic",
  shortDescription: "An evening of Nordic traffic.",
  localStart: "2026-08-15T18:00",
  localEnd: "2026-08-15T22:00",
  timeZone: "Europe/Copenhagen",
  participatingFirIcaoCodes: ["EKDK"],
  participatingAirportIcaoCodes: [],
  description: "Fly between participating Nordic airports.",
  bannerStorageKey: null,
  rosteringType: "open-interest",
};

const createdEvent: ManagedEvent = {
  id: "event-created",
  name: completeValues.name,
  shortDescription: completeValues.shortDescription,
  description: completeValues.description,
  bannerStorageKey: null,
  rosteringType: "open-interest",
  lifecycleState: "draft",
  cancellationReason: null,
  schedule,
  ownerFir: firs[0]!,
  participatingFirs: [firs[0]!],
  participatingAirports: [],
  createdBy: { id: "user-1", cid: "10000001" },
  managementRole: "owner",
  permissions: { edit: true, transferOwnership: true, delete: true },
  version: 1,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

function WizardHarness() {
  const [values, setValues] = useState(completeValues);
  const [step, setStep] = useState<EventWizardStep>("basics");

  return (
    <EventWizard
      mode="create"
      values={values}
      ownerFirs={firs}
      firs={firs}
      airports={airports}
      step={step}
      errors={{}}
      schedule={schedule}
      scheduleError={undefined}
      canEditParticipatingFirs
      pending={false}
      onChange={setValues}
      onStepChange={setStep}
      onBack={() => setStep("basics")}
      onContinue={() => setStep("schedule")}
      onSaveAndExit={vi.fn()}
      onCancel={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

describe("event setup wizard", () => {
  afterEach(() => {
    localStorage.clear();
    push.mockReset();
    vi.restoreAllMocks();
  });

  it("validates the relevant step and locates the first incomplete step", () => {
    const values = emptyEventWizardValues();

    expect(validateEventWizardStep("basics", values)).toMatchObject({
      ownerFirIcaoCode: expect.any(String),
      name: expect.any(String),
      shortDescription: expect.any(String),
    });
    expect(firstInvalidEventWizardStep(validateEventWizard(values))).toBe(
      "basics",
    );
  });

  it("round-trips versioned local progress and rejects stale shapes", () => {
    const serialized = serializeEventWizardDraft(completeValues);

    expect(parseEventWizardDraft(serialized)?.values).toEqual(completeValues);
    expect(
      parseEventWizardDraft(
        JSON.stringify({ schemaVersion: 0, values: completeValues }),
      ),
    ).toBeUndefined();
  });

  it("keeps entered data when moving between setup steps", () => {
    render(<WizardHarness />);

    fireEvent.change(screen.getByLabelText(/Event name/u), {
      target: { value: "Nordic Summer Fly-in" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Basics" }));
    expect(
      screen.getByDisplayValue("Nordic Summer Fly-in"),
    ).toBeTruthy();
  });

  it("marks a missing banner as optional on review", () => {
    render(
      <EventWizard
        mode="create"
        values={completeValues}
        ownerFirs={firs}
        firs={firs}
        airports={airports}
        step="review"
        errors={{}}
        schedule={schedule}
        scheduleError={undefined}
        canEditParticipatingFirs
        pending={false}
        onChange={vi.fn()}
        onStepChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onSaveAndExit={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Banner")).toBeTruthy();
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready to create as a draft")).toBeTruthy();
  });

  it("resumes a valid locally saved new-event draft", async () => {
    localStorage.setItem(
      "event-hub:event-wizard:new:v1",
      serializeEventWizardDraft({
        ...completeValues,
        name: "Resumed Nordic draft",
      }),
    );
    vi.spyOn(apiClient, "apiRequest").mockImplementation(async (path) => {
      if (path === "/v1/events/management-context") {
        return { ownerFirs: firs };
      }
      if (path.startsWith("/v1/firs?")) {
        return {
          items: firs,
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }
      if (path.startsWith("/v1/airports?")) {
        return {
          items: airports,
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }
      if (path === "/v1/events/schedule-preview") {
        return schedule;
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    render(<EventWizardManager mode="create" />);

    expect(await screen.findByDisplayValue("Resumed Nordic draft")).toBeTruthy();
    expect(screen.getByText("Saved locally as you work")).toBeTruthy();
  });

  it("creates a complete draft through the versioned API contract", async () => {
    localStorage.setItem(
      "event-hub:event-wizard:new:v1",
      serializeEventWizardDraft(completeValues),
    );
    const request = vi
      .spyOn(apiClient, "apiRequest")
      .mockImplementation(async (path) => {
        if (path === "/v1/events/management-context") {
          return { ownerFirs: firs };
        }
        if (path.startsWith("/v1/firs?")) {
          return {
            items: firs,
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        if (path.startsWith("/v1/airports?")) {
          return {
            items: airports,
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        }
        if (path === "/v1/events/schedule-preview") {
          return schedule;
        }
        if (path === "/v1/firs/EKDK/events") {
          return createdEvent;
        }
        throw new Error(`Unexpected API path: ${path}`);
      });

    render(<EventWizardManager mode="create" />);

    await screen.findByDisplayValue(completeValues.name);
    await waitFor(
      () =>
        expect(request).toHaveBeenCalledWith(
          "/v1/events/schedule-preview",
          expect.objectContaining({ method: "POST" }),
        ),
      { timeout: 1_500 },
    );
    fireEvent.click(screen.getByRole("button", { name: /Review/u }));
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/workspace/events/event-created",
      ),
    );
    const createCall = request.mock.calls.find(
      ([path]) => path === "/v1/firs/EKDK/events",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      localStart: "2026-08-15T18:00:00",
      localEnd: "2026-08-15T22:00:00",
      timeZone: "Europe/Copenhagen",
      participatingFirIcaoCodes: ["EKDK"],
      participatingAirportIcaoCodes: [],
    });
  });
});
