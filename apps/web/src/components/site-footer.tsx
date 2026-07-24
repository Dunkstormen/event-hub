import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="page-shell flex min-h-24 items-center py-6 text-sm text-muted-foreground">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandMark className="w-16 opacity-80" />
          <span className="h-6 w-px bg-border" aria-hidden="true" />
          Event Hub
        </Link>
      </div>
    </footer>
  );
}
