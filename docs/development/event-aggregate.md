# Event aggregate invariants

The event series is the ownership, content, lifecycle, and scheduling root for
event-management work. API routes must use the event aggregate service rather
than updating ownership or cancellation columns directly.

## Ownership and participation

- `events.owner_fir_id` is required, so an event has exactly one current owner.
- Draft creation adds the owner to `event_firs` in the same serializable
  transaction.
- Ownership transfer requires the current owner's `events.manage` capability.
- The target must be an active row in `event_firs` before transfer.
- Transfer updates only `owner_fir_id`; it never removes the former owner's
  participation row.
- The transfer and its audit record commit in one serializable transaction.

Participating airports use their canonical `Airport` relation. Event code must
not infer an airport's FIR from an ICAO prefix.

## Management API

Authenticated event coordinators use these contract-validated routes:

- `POST /v1/firs/{firIcaoCode}/events` creates a draft whose owner is the
  authorized FIR in the route, never an owner supplied in the request body.
- `GET /v1/events/manageable` lists events visible through the coordinator's
  owning or participating FIR grants.
- `GET /v1/events/{eventId}` returns a manageable event with the caller's
  owner or collaborator role and allowed operations.
- `PATCH /v1/events/{eventId}` edits draft content for an owning or invited
  FIR coordinator.
- `POST /v1/events/{eventId}/ownership-transfer` transfers ownership from the
  current owner to an existing active participant.
- `DELETE /v1/events/{eventId}` permanently deletes a draft for its current
  owner. Non-draft lifecycle deletion remains governed by issue #23.

Every update, transfer, and deletion supplies `expectedVersion`. The API
increments `events.version` on successful writes and returns `409 CONFLICT`
when the persisted version has moved, preventing a stale editor from silently
overwriting another coordinator's change. Management responses use
`Cache-Control: no-store`.

## Lifecycle and cancellation

MySQL enums constrain event lifecycle and rostering values. The initial
rostering modes are open interest and predefined slots. A database check
requires every cancelled event to retain a non-empty public cancellation
reason. The aggregate's cancellation primitive additionally requires the
actor to manage the current owning FIR and the event to be published.

Issue #23 remains responsible for publish readiness, idempotent transitions,
automatic archival, and the complete state-transition policy.

## Local civil schedules

`local_start` and `local_end` are canonical `YYYY-MM-DDTHH:mm:ss` strings. They
are deliberately not UTC timestamps: together with `time_zone`, they preserve
the creator's intended local clock values across future recurrence generation.

Before persistence, the schedule validator:

1. validates both calendar values and the selected IANA timezone;
2. rejects daylight-saving gaps and overlaps instead of guessing an instant;
3. derives both instants and requires the end to follow the start; and
4. stores the canonical local values and timezone, not the derived instants.

Occurrence generation may derive UTC instants from these values, but it must
continue treating the local civil schedule as the source of truth.

## Banner boundary

`banner_storage_key` is nullable until the upload workflow is implemented. It
holds only an opaque storage key and must never contain an absolute path or a
user-supplied filename. Issue #31 owns file metadata, validation, and storage
lifecycle behavior.
