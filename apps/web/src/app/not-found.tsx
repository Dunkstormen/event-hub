import Link from "next/link";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <SectionPage
      title="Page not found"
      description="The page may have moved or the link may be incomplete."
    >
      <FeedbackState
        kind="empty"
        title="Nothing is available here"
        description="Return to Event Hub and choose another destination."
        action={
          <Link href="/" className={buttonVariants()}>
            Return home
          </Link>
        }
      />
    </SectionPage>
  );
}
