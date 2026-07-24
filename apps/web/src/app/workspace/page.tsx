import type { Metadata } from "next";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";

export const metadata: Metadata = {
  title: "Workspace",
};

export default function WorkspacePage() {
  return (
    <SectionPage
      title="Workspace"
      description="Plan and manage events for the FIRs you coordinate."
    >
      <FeedbackState
        kind="success"
        title="The workspace shell is ready"
        description="Coordinator workflows will connect here as the event-management foundation is added."
      />
    </SectionPage>
  );
}
