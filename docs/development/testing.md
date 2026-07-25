# Testing and continuous integration

The repository separates fast, database-free checks from API integration tests
that use the dedicated test database. This keeps the ordinary development loop
quick while still exercising the API, repository, Prisma client, migrations,
and MySQL together before changes merge.

## Test suites

Run the unit, contract, API route, and web component suites:

```bash
pnpm test
```

These suites do not require Docker. API route tests inject repository doubles,
contract tests validate the public schemas, and web component tests run in
JSDOM with React Testing Library.

Run the database-backed API integration suite:

```bash
pnpm db:up
pnpm db:test:migrate
pnpm test:integration
```

The integration suite requires `TEST_DATABASE_URL`. The database name must end
in `_test`; the guard never falls back to `DATABASE_URL`. Before the suite
runs, it clears and seeds only the reference-data tables in that isolated
database. It cleans them again after the suite completes.

Use `pnpm db:test:reset` when the test schema needs a clean migration replay.
The reset command has the same `_test` database guard.

## Local quality gate

Run the complete gate from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:test:migrate
pnpm test:integration
pnpm build
```

The formatting check rejects trailing whitespace and missing final newlines in
the repository's source, configuration, schema, migration, and documentation
files without rewriting them.

## Continuous integration

The `CI / Quality` job runs for every pull request and every push to `main`.
It installs the lockfile with the pinned Node.js and pnpm versions, starts a
disposable MySQL service, and runs the complete quality gate above. Any
formatting, lint, type, test, migration, integration, or production-build error
fails the job.

Configure `CI / Quality` as a required branch-protection check on `main` so a
pull request cannot merge while the gate is failing.
