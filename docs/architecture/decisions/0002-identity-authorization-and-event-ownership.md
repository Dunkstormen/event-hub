# ADR 0002: Identity, authorization, and event ownership

- Status: Accepted for MVP
- Date: 2026-07-24

## Context

Event Hub serves one vACC with multiple FIRs. A user can belong to multiple
FIRs, event-management authority is FIR-scoped, and controller eligibility
comes from external systems with an administrative fallback. Joint events need
collaboration without weakening ownership.

## Decision

### Identity and role model

- VATSIM Connect authenticates the user and supplies the CID used as the stable
  external identity.
- `Pilot` is the default authenticated role and is global.
- Published public event content is also readable without authentication.
- `Controller` capability is derived automatically from normalized Control
  Center and VATEUD data when available.
- Administrators can add or revoke controller/FIR membership manually when
  integrations are unavailable or incorrect. Manual actions require a reason
  and an audit record.
- `Event Coordinator` is a configurable role with FIR scope. Multiple users can
  coordinate one FIR, and one user can receive coordinator scope for multiple
  FIRs.
- `Administrator` is global. Administrators manage a role-permission matrix,
  but the application must protect its bootstrap path and prevent accidental
  removal of the last effective administrator.

Permissions are checked as explicit capabilities, not hard-coded role-name
comparisons. Role names provide defaults and a usable administrative model;
capabilities remain the enforcement unit.

### Eligibility sources

VATSIM Connect proves identity. It does not by itself prove controller
eligibility.

Control Center and VATEUD are adapted into one internal eligibility result that
can contain FIR memberships, rating, endorsements, known positions, source,
freshness, and denial reasons. A provider failure or stale response cannot
silently grant access. Eligibility is rechecked when a controller:

- expresses interest;
- books a predefined slot; or
- is assigned by a coordinator.

An authorized coordinator override requires a reason and is audited.

### Event ownership and invited FIRs

Every event series has exactly one owning FIR at a time. Only coordinators from
that FIR may initiate an explicit ownership transfer. A transfer must be
transactional and audited so the event never has zero or multiple owners.
Inviting a participating FIR grants all Event Coordinators in that FIR the MVP
collaboration capabilities. No acceptance step is required in the MVP.

| Capability | Owning FIR coordinator | Invited FIR coordinator | Other FIR coordinator |
| --- | ---: | ---: | ---: |
| View a manageable draft | Yes | Yes | No |
| Edit event content | Yes | Yes | No |
| Manage permitted occurrence overrides | Yes | Yes | No |
| Manage resources and routings | Yes | Yes | No |
| Configure and manage rosters | Yes | Yes | No |
| Add or remove participating FIRs | Yes | No | No |
| Transfer ownership to another FIR | Yes | No | No |
| Cancel or delete the series | Yes | No | No |

Removing a participating FIR revokes its collaboration access immediately.
Historical audit records and actions remain attributable.

## Consequences

- Authorization must evaluate global permissions, FIR scope, event ownership,
  and event collaboration separately.
- The API must not trust FIR or role claims supplied by the browser.
- Inviting a FIR is a security-sensitive write and must be audited.
- Ownership transfer is a separate owner-only action and must be audited.
- External eligibility data needs freshness and provenance.
- The role matrix needs protected administrator semantics.

## Follow-up work

- Issues #9-#17 implement identity, integrations, authorization, invited-FIR
  policies, and auditing.
- Issue #22 implements the owner-only participating-FIR workflow.
- Issue #35 centralizes controller eligibility decisions for rostering.
