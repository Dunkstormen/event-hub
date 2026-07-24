import type { ReactNode } from "react";

type SectionPageProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
}>;

export function SectionPage({
  title,
  description,
  children,
}: SectionPageProps) {
  return (
    <section className="page-shell flex flex-1 flex-col py-14 sm:py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      <div className="mt-10 max-w-3xl">{children}</div>
    </section>
  );
}
