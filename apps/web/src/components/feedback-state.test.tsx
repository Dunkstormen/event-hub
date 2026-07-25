import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedbackState } from "./feedback-state";

describe("FeedbackState", () => {
  it("announces loading feedback as a live status", () => {
    render(<FeedbackState kind="loading" title="Loading events" />);

    expect(screen.getByRole("status").textContent).toContain("Loading events");
  });

  it("renders an empty-state description and action", () => {
    render(
      <FeedbackState
        kind="empty"
        title="No events found"
        description="Try changing the filters."
        action={<a href="/events">Clear filters</a>}
      />,
    );

    expect(screen.getByText("No events found")).toBeTruthy();
    expect(screen.getByText("Try changing the filters.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/events");
  });

  it.each([
    ["error", "Something went wrong"],
    ["success", "Changes saved"],
  ] as const)(
    "renders %s feedback as an accessible alert",
    (kind, title) => {
      render(
        <FeedbackState
          kind={kind}
          title={title}
          description="A useful explanation."
        />,
      );

      const alert = screen.getByRole("alert");

      expect(alert.textContent).toContain(title);
      expect(alert.textContent).toContain("A useful explanation.");
    },
  );
});
