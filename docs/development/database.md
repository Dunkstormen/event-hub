# Local MySQL and migration workflow

Event Hub uses MySQL 8.4 with Prisma ORM. The Prisma schema, migrations,
generated-client configuration, and seed command live in `packages/database`.
Only server-side applications may depend on this package; the web application
accesses persisted data through the versioned API.

## Local databases

Copy `.env.example` to `.env`, then start the development and isolated test
databases:

```bash
pnpm db:up
```

The Compose stack provides:

| Purpose | Address | Database |
| --- | --- | --- |
| Development | `127.0.0.1:3306` | `event_hub` |
| Prisma shadow | `127.0.0.1:3306` | `event_hub_shadow` |
| Automated tests | `127.0.0.1:3307` | `event_hub_test` |

Development data uses a persistent Docker volume. Test data uses an ephemeral
in-memory filesystem and is discarded when its container is recreated.
The Compose initialization script grants the application user access to the
dedicated shadow database only; it does not grant database-creation privileges.

Stop both containers without deleting the development volume:

```bash
pnpm db:down
```

The credentials in `.env.example` and `compose.yaml` are local-development
defaults only. Production and shared environments must supply managed secrets.

## Prisma Client

Generate the client after changing the Prisma schema or pulling schema changes:

```bash
pnpm db:generate
```

The generated client is ignored by Git and recreated during database-package
builds and type checks.

## Creating migrations

Change `packages/database/prisma/schema.prisma`, then create and apply a
development migration:

```bash
pnpm db:migrate:dev -- --name describe_the_change
```

Review both the Prisma schema and generated SQL before committing them. Do not
use `prisma db push` for application schema changes because it does not create
the reviewed migration history required by Event Hub.

Apply already committed migrations in production or another non-development
environment with:

```bash
pnpm db:migrate:deploy
```

Deploy migrations before starting application code that depends on them.

## Seeding

Prisma 7 runs seeds only when explicitly requested:

```bash
pnpm db:seed
```

The seed upserts the single VATSIM Scandinavia vACC plus the initial FIR and
airport reference records. It never removes reference records, so running it
more than once produces the same state without breaking existing relations.
See [reference-data.md](reference-data.md) for the seed scope and update policy.

## Test isolation

Test database operations require `TEST_DATABASE_URL`. They never fall back to
`DATABASE_URL`, and the database name must end in `_test`.

```bash
pnpm db:test:migrate
pnpm db:test:reset
```

`db:test:reset` is destructive, but its guard rejects the development database
before invoking Prisma. Application integration tests must use the same guarded
test URL rather than creating a client from `DATABASE_URL`.
