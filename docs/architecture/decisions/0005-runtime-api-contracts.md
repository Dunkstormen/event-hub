# ADR 0005: Runtime API contracts

- Status: Accepted
- Date: 2026-07-24

## Context

The web and API deploy independently, but must agree on request, response,
pagination, and error shapes. TypeScript interfaces alone disappear at runtime,
while maintaining separate interfaces and JSON Schemas would allow them to
drift.

Fastify validates requests and serializes responses with JSON Schema. The
contract format should therefore work directly with Fastify while remaining
usable by the web application without importing Fastify.

## Decision

Event Hub defines transport contracts with TypeBox in `packages/contracts`.
TypeScript types are inferred from those schemas rather than maintained
separately.

The API uses Fastify's official TypeBox type provider. Route schemas reference
the shared contracts for request validation and response serialization. Code
that validates contracts outside Fastify uses TypeBox's runtime value checker.

The initial implementation uses the TypeBox 0.x LTS package because the
repository uses TypeScript 5.9. TypeBox 1.x requires the TypeScript 6/7
generation and can be evaluated when the toolchain supports it.

The public namespace is `/v1`. All API failures use the shared error envelope,
including validation, authentication, authorization, missing-resource, and
unexpected failures.

## Consequences

- Runtime and static contracts have one source of truth.
- Contract packages remain independent of Fastify and database models.
- Fastify can infer handler types and serialize only documented response fields.
- Contract changes require runtime tests as well as type checking.
- A TypeScript toolchain upgrade may include a deliberate TypeBox major-version
  migration.

Detailed wire conventions and compatibility rules are documented in
[`docs/api/v1-conventions.md`](../../api/v1-conventions.md).
