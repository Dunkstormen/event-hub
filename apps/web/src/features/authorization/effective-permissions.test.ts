import { describe, expect, it } from "vitest";

import type {
  AuthorizationAssignment,
  AuthorizationRole,
} from "@event-hub/contracts";

import { effectivePermissions } from "./effective-permissions";

const roles: AuthorizationRole[] = [
  {
    key: "pilot",
    name: "Pilot",
    description: "Default access.",
    scope: "global",
    protected: true,
    capabilityKeys: ["events.participate"],
    assignmentCount: 1,
  },
  {
    key: "event-coordinator",
    name: "Event Coordinator",
    description: "Scoped event access.",
    scope: "fir",
    protected: true,
    capabilityKeys: ["events.manage", "rosters.manage"],
    assignmentCount: 0,
  },
];

const pilotAssignment: AuthorizationAssignment = {
  id: "assignment-pilot",
  roleKey: "pilot",
  roleName: "Pilot",
  roleScope: "global",
  fir: null,
  createdAt: "2026-07-26T10:00:00.000Z",
};

describe("effectivePermissions", () => {
  it("previews the union of current and pending scoped grants", () => {
    expect(
      effectivePermissions([pilotAssignment], roles, {
        roleKey: "event-coordinator",
        firIcaoCode: "EKDK",
      }),
    ).toEqual([
      {
        capabilityKey: "events.manage",
        global: false,
        firIcaoCodes: ["EKDK"],
      },
      {
        capabilityKey: "events.participate",
        global: true,
        firIcaoCodes: [],
      },
      {
        capabilityKey: "rosters.manage",
        global: false,
        firIcaoCodes: ["EKDK"],
      },
    ]);
  });

  it("lets a global grant supersede narrower FIR grants", () => {
    expect(
      effectivePermissions(
        [
          {
            ...pilotAssignment,
            roleKey: "event-coordinator",
            roleName: "Event Coordinator",
            roleScope: "fir",
            fir: {
              icaoCode: "EKDK",
              name: "Copenhagen FIR",
              active: true,
            },
          },
        ],
        [
          {
            ...roles[1]!,
            scope: "global",
          },
        ],
        { roleKey: "event-coordinator" },
      ),
    ).toEqual([
      {
        capabilityKey: "events.manage",
        global: true,
        firIcaoCodes: [],
      },
      {
        capabilityKey: "rosters.manage",
        global: true,
        firIcaoCodes: [],
      },
    ]);
  });
});
