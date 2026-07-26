import type { Metadata } from "next";

import { SectionPage } from "@/components/section-page";
import { AuthorizationManager } from "@/features/authorization/authorization-manager";

export const metadata: Metadata = {
  title: "Access management",
};

export default function AccessManagementPage() {
  return (
    <SectionPage
      eyebrow="Administration"
      wide
      title="Access management"
      description="Configure roles, preview effective permissions, and manage global or FIR-scoped assignments."
    >
      <AuthorizationManager />
    </SectionPage>
  );
}
