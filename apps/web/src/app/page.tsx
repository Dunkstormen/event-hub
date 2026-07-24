import { PROJECT_DESCRIPTION, PROJECT_NAME } from "@event-hub/config/project";

export default function HomePage() {
  return (
    <section className="page-shell flex flex-1 items-center py-20 sm:py-28">
      <div className="max-w-3xl">
        <h1 className="text-5xl leading-[0.96] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
          {PROJECT_NAME}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl">
          {PROJECT_DESCRIPTION}
        </p>
        <div className="mt-10 h-px w-24 bg-primary" aria-hidden="true" />
      </div>
    </section>
  );
}
