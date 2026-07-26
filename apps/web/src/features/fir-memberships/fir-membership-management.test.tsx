import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  FirMembershipOverview,
  FirMembershipUser,
} from "@event-hub/contracts";

import { FirMembershipAuditPanel } from "./fir-membership-audit-panel";
import { FirMembershipManagementPanel } from "./fir-membership-management-panel";

const firs: FirMembershipOverview["firs"] = [
  {
    icaoCode: "EKDK",
    name: "Copenhagen FIR",
    active: true,
  },
  {
    icaoCode: "ESAA",
    name: "Sweden FIR",
    active: true,
  },
];

const user: FirMembershipUser = {
  id: "user-1",
  cid: "1234567",
  displayName: "Ada Controller",
  status: "active",
  memberships: [
    {
      id: "membership-1",
      fir: firs[0]!,
      source: "automatic",
      status: "active",
      sourceProvider: "vateud",
      providerFreshUntil: "2026-07-26T12:00:00.000Z",
      reason: null,
      changedBy: null,
      activeSince: "2026-07-25T08:00:00.000Z",
      revokedAt: null,
      updatedAt: "2026-07-25T08:00:00.000Z",
    },
  ],
};

describe("FIR membership management", () => {
  it("distinguishes automatic membership and previews a manual override", () => {
    render(
      <FirMembershipManagementPanel
        firs={firs}
        hasNextPage={false}
        pending={false}
        users={[user]}
        onAssign={vi.fn(async () => true)}
        onLoadMore={vi.fn(async () => {})}
        onRevoke={vi.fn(async () => true)}
        onSearch={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByText("Automatic")).toBeTruthy();
    expect(screen.getByText("vateud")).toBeTruthy();
    expect(
      screen.getByText(/Replace the automatic EKDK membership/u),
    ).toBeTruthy();

    const reviewButton = screen.getByRole("button", {
      name: "Review manual override",
    });
    expect(reviewButton.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Manual reason"), {
      target: { value: "Control Center synchronization is unavailable." },
    });

    expect(reviewButton.hasAttribute("disabled")).toBe(false);
  });

  it("renders membership-specific audit history", () => {
    render(
      <FirMembershipAuditPanel
        records={[
          {
            id: "audit-1",
            action: "fir-membership.overridden",
            actor: {
              cid: "7654321",
              displayName: "Alex Administrator",
            },
            targetKind: "fir-membership",
            targetKey: "1234567:EKDK",
            summary: "Overrode automatic EKDK membership.",
            createdAt: "2026-07-26T09:30:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("overridden")).toBeTruthy();
    expect(screen.getByText("Alex Administrator")).toBeTruthy();
    expect(screen.getByText("1234567:EKDK")).toBeTruthy();
  });
});
