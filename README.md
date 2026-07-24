# Event Hub

Event Hub is an event-management platform for VATSIM Scandinavia. Its purpose is
to reduce the administrative work involved in planning, publishing, staffing,
and supporting events so the event departments can spend more time on the
events themselves.

The first release targets:

- Event Coordinators planning and managing events for their FIRs.
- Controllers expressing interest in, booking, and reviewing assignments.
- Pilots discovering events and consuming briefings, routings, and resources.
- Administrators managing access and system-wide settings.

## Project documentation

- [MVP architecture](docs/architecture/README.md)
- [System context and package boundaries](docs/architecture/system-context.md)
- [MVP scope](docs/product/mvp-scope.md)
- [Architecture decision records](docs/architecture/decisions/)
- [API v1 conventions](docs/api/v1-conventions.md)
- [Local MySQL and migration workflow](docs/development/database.md)
- [Delivery board](https://github.com/users/Dunkstormen/projects/2/views/2)

## Workspace

The pnpm workspace keeps the independently deployable applications separate
from their shared contracts and tooling:

- `apps/web` — Next.js web application.
- `apps/api` — Fastify public API.
- `packages/contracts` — shared versioned API contracts.
- `packages/config` — shared project and runtime defaults.
- `packages/database` — Prisma schema, migrations, client, and seed workflow.
- `packages/typescript-config` — shared TypeScript compiler settings.

Install Node.js 24 and pnpm 11, then run:

```bash
pnpm install
pnpm dev:web
pnpm dev:api
```

The web app defaults to <http://localhost:3000>. The API defaults to
<http://localhost:4000>, with its health check at `/v1/health`. Use `API_HOST` and
`API_PORT` to override the API listener.

Run all repository checks from the workspace root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
