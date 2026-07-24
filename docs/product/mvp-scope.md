# MVP scope

## Product outcome

The MVP succeeds when a VATSIM Scandinavia Event Coordinator can create,
collaborate on, publish, staff, and complete an event through Event Hub, while
controllers can participate and pilots can reliably discover the published
information.

## Included

### Foundation

- pnpm monorepo with separate Next.js web and Fastify API applications.
- Versioned API contracts shared by web and API.
- Prisma with MySQL, migrations, seeds, and isolated tests.
- Dark-first Tailwind CSS and shadcn/ui design foundation.
- CI for formatting, linting, typechecking, tests, and production builds.

### Identity and authorization

- VATSIM Connect authentication by CID.
- Global Administrator and Pilot roles.
- FIR-scoped Event Coordinator capabilities.
- Controller eligibility derived from Control Center and VATEUD where
  available, with audited manual membership and eligibility overrides.
- Administrator-managed role-permission matrix with lockout protection.
- Owning-FIR and invited-FIR collaboration policies.
- Audit history for security-sensitive and operational changes.

### Event management

- Draft creation through a multi-step flow.
- Exactly one owning FIR at a time, with owner-only transfer and
  owner-controlled participating-FIR invitations.
- Participating airports, descriptions, banners, briefings, resources, and
  mandatory routings.
- Publish, cancel, automatic archive, and safe deletion behavior.
- Weekly, bi-weekly, and monthly finite recurrence.
- Creator-selected IANA timezone with local-time recurrence across DST.
- Per-occurrence cancellation and allowed content/roster overrides, but no
  occurrence time overrides.

### Public experience

- Public homepage with featured and upcoming events.
- Event search by name, FIR ICAO code, and participating-airport ICAO code.
- Chronological event cards loaded in batches of at most 12.
- Event detail tabs for Description, Briefing, Roster, and Mandatory routings.
- Server-rendered metadata, responsive behavior, and accessibility coverage.
- Versioned public read API.

### Rostering

- Site defaults and event-specific booking/interest windows.
- Open-interest position preferences, availability, coordinator assignment,
  conflict detection, and audited overrides.
- Predefined sections and slots with atomic first-come-first-served booking and
  release.
- Eligibility checks when expressing interest, booking, and assigning.
- My Assignments view and audience-appropriate event roster details.

### Integrations and operations

- Control Center and VATEUD eligibility adapters.
- Discord publish notifications and pre-event reminders.
- Reliable background synchronization, reminders, cleanup, and archival.
- Administrator system settings.
- Local persistent file storage.
- Health checks, structured logs, critical end-to-end tests, security review,
  backup/restore procedures, and deployment documentation.

## Deferred until after MVP

- Publishing or synchronizing events to VATEUD.
- Displaying ECFMP restrictions.
- Joint event ownership or multiple owning FIRs.
- An invitation acceptance workflow for participating FIRs.
- Waitlists, controller-to-controller slot trading, and booking transfers.
- Per-occurrence start, end, or timezone overrides.
- S3-compatible object storage and horizontal file-serving scale.
- Additional recurrence rules beyond weekly, bi-weekly, and monthly.
- Additional pages that are not required by the agreed MVP journeys.

## Open decisions

These questions do not block issue #1, but the linked implementation area must
resolve them before relying on an assumption.

| Decision | Why it matters | Resolve before |
| --- | --- | --- |
| Must an ownership-transfer target already be an invited FIR, and what collaboration access does the former owner retain? | Owner-only transfer is confirmed, but the transfer preconditions and former-owner behavior need an explicit rule. | Event schema and collaboration implementation (#18 and #22) |
| Should a cancelled published event remain publicly visible with a cancellation notice, or disappear from discovery? | Pilots may need a durable cancellation signal, while the current public API backlog assumes cancelled content is hidden. | Lifecycle and public API implementation (#23 and #24) |
| Can an owning FIR restore a cancelled series, and under what audit rules? | This affects lifecycle transitions, notifications, and remote integrations. | Lifecycle implementation (#23) |
| Which edits remain legal after publication, especially schedule and recurrence changes? | Schedule changes can invalidate reminders, rosters, and materialized occurrences. | Event and recurrence implementation (#23 and #29) |
| How should monthly recurrence handle a day missing from a month? | Skipping, clamping to month-end, and rejecting the rule produce different series. | Recurrence implementation (#29) |
| How do Control Center and VATEUD precedence and freshness rules work when they disagree? | Eligibility must be explainable and must not silently over-grant access. | Eligibility synchronization (#14) |
| Which file types and size limits are safe defaults? | Local storage capacity and upload security depend on explicit limits. | Uploads and system settings (#31 and #42) |
| What is the featured-event selection rule? | The homepage needs a deterministic result that coordinators understand. | Public homepage (#25) |
| Which confirmed roster details are public? | Controller privacy and useful pilot information need a clear boundary. | Event roster rendering (#41) |
| What retention periods apply to identity, audit, roster, and upload data? | Privacy, support, and backup requirements depend on retention. | Release-readiness review (#47) |

When one of these choices is confirmed, update the relevant ADR in the same
change that implements it.
