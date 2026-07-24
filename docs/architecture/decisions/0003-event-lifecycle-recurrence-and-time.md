# ADR 0003: Event lifecycle, recurrence, and time

- Status: Accepted for MVP
- Date: 2026-07-24

## Context

Recurring events must remain at the intended local time when daylight-saving
rules change. Event Coordinators also need per-occurrence flexibility without
turning each occurrence into an unrelated copy of the series.

## Decision

### Schedule

An event series stores:

- a local start date and time;
- a local end date and time;
- an IANA timezone selected by the creator; and
- an optional finite recurrence rule.

The application derives UTC instants for each occurrence using the selected
timezone. The local civil time is the scheduling source of truth, so a recurring
event remains at the intended local clock time across DST transitions.

The MVP supports:

- non-recurring;
- weekly;
- every two weeks; and
- monthly recurrence.

A recurring series must end by an occurrence count or an end date. Generation
must be deterministic and idempotent.

### Lifecycle

| State | Public visibility | Coordinator behavior |
| --- | --- | --- |
| Draft | Hidden | Owning and invited FIR coordinators can work within their permissions. |
| Published | Public | Editable only through allowed, audited workflows. |
| Cancelled | A previously published event remains publicly discoverable with a prominent cancellation notice and required reason until it archives. | Owning FIR controls series cancellation; occurrence cancellation follows the override policy. Rostering and active-event actions are closed. |
| Archived | Hidden from public discovery | Visible to authorized coordinators for history and locked against further edits. |

A single non-recurring event archives after its scheduled end, including when
it was cancelled. A recurring series archives after the scheduled end of its
final occurrence. Cancellation does not accelerate archival because the public
cancellation notice must remain available through the time pilots would have
expected the event to occur. Archival is automatic and idempotent.

Hard deletion is restricted to workflows that do not erase published history
improperly. The exact draft deletion and retention rules are an open decision.

### Occurrence inheritance and overrides

An occurrence inherits all series values unless an allowed override exists.

| Field | Occurrence override in MVP |
| --- | ---: |
| Start date/time | No |
| End date/time | No |
| Timezone | No |
| Owning FIR | No |
| Participating FIR collaboration | No |
| Cancellation/skip state | Yes |
| Participating airports | Yes |
| Resources | Yes |
| Mandatory routings | Yes |
| Roster configuration and assignments | Yes |

An occurrence cancellation does not cancel the series and requires a public
reason. Cancelled occurrences remain visible in the public series schedule and
discovery with their cancelled state and reason. They cannot accept roster
activity, are not eligible to be featured, and do not receive ordinary
pre-event reminders.

## Consequences

- Local schedule data and timezone must not be replaced by only UTC columns.
- Time calculations require a timezone-aware library and DST boundary tests.
- Occurrence APIs must enforce a field allowlist rather than accept arbitrary
  partial event records.
- Series edits need a defined effect on already materialized future
  occurrences.
- Roster and reminder jobs operate on occurrences, not only the series record.
- Public contracts need cancellation status and reason fields.

## Follow-up work

- Issues #18, #23, #29, and #30 implement the model, lifecycle, recurrence, and
  override rules.
- Issue #44 implements reliable archival and reminder scheduling.
- Issue #46 covers DST and forbidden-time-override end-to-end behavior.
