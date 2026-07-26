import type { Metadata } from "next";
import { LogInIcon } from "lucide-react";

import { FeedbackState } from "@/components/feedback-state";
import { SectionPage } from "@/components/section-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

const vatsimSignInUrl = new URL(
  "/v1/auth/vatsim",
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
).toString();

export default function SignInPage() {
  return (
    <SectionPage
      title="Sign in"
      description="Use your VATSIM account to access Event Hub."
    >
      <FeedbackState
        kind="empty"
        title="Continue with VATSIM Connect"
        description="You will be redirected to VATSIM to authenticate, then returned securely to Event Hub."
        stackActionOnMobile
        action={
          <a href={vatsimSignInUrl} className={buttonVariants()}>
            <LogInIcon data-icon="inline-start" aria-hidden="true" />
            Sign in with VATSIM
          </a>
        }
      />
    </SectionPage>
  );
}
