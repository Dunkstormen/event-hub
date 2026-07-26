import type { Metadata } from "next";

import { AdministrationNav } from "@/components/administration-nav";
import { SectionPage } from "@/components/section-page";
import { FirMembershipManager } from "@/features/fir-memberships/fir-membership-manager";

export const metadata: Metadata = {
  title: "FIR memberships",
};

export default function FirMembershipsPage() {
  return (
    <SectionPage
      eyebrow="Administration"
      wide
      title="FIR memberships"
      description="Review controller coverage across FIRs and manage the audited manual fallback when automatic eligibility is unavailable."
    >
      <AdministrationNav />
      <FirMembershipManager />
    </SectionPage>
  );
}
