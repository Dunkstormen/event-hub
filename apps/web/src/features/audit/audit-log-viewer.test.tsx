import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AuditRecord } from "@event-hub/contracts";

import { AuditLogViewer } from "./audit-log-viewer";

const record: AuditRecord = {
  id: "audit-1",
  action: "authorization.role.updated",
  actor: {
    cid: "10000001",
    displayName: "Ada Administrator",
  },
  targetKind: "role",
  targetKey: "event-coordinator",
  summary: "Updated role Event Coordinator.",
  beforeState: {
    capabilityKeys: ["events.manage"],
  },
  afterState: {
    capabilityKeys: ["events.manage", "rosters.manage"],
  },
  createdAt: "2026-07-31T12:00:00.000Z",
};

describe("audit log viewer", () => {
  it("applies administrator filters", () => {
    const onSearch = vi.fn(async () => {});

    render(
      <AuditLogViewer
        records={[record]}
        hasNextPage={false}
        pending={false}
        onSearch={onSearch}
        onLoadMore={vi.fn(async () => {})}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "Event Coordinator" },
    });
    fireEvent.change(screen.getByLabelText("Actor CID"), {
      target: { value: "10000001" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Event Coordinator",
        actorCid: "10000001",
      }),
    );
  });

  it("opens complete before and after evidence in a details sheet", () => {
    render(
      <AuditLogViewer
        records={[record]}
        hasNextPage={false}
        pending={false}
        onSearch={vi.fn(async () => {})}
        onLoadMore={vi.fn(async () => {})}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Inspect" })[0]!,
    );

    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Audit record")).toBeTruthy();
    expect(dialog.getByText("Ada Administrator")).toBeTruthy();
    expect(dialog.getByText("CID 10000001")).toBeTruthy();
    expect(dialog.getByText(/rosters\.manage/u)).toBeTruthy();
    expect(dialog.getByText("role:event-coordinator")).toBeTruthy();
  });
});
