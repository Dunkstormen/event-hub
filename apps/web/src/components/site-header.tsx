"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, UserRoundIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/events", label: "Events" },
  { href: "/assignments", label: "My assignments" },
  { href: "/workspace", label: "Workspace" },
  { href: "/administration/access", label: "Administration" },
] as const;

function isCurrentRoute(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === "/events" && pathname === "/") ||
    pathname.startsWith(`${href}/`)
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur-xl supports-[backdrop-filter]:bg-background/78">
      <div className="page-shell flex h-20 items-center gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 rounded-lg font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Event Hub home"
        >
          <BrandMark priority className="w-[5.4rem]" />
          <span
            className="h-8 w-px bg-border"
            aria-hidden="true"
          />
          <span className="text-lg sm:text-xl">Event Hub</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden h-full lg:block">
          <ul className="flex h-full items-center gap-1">
            {navigation.map((item) => {
              const active = isCurrentRoute(pathname, item.href);

              return (
                <li key={item.href} className="h-full">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-full items-center px-4 text-base font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                      active &&
                        "text-foreground after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-primary",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto hidden lg:block">
          <Link
            href="/sign-in"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            <UserRoundIcon data-icon="inline-start" />
            Sign in
          </Link>
        </div>

        <div className="ml-auto lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Open navigation"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent className="w-[min(22rem,90vw)]">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>
                  Move between Event Hub areas.
                </SheetDescription>
              </SheetHeader>
              <Separator />
              <nav aria-label="Mobile navigation" className="px-3">
                <ul className="flex flex-col gap-1">
                  {navigation.map((item) => {
                    const active = isCurrentRoute(pathname, item.href);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            active && "bg-accent text-accent-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="mt-auto flex flex-col gap-4 p-4">
                <Separator />
                <Link
                  href="/sign-in"
                  onClick={() => setMenuOpen(false)}
                  className={buttonVariants({
                    className: "w-full",
                    size: "lg",
                    variant: "outline",
                  })}
                >
                  <UserRoundIcon data-icon="inline-start" />
                  Sign in
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
