# ADR 0001: Application and API boundaries

- Status: Accepted for MVP
- Date: 2026-07-24

## Context

Event Hub needs a responsive React experience, public event pages that produce
useful metadata, and a backend that can also serve future consumers. Direct
web-to-database access would couple presentation code to persistence and make a
public API an afterthought.

## Decision

Use a pnpm monorepo with:

- a Next.js/React web application in `apps/web`;
- a separate Fastify REST API in `apps/api`;
- shared, versioned runtime contracts in `packages/contracts`;
- Prisma and MySQL behind server-only database code;
- a background process introduced when durable scheduled work is implemented.

The API is the only business and persistence boundary used by the web
application. Public event pages are server-rendered where that improves
discoverability and previews; authenticated management remains highly
interactive and SPA-like.

The initial API namespace is `/v1`. Request, response, pagination, and error
contracts are shared between web and API without sharing database records.

## Consequences

- The web and API can evolve and deploy separately.
- API serialization must be explicit and tested.
- Authentication must bridge browser sessions and the API securely.
- Features require contract work rather than importing server code into the
  web app.
- A little duplication between transport types and persistence records is
  intentional.

## Follow-up work

- Issue #2 scaffolds the monorepo.
- Issue #3 selects the runtime schema tooling and defines `/v1` conventions.
- Issue #4 establishes the Prisma/MySQL workflow.
- Issue #8 establishes cross-package CI and tests.
