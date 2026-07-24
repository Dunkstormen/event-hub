import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";

export default function Loading() {
  return (
    <SectionPage
      title="Loading"
      description="Preparing the latest Event Hub information."
    >
      <FeedbackState kind="loading" title="Loading events" />
    </SectionPage>
  );
}
