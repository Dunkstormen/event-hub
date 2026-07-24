import type { Metadata } from "next";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";

export const metadata: Metadata = {
  title: "My assignments",
};

export default function AssignmentsPage() {
  return (
    <SectionPage
      title="My assignments"
      description="Review the event positions and times assigned to you."
    >
      <FeedbackState
        kind="empty"
        title="No assignments yet"
        description="Your controller assignments will appear here after rostering begins."
      />
    </SectionPage>
  );
}
