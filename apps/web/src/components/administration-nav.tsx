"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRoundIcon, MapPinnedIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const administrationNavigation = [
  {
    href: "/administration/access",
    label: "Access management",
    icon: KeyRoundIcon,
  },
  {
    href: "/administration/memberships",
    label: "FIR memberships",
    icon: MapPinnedIcon,
  },
] as const;

export function AdministrationNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Administration sections"
      className="mb-5 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-foreground/10"
    >
      <ul className="grid grid-cols-2 gap-1 sm:flex sm:min-w-max">
        {administrationNavigation.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3 sm:text-sm",
                  active && "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
