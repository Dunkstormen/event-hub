# Controller eligibility synchronization

Event Hub normalizes controller evidence from Control Center and VATEUD without
exposing either provider's payload shape to the rest of the application. The
provider adapters produce the same domain batch: CID, display name, roster
state, rating, endorsements, known positions, explicit FIR relations, source,
and fetch time.

## Provider boundaries and precedence

Control Center is authoritative for automatic FIR membership. Its named active
areas map only through this explicit relation:

| Control Center area | FIR |
| --- | --- |
| Denmark | EKDK |
| Finland | EFIN |
| Iceland | BIRD |
| Norway | ENOR |
| Sweden | ESAA |

The controller must also be marked active by Control Center. An area flag on an
inactive controller does not grant membership. Unknown areas are ignored by the
adapter, and an explicit mapped FIR that is not configured in Event Hub fails
the complete batch.

VATEUD contributes vACC roster, rating, solo, Tier 1, and Tier 2 evidence. Its
vACC-level roster is never expanded into all five FIRs. Airport or position
prefixes are not used to infer FIR membership.

Manual FIR membership is an administrator decision. Provider synchronization
never updates, revokes, or replaces a `MANUAL` row. Assigning or revoking a
manual row requires a reason and creates the authorization audit record
described in [authorization.md](authorization.md).

## Complete batches and fail-closed behavior

Each enabled adapter fetches a complete provider batch. The HTTP client retries
transient network, HTTP 429, and HTTP 5xx failures. Authentication failures,
unexpected response shapes, and invalid records fail the batch.

A successful batch is committed in one serializable transaction:

- users and provider display identities are upserted by VATSIM CID;
- the provider's ratings, endorsements, and known positions are replaced;
- Control Center automatic FIR memberships are activated or revoked;
- the provider state and immutable sync-run result are recorded.

Repeated batches are idempotent. A provider failure records the error,
consecutive-failure count, and exponential retry time but leaves the last
successful snapshots, endorsements, positions, and memberships unchanged.
This prevents a partial or malformed response from appearing to remove every
controller.

Evidence is usable only until its `freshUntil` value. The default sync interval
is one hour and the default freshness window is two hours. A failed provider
is retried from five minutes with exponential backoff capped at six hours. The
runtime scheduler resumes the normal interval after a successful retry.

## Administration API and interface

Every administration endpoint requires an active global assignment granting
`fir-memberships.manage`.

| Method and path | Purpose |
| --- | --- |
| `GET /v1/admin/controller-eligibility` | Provider configuration, freshness, failures, retry time, and the latest 20 runs |
| `POST /v1/admin/controller-eligibility/{provider}/sync` | Run one configured provider immediately |

The **Provider sync** tab at `/administration/memberships` shows disabled,
fresh, failed, and stale state using text and badges, exposes the provider's
last error, and provides the on-demand action. Automatic membership records
also show their own evidence deadline.

## Configuration

Leaving a provider API key and base URL empty disables that provider. VATEUD
uses `https://core.vateud.net/api` when its key is set without a base URL.
Control Center requires both values because deployments may use different
hosts. URLs must be credential-free HTTPS origins or path prefixes.

See the [local setup environment table](local-setup.md#environment-variables)
for every variable and the secrets-free defaults in `.env.example`.

Provider references:

- [Control Center API](https://docs.vatsca.org/controlcenter/dev/api/)
- [Control Center VATEUD integration](https://docs.vatsca.org/controlcenter/latest/integrations/vateud/)
- [VATEUD Core API](https://api-core.vateud.net/)
