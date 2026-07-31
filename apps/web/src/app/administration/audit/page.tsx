import type { Metadata } from "next";

import { AdministrationNav } from "@/components/administration-nav";
import { SectionPage } from "@/components/section-page";
import { AuditLogManager } from "@/features/audit/audit-log-manager";

export const metadata: Metadata = {
  title: "Audit log",
};

export default function AuditLogPage() {
  return (
    <SectionPage
      eyebrow="Administration"
      wide
      title="Audit log"
      description="Inspect the immutable history of security-sensitive changes across Event Hub."
    >
      <AdministrationNav />
      <AuditLogManager />
    </SectionPage>
  );
}
