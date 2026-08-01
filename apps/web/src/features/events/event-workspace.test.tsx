import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManagedEventSummary } from "@event-hub/contracts";

import {
  EventWorkspace,
  EventWorkspaceLoading,
} from "./event-workspace";
import {
  EventWorkspaceManager,
  manageableEventsPath,
} from "./event-workspace-manager";
import * as apiClient from "@/lib/api-client";
import { ApiClientError } from "@/lib/api-client";

const events: ManagedEventSummary[] = [
  {
    id: "event-owner",
    name: "Cross the Pond Nordic",
    shortDescription: "An evening of Nordic traffic.",
    lifecycleState: "draft",
    schedule: {
      localStart: "2026-08-15T18:00:00",
      localEnd: "2026-08-15T22:00:00",
      timeZone: "Europe/Copenhagen",
      startInstant: "2026-08-15T16:00:00Z",
      endInstant: "2026-08-15T20:00:00Z",
    },
    ownerFir: {
      icaoCode: "EKDK",
      name: "Copenhagen FIR",
      active: true,
    },
    participatingFirs: [
      { icaoCode: "EFIN", name: "Finland FIR", active: true },
      { icaoCode: "EKDK", name: "Copenhagen FIR", active: true },
    ],
    managementRole: "owner",
    permissions: {
      edit: true,
      transferOwnership: true,
      delete: true,
    },
    version: 1,
    updatedAt: "2026-07-31T12:00:00.000Z",
  },
  {
    id: "event-collaborator",
    name: "Midnight Sun Fly-in",
    shortDescription: "Fly beneath the midnight sun.",
    lifecycleState: "published",
    schedule: {
      localStart: "2026-08-22T20:00:00",
      localEnd: "2026-08-22T23:00:00",
      timeZone: "Europe/Helsinki",
      startInstant: "2026-08-22T17:00:00Z",
      endInstant: "2026-08-22T20:00:00Z",
    },
    ownerFir: {
      icaoCode: "EFIN",
      name: "Finland FIR",
      active: true,
    },
    participatingFirs: [
      { icaoCode: "EFIN", name: "Finland FIR", active: true },
      { icaoCode: "EKDK", name: "Copenhagen FIR", active: true },
    ],
    managementRole: "collaborator",
    permissions: {
      edit: false,
      transferOwnership: false,
      delete: false,
    },
    version: 3,
    updatedAt: "2026-07-31T13:00:00.000Z",
  },
];

const defaultProps = {
  events,
  hasNextPage: false,
  lifecycle: "all" as const,
  pending: false,
  query: "",
  onLifecycleChange: vi.fn(),
  onLoadMore: vi.fn(),
  onQueryChange: vi.fn(),
  onReset: vi.fn(),
};

describe("event coordinator workspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps search and lifecycle state as one filter model", () => {
    const onLifecycleChange = vi.fn();
    const onQueryChange = vi.fn();

    render(
      <EventWorkspace
        {...defaultProps}
        onLifecycleChange={onLifecycleChange}
        onQueryChange={onQueryChange}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search manageable events",
      }),
      { target: { value: "Nordic" } },
    );
    fireEvent.click(screen.getByRole("tab", { name: "Published" }));

    expect(onQueryChange).toHaveBeenCalledWith("Nordic");
    expect(onLifecycleChange).toHaveBeenCalledWith("published");
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Collaborator").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: /Manage/u })
        .some(
          (link) =>
            link.getAttribute("href") ===
            "/workspace/events/event-owner",
        ),
    ).toBe(true);
  });

  it("builds one API request from search, lifecycle, and cursor", () => {
    expect(
      manageableEventsPath("  Nordic  ", "published", "next-page"),
    ).toBe(
      "/v1/events/manageable?limit=25&q=Nordic&lifecycleState=published&cursor=next-page",
    );
  });

  it("offers an actionable reset when filters have no results", () => {
    const onReset = vi.fn();

    render(
      <EventWorkspace
        {...defaultProps}
        events={[]}
        lifecycle="archived"
        query="missing"
        onReset={onReset}
      />,
    );

    expect(screen.getByText("No matching events")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset search and filters" }),
    );
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("announces the loading state", () => {
    render(<EventWorkspaceLoading />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading manageable events")).toBeTruthy();
  });

  it("offers sign-in recovery when the API rejects an anonymous session", async () => {
    vi.spyOn(apiClient, "apiRequest").mockRejectedValueOnce(
      new ApiClientError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      ),
    );

    render(<EventWorkspaceManager />);

    expect(await screen.findByText("Sign in to continue")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/sign-in",
    );
  });

  it("retries a failed initial workspace request", async () => {
    vi.spyOn(apiClient, "apiRequest")
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({
        items: [],
        pageInfo: { hasNextPage: false, nextCursor: null },
      });

    render(<EventWorkspaceManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No manageable events yet")).toBeTruthy();
  });
});
