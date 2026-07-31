# Application audit logging

Event Hub stores security-sensitive history in the append-only
`audit_records` table. Existing authorization history was renamed in place;
the migration does not discard or recreate those records.

## Write boundary

Domain services call `appendAuditRecord` inside the same database transaction
as the change being recorded. A record contains:

- the internal actor relation and the actor's CID/display name at read time;
- a stable dotted action such as `authorization.role.updated`;
- a target kind and stable target key;
- a short human-readable summary;
- the database timestamp; and
- JSON before/after snapshots when they add useful evidence.

The application audit module exposes append and list operations only. It has no
update or delete method, and `/v1/admin/audit` has no write routes. Database
owners can still perform recovery and test-fixture cleanup, so this is an
application immutability boundary rather than write-once storage.

Failed and rolled-back transactions do not leave an audit record. Idempotent
no-op requests should not append misleading history.

## Sensitive-data rule

Snapshots contain minimal domain state, never request bodies or raw provider
payloads. The writer recursively rejects credential-bearing keys including
tokens, secrets, passwords, cookies, authorization headers, API keys, private
keys, and session identifiers. Summaries and target keys must likewise be
constructed from explicit safe domain values.

OAuth codes, access/refresh tokens, session tokens, cookie values, provider
credentials, and uploaded private content must never be placed in audit rows.

## Administrator viewer

`GET /v1/admin/audit` requires the protected `system.administrator`
capability. It supports opaque cursor pagination and filters for free text,
actor CID, exact action, target kind, and UTC date range. The response includes
the complete before/after snapshots. The web viewer is available at
`/administration/audit` and uses a details sheet so large snapshots do not
overload the record list.

Contextual authorization and FIR-membership screens retain their latest-record
summaries. The general administrator viewer is the source for cross-domain
inspection and older paginated history.

## Adding a critical mutation

Event lifecycle changes, ownership/invited-FIR changes, eligibility overrides,
roster assignments, and settings changes must adopt the writer when their
domain services are implemented:

1. Load and validate the actor and current target state.
2. Apply the mutation in a transaction.
3. Append a safe record in that same transaction.
4. Add an integration test that checks the action, actor, target, and relevant
   before/after state.
5. Add an idempotency or rollback assertion when the operation can be retried.

Do not add domain-specific audit tables or call the writer after committing the
business mutation.
