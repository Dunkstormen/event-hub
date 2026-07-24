import type { Metadata } from "next";
import Link from "next/link";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Events",
};

export default function EventsPage() {
  return (
    <SectionPage
      title="Events"
      description="Discover published events across VATSIM Scandinavia."
    >
      <FeedbackState
        kind="empty"
        title="No events found"
        description="Published events will appear here as soon as they become available."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Return home
          </Link>
        }
      />
    </SectionPage>
  );
}
