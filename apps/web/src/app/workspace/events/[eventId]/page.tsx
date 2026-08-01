import type { Metadata } from "next";

import { EventWizardManager } from "@/features/events/event-wizard-manager";

export const metadata: Metadata = {
  title: "Edit event draft",
};

type EditEventPageProps = Readonly<{
  params: Promise<{ eventId: string }>;
}>;

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { eventId } = await params;

  return (
    <section className="page-shell flex-1 py-10 sm:py-14">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          Edit event draft
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
          Review every setup step and save changes without publishing the event.
        </p>
      </div>
      <div className="mt-9">
        <EventWizardManager mode="edit" eventId={eventId} />
      </div>
    </section>
  );
}
