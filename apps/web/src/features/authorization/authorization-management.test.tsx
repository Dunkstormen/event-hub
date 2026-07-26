import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AuthorizationOverview,
  AuthorizationRole,
  AuthorizationUser,
} from "@event-hub/contracts";

import { AssignmentManagementPanel } from "./assignment-management-panel";
import { RoleManagementPanel } from "./role-management-panel";

const coordinatorRole: AuthorizationRole = {
  key: "event-coordinator",
  name: "Event Coordinator",
  description: "Manages events and rosters in one FIR.",
  scope: "fir",
  protected: true,
  capabilityKeys: ["events.manage", "rosters.manage"],
  assignmentCount: 2,
};

const capabilities: AuthorizationOverview["capabilities"] = [
  {
    key: "events.manage",
    name: "Manage events",
    description: "Manage events in scope.",
    scope: "global-or-fir",
  },
  {
    key: "rosters.manage",
    name: "Manage rosters",
    description: "Manage rosters in scope.",
    scope: "global-or-fir",
  },
];

const user: AuthorizationUser = {
  id: "user-1",
  cid: "1234567",
  displayName: "Ada Coordinator",
  status: "active",
  assignments: [],
  effectiveCapabilities: [],
};

describe("authorization management previews", () => {
  it("shows the role capability result and affected assignment count before save", () => {
    render(
      <RoleManagementPanel
        capabilities={capabilities}
        roles={[coordinatorRole]}
        pending={false}
        onCreate={vi.fn(async () => true)}
        onDelete={vi.fn(async () => true)}
        onUpdate={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Effective role preview")).toBeTruthy();
    expect(screen.getAllByText("events.manage").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Saving affects 2 current assignments/u),
    ).toBeTruthy();
  });

  it("shows scoped effective permissions before granting a user assignment", () => {
    render(
      <AssignmentManagementPanel
        firs={[
          {
            icaoCode: "EKDK",
            name: "Copenhagen FIR",
            active: true,
          },
        ]}
        hasNextPage={false}
        pending={false}
        roles={[coordinatorRole]}
        users={[user]}
        onAssign={vi.fn(async () => {})}
        onLoadMore={vi.fn(async () => {})}
        onRevoke={vi.fn(async () => {})}
        onSearch={vi.fn(async () => {})}
      />,
    );

    expect(
      screen.getByText("Effective permissions after assignment"),
    ).toBeTruthy();
    expect(screen.getByText("events.manage · EKDK")).toBeTruthy();
    expect(screen.getByText("rosters.manage · EKDK")).toBeTruthy();
  });
});
