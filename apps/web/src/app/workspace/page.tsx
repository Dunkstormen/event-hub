import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EventWorkspaceManager } from "@/features/events/event-workspace-manager";

export const metadata: Metadata = {
  title: "Event workspace",
};

export default function WorkspacePage() {
  return (
    <section className="page-shell flex flex-1 flex-col py-12 sm:py-16">
      <div className="flex flex-col items-start justify-between gap-7 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            Event workspace
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            Plan and manage events for the FIRs you coordinate.
          </p>
        </div>
        <Link
          href="/workspace/events/new"
          prefetch={false}
          className={buttonVariants({
            className: "w-full sm:w-auto",
            size: "lg",
          })}
        >
          <PlusIcon data-icon="inline-start" />
          Create event
        </Link>
      </div>

      <div className="mt-10">
        <EventWorkspaceManager />
      </div>
    </section>
  );
}
