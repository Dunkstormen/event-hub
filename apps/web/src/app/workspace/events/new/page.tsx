import type { Metadata } from "next";

import { EventWizardManager } from "@/features/events/event-wizard-manager";

export const metadata: Metadata = {
  title: "Create event",
};

export default function CreateEventPage() {
  return (
    <section className="page-shell flex-1 py-10 sm:py-14">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          Create event
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
          Build a validated event draft step by step. Nothing is published from this flow.
        </p>
      </div>
      <div className="mt-9">
        <EventWizardManager mode="create" />
      </div>
    </section>
  );
}
