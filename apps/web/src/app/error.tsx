"use client";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";
import { Button } from "@/components/ui/button";

type ErrorPageProps = Readonly<{
  reset: () => void;
}>;

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <SectionPage
      title="Something went wrong"
      description="Event Hub could not complete this request."
    >
      <FeedbackState
        kind="error"
        title="Something went wrong"
        description="Try the request again. If the problem continues, return to the previous page."
        action={
          <Button variant="destructive" onClick={reset}>
            Try again
          </Button>
        }
      />
    </SectionPage>
  );
}
