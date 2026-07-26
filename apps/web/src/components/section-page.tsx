import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionPageProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
  eyebrow?: string;
  wide?: boolean;
}>;

export function SectionPage({
  title,
  description,
  children,
  eyebrow,
  wide = false,
}: SectionPageProps) {
  return (
    <section className="page-shell flex flex-1 flex-col py-14 sm:py-20">
      <div className="max-w-2xl">
        {eyebrow === undefined ? null : (
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      <div className={cn("mt-10", wide ? "w-full" : "max-w-3xl")}>
        {children}
      </div>
    </section>
  );
}
