# Event Hub API v1 conventions

## Boundary and media type

- Public endpoints live below `/v1`.
- Request and response bodies use JSON and UTF-8 unless an endpoint explicitly
  documents another media type, such as an authorized file download.
- Request and response schemas live in `packages/contracts`; database records
  and provider payloads are never transport contracts.
- Unknown object properties and unknown query parameters are rejected.
- Empty successful operations return `204 No Content`; other successful
  operations return a schema-defined JSON body.

## Runtime validation

TypeBox schemas are the source of truth for both runtime validation and inferred
TypeScript types. Fastify validates path parameters, query strings, headers,
and request bodies before handlers run. Fastify response schemas define the
serialized wire shape.

Validation failures return `400` using the common error envelope. Each detail
contains a JSON-Pointer-like `path`, a stable validator `code`, and a
human-readable `message`.

## Error envelope

Every non-success response uses this shape:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You cannot manage this event.",
    "requestId": "req-123",
    "details": [
      {
        "path": "/body/ownerFirId",
        "code": "ownership",
        "message": "Only the owning FIR can transfer ownership."
      }
    ]
  }
}
```

`details` is optional. Clients may display `message`, but branch on `code`;
message wording is not a compatibility guarantee. `requestId` is safe to
include in support reports. Internal exceptions, stack traces, database errors,
provider responses, credentials, and authorization policy internals are never
returned.

The shared codes cover:

| HTTP status | Default code |
| --- | --- |
| 400 | `BAD_REQUEST` or `VALIDATION_ERROR` |
| 401 | `AUTHENTICATION_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

Domain-specific detail codes may refine these categories without exposing
implementation details.

## Pagination, filtering, and sorting

Collection endpoints use cursor pagination:

- `cursor` is an opaque string returned by the previous response. Clients must
  not create or interpret it.
- `limit` is optional, defaults to 25, and must be between 1 and 100.
- A page returns `items` and `pageInfo`.
- `pageInfo.nextCursor` is the next opaque cursor or `null`.
- `pageInfo.hasNextPage` states whether another page was available when the
  response was produced.
- Invalid or expired cursors return `400 BAD_REQUEST`.

```json
{
  "items": [],
  "pageInfo": {
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

Filters are endpoint-specific named query parameters. Each endpoint must
declare its complete filter allowlist in its query schema. Dates and instants
use RFC 3339 strings; booleans use `true` or `false`; enum values use the exact
documented wire value. Repeated values are allowed only when the endpoint
schema declares an array.

Sorting uses `sort=field` for ascending order and `sort=-field` for descending
order. Each endpoint documents its allowed sort fields and deterministic
tie-breaker. Unsupported filters, sort fields, or directions return
`400 VALIDATION_ERROR`.

Clients must tolerate an item moving between pages when the underlying
collection changes. Cursor contents and database ordering are not public API.

## Compatibility policy

`v1` is a major compatibility boundary. The following changes are compatible
within `v1`:

- adding an endpoint;
- adding an optional request field;
- adding an optional response field;
- adding a new error detail while preserving the top-level error code;
- relaxing a validation constraint.

When adding an optional request field, deploy the accepting API before any
independently deployed client begins sending that field.

The following require a new major API version unless a migration path has been
explicitly agreed:

- removing or renaming a field or endpoint;
- changing a field's type, format, or meaning;
- making an optional request field required;
- tightening a validation constraint for previously valid input;
- changing pagination semantics or the error envelope;
- adding a value to an enum that was not documented as extensible.

Clients must ignore unknown optional response fields. They must not depend on
property order, error-message wording, opaque cursor contents, or undocumented
fields.

When a version is deprecated, Event Hub will document the replacement and
migration path and may send standard `Deprecation`, `Sunset`, and `Link`
headers. Supported versions are selected by URL; Event Hub does not negotiate
major versions through custom media types.
