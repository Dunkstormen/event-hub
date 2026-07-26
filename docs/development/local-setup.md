# Local developer setup

This guide starts the current Event Hub web application, API, development
database, and isolated test database without relying on undocumented machine
state. Run commands from the repository root unless a section says otherwise.

## Prerequisites

- Git.
- Node.js 24. The repository's `.nvmrc` selects major version 24 and the pnpm
  workspace pins Node.js 24.18.0 for managed runtimes.
- pnpm 11. The repository currently declares pnpm 11.15.1.
- Docker Desktop or another Docker Engine with Docker Compose v2.

Enable Docker Desktop's WSL 2 integration if commands run inside WSL. On
Windows, confirm that `docker.exe compose version` works in PowerShell or
Command Prompt. On Unix-like systems, confirm that `docker compose version`
works.

Use Corepack to activate the repository's pnpm version when pnpm is not already
available:

```bash
corepack enable
corepack prepare pnpm@11.15.1 --activate
```

## First-time setup

1. Create a local environment file from the secrets-free example.

   Unix, macOS, Git Bash, or WSL:

   ```bash
   cp .env.example .env
   ```

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Command Prompt:

   ```bat
   copy .env.example .env
   ```

2. Install the locked dependencies and generate the Prisma client.

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Create or validate the local upload directory.

   ```bash
   pnpm storage:prepare
   ```

   The command defaults to `var/uploads`, rejects filesystem and repository
   roots, rejects symbolic links, and refuses any path below
   `apps/web/public`. Uploads must eventually be served through the authorized
   API defined by ADR 0004, not as public Next.js assets.

4. Start MySQL and wait for both database health checks.

   ```bash
   pnpm db:up
   ```

5. Apply the committed migrations and seed canonical reference data.

   ```bash
   pnpm db:migrate:deploy
   pnpm db:seed
   pnpm db:test:migrate
   ```

   The seed is idempotent. It upserts the VATSIM Scandinavia vACC, the five
   initial FIR scopes, and their initial airports without deleting referenced
   records.

## Start the applications

Run the web application and API in separate terminals:

```bash
pnpm dev:web
```

```bash
pnpm dev:api
```

The services are available at:

| Service | Default address | Check |
| --- | --- | --- |
| Web | <http://localhost:3000> | Open the page in a browser |
| API | <http://localhost:4000> | `GET /v1/health` |
| Development MySQL | `127.0.0.1:3306` | Docker health check |
| Test MySQL | `127.0.0.1:3307` | Docker health check |

The API loads the repository-root `.env` file during local startup. Restart it
after changing configuration.

## Environment variables

`.env.example` is the complete local configuration template. It contains only
development defaults and empty secret placeholders. Never commit `.env`.

| Variable | Required | Purpose and local behavior |
| --- | --- | --- |
| `NODE_ENV` | Production | Runtime security mode. `pnpm dev:api` forces `development`; deployed API processes must set `production`. Only explicit `development` or `test` values permit an insecure localhost session cookie; other or missing values fail secure. |
| `API_HOST` | No | API listen address. Defaults to `0.0.0.0`. |
| `API_PORT` | No | API TCP port. Defaults to `4000`; values must be between 1 and 65535. |
| `NEXT_PUBLIC_API_BASE_URL` | Web sign-in | Public API origin used by the VATSIM sign-in link. The local default is `http://localhost:4000`. |
| `SESSION_TTL_SECONDS` | No | Absolute server-side session lifetime. Defaults to 28,800 seconds (8 hours); values must be between 300 seconds and 604,800 seconds. |
| `BOOTSTRAP_ADMIN_CID` | Initial authorization seed | Optional VATSIM CID to provision as the first global Administrator. It must contain 1–16 digits. Remove it after another tested administrator path exists, or keep the same value for idempotent recovery. |
| `DATABASE_URL` | API and seed | Development MySQL URL. The example targets `event_hub` on port 3306. |
| `SHADOW_DATABASE_URL` | Prisma development migrations | Dedicated Prisma shadow database. The local Prisma config has the same Compose-backed fallback. |
| `TEST_DATABASE_URL` | Test database commands | Isolated MySQL URL. The database name must end in `_test`; test commands never fall back to `DATABASE_URL`. |
| `UPLOAD_ROOT` | Storage preparation | Local persistent upload directory. Relative paths resolve from the repository root. Issue #31 will connect the storage adapter to this path. |
| `VATSIM_CONNECT_BASE_URL` | VATSIM authentication | OAuth server base URL. Use `https://auth-dev.vatsim.net` locally. HTTPS is required. |
| `VATSIM_CONNECT_CLIENT_ID` | VATSIM authentication | Sandbox OAuth client identifier. Leaving all client values empty disables the integration. |
| `VATSIM_CONNECT_CLIENT_SECRET` | VATSIM authentication | Sandbox OAuth client secret. It belongs only in `.env`; never place a real value in `.env.example`. |
| `VATSIM_CONNECT_REDIRECT_URI` | VATSIM authentication | Exact callback URI registered with the OAuth client. Local default: `http://localhost:4000/v1/auth/vatsim/callback`. |
| `VATSIM_CONNECT_SUCCESS_REDIRECT_URI` | VATSIM authentication | Trusted web URI used after a successful callback. Local default: `http://localhost:3000`; production requires HTTPS. |

Production and shared environments must provide managed database, OAuth, and
session secrets rather than reusing the local values.

Before opening administrator features in a new environment, run migrations,
set `BOOTSTRAP_ADMIN_CID` to the intended administrator's VATSIM CID, and run
`pnpm db:seed`. See [authorization.md](authorization.md) before rotating or
removing that bootstrap value.

Session cookies use local HTTP-compatible settings during development and
`Secure` `__Host-` defaults in production. See
[identity-and-sessions.md](identity-and-sessions.md) for the lifecycle and
deployment requirements.

## VATSIM Connect sandbox credentials

VATSIM provides a sandbox at <https://auth-dev.vatsim.net> that is independent
from production and contains test accounts only. Follow the
[official sandbox guide](https://vatsim.dev/services/connect/sandbox/) to sign
in with a listed test account, open **Manage OAuth organizations**, select the
**VATSIM Connect Demo** organization, and create an OAuth client.

Store the issued client ID and secret only in `.env`. The registered redirect
URI and the `VATSIM_CONNECT_REDIRECT_URI` value must match exactly. The current
application starts the authorization-code flow at
`GET /v1/auth/vatsim`. The callback is
`GET /v1/auth/vatsim/callback`. Automated tests use an injected provider
adapter and never require real sandbox credentials.

## Database and data lifecycle

- `pnpm db:down` stops the database containers without deleting the persistent
  development volume.
- `pnpm db:test:reset` resets only the guarded `_test` database. It refuses to
  run against the development database.
- Do not use `prisma db push` for schema changes. Create reviewed migrations
  with `pnpm db:migrate:dev -- --name describe_the_change`.
- See [database.md](database.md) for migration, shadow-database, and test
  isolation details.
- See [reference-data.md](reference-data.md) for the FIR and airport seed
  update policy.

## Windows and Unix notes

- Run ordinary commands as `pnpm ...`. If Git Bash or WSL resolves the Windows
  pnpm shim but cannot find Node.js, use `pnpm.cmd` from PowerShell/Command
  Prompt or fix that shell's Node.js path.
- Docker Desktop may expose `docker.exe` to Windows before `docker` is
  available inside WSL. Enable WSL integration or run the Compose commands from
  PowerShell.
- Use forward slashes for a repository-relative `UPLOAD_ROOT`. Absolute Windows
  paths are also accepted when the command runs under Windows Node.js.
- Keep the repository out of directories synchronized by tools that rewrite
  line endings or file permissions unexpectedly.

## Troubleshooting

### Docker or MySQL is unavailable

```bash
docker compose ps
docker compose logs mysql mysql-test
```

If WSL reports that `docker` is missing while Docker Desktop is installed,
enable Docker Desktop's WSL integration or run `docker.exe compose ...`.
Ports 3306 and 3307 must be free.

### Prisma cannot reach MySQL

Wait until `pnpm db:up` reports healthy containers. Confirm `.env` matches
`.env.example`, then run:

```bash
pnpm db:migrate:deploy
```

### The API exits with `DATABASE_URL is required`

Confirm `.env` exists at the repository root, not inside `apps/api`, and restart
`pnpm dev:api`.

### A port is already in use

The defaults are 3000 for Next.js, 4000 for the API, and 3306/3307 for MySQL.
Stop the existing process or set another `API_PORT`. Keep the Docker port
mapping and database URLs aligned if MySQL ports change.

### The upload directory is rejected

Use a dedicated directory such as `./var/uploads`. Do not use the filesystem
root, repository root, a symbolic link, or any path below `apps/web/public`.

## Repository checks

Run the same local quality gates expected in CI:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:test:migrate
pnpm test:integration
pnpm build
```

The ordinary test command is database-free. The integration command uses only
the guarded `TEST_DATABASE_URL`; see [testing.md](testing.md) for the suite
boundaries and CI behavior.
