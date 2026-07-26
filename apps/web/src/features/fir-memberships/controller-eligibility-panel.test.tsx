import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ControllerEligibilityStatus } from "@event-hub/contracts";

import { ControllerEligibilityPanel } from "./controller-eligibility-panel";

const status: ControllerEligibilityStatus = {
  generatedAt: "2026-07-26T13:00:00.000Z",
  providers: [
    {
      provider: "control-center",
      configured: true,
      state: "failed",
      freshness: "stale",
      lastAttemptedAt: "2026-07-26T12:30:00.000Z",
      lastSucceededAt: "2026-07-26T10:00:00.000Z",
      freshUntil: "2026-07-26T12:00:00.000Z",
      lastErrorCode: "PROVIDER_UNAVAILABLE",
      lastErrorMessage: "Control Center is unavailable.",
      consecutiveFailures: 1,
      recordsSeen: 25,
      nextRetryAt: "2026-07-26T12:35:00.000Z",
    },
    {
      provider: "vateud",
      configured: false,
      state: "never",
      freshness: "disabled",
      lastAttemptedAt: null,
      lastSucceededAt: null,
      freshUntil: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      recordsSeen: 0,
      nextRetryAt: null,
    },
  ],
  recentRuns: [
    {
      id: "run-1",
      provider: "control-center",
      trigger: "periodic",
      status: "failed",
      startedAt: "2026-07-26T12:30:00.000Z",
      completedAt: "2026-07-26T12:30:01.000Z",
      controllersSeen: 0,
      membershipsChanged: 0,
      errorCode: "PROVIDER_UNAVAILABLE",
    },
  ],
};

describe("controller eligibility provider panel", () => {
  it("announces stale failures and exposes a named retry action", async () => {
    const onSynchronize = vi.fn(async () => {});

    render(
      <ControllerEligibilityPanel
        status={status}
        pendingProvider={null}
        onSynchronize={onSynchronize}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("Provider evidence needs attention"),
    ).toBeTruthy();
    expect(screen.getByText("Stale evidence")).toBeTruthy();
    expect(
      screen.getByText("Control Center is unavailable."),
    ).toBeTruthy();
    expect(screen.getByText("Not configured")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Synchronize now" }),
    );
    expect(onSynchronize).toHaveBeenCalledWith("control-center");
  });
});
