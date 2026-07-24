import { PROJECT_DESCRIPTION, PROJECT_NAME } from "@event-hub/config/project";

export default function HomePage() {
  return (
    <main>
      <section className="foundation-card" aria-labelledby="page-title">
        <p className="eyebrow">Foundation in progress</p>
        <h1 id="page-title">{PROJECT_NAME}</h1>
        <p className="summary">{PROJECT_DESCRIPTION}</p>
      </section>
    </main>
  );
}
