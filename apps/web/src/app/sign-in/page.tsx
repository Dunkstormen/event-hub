import type { Metadata } from "next";
import Link from "next/link";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <SectionPage
      title="Sign in"
      description="Event Hub will use VATSIM Connect for secure access."
    >
      <FeedbackState
        kind="empty"
        title="VATSIM Connect is not configured yet"
        description="Authentication will become available as the identity foundation is completed."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Return home
          </Link>
        }
      />
    </SectionPage>
  );
}
