# MVP architecture

This directory is the implementation reference for Event Hub's MVP
architecture and domain rules. Confirmed decisions are recorded as Architecture
Decision Records (ADRs), while unresolved choices are listed in the
[MVP scope](../product/mvp-scope.md#open-decisions).

## Architectural principles

1. **The API is the system boundary.** The web application consumes versioned
   HTTP contracts and never accesses Prisma or MySQL directly.
2. **Authorization belongs on the server.** UI controls improve usability but
   never replace API authorization.
3. **FIR scope is explicit.** Global permissions, FIR memberships, event
   ownership, and invited-FIR collaboration are separate concepts.
4. **Schedules preserve local civil time.** An event series owns its schedule
   and IANA timezone; occurrences derive their instants from it.
5. **External systems are adapters.** VATSIM Connect, Control Center, VATEUD,
   Discord, and future integrations do not define internal domain shapes.
6. **MVP infrastructure can evolve.** Local file storage and the initial job
   runner sit behind interfaces that can be replaced without changing public
   API contracts.

## Documents

- [System context and package boundaries](system-context.md)
- [ADR 0001: Application and API boundaries](decisions/0001-application-and-api-boundaries.md)
- [ADR 0002: Identity, authorization, and event ownership](decisions/0002-identity-authorization-and-event-ownership.md)
- [ADR 0003: Event lifecycle, recurrence, and time](decisions/0003-event-lifecycle-recurrence-and-time.md)
- [ADR 0004: Local file storage for the MVP](decisions/0004-local-file-storage.md)
- [ADR 0005: Runtime API contracts](decisions/0005-runtime-api-contracts.md)
- [MVP scope and deferred work](../product/mvp-scope.md)

## Domain language

| Term | Meaning |
| --- | --- |
| vACC | The single VATSIM Scandinavia organization served by the MVP. |
| FIR | A permission and event-management scope identified by its ICAO code. |
| Owning FIR | The one FIR currently responsible for an event series. It cannot be removed or replaced by an invited FIR; only its own coordinators may transfer ownership, and only to an existing participating FIR. |
| Participating FIR | A FIR invited by the owning FIR to collaborate on an event in the MVP. |
| Event Coordinator | A user with event-management permissions scoped to one or more FIRs. |
| Controller | A capability derived from controller eligibility data or an audited manual assignment, not a permanently assumed global role. |
| Pilot | The default authenticated role, with access to published public event content. |
| Event series | The event record containing shared content, schedule, recurrence, ownership, and defaults. A non-recurring event is a series with one occurrence. |
| Occurrence | One scheduled instance derived from an event series. It can override only the fields allowed by ADR 0003. |
| Open interest | Rostering in which controllers submit position preferences and availability before coordinators assign the roster. |
| Predefined slot | Rostering in which an eligible controller atomically books a configured position and interval. |
