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
| Automated tests | `127.0.0.1:3307` | `event_hub_test` |

Development data uses a persistent Docker volume. Test data uses an ephemeral
in-memory filesystem and is discarded when its container is recreated.

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

The foundation seed upserts the single VATSIM Scandinavia vACC. Idempotent FIR
and airport reference records are introduced by issue #5. Seed implementations
must use upsert or another repeatable operation so running the command more than
once produces the same state.

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
