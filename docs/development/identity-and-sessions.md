# Identity and session security

Issue #9 establishes the provider-independent identity and session foundation.
Issue #10 will map VATSIM Connect responses into this foundation and add the
OAuth authorization and callback flow.

## Identity model

- A user is identified externally by a VATSIM CID stored as a string. The CID
  is unique and is not treated as a JavaScript number.
- Account status is either `ACTIVE` or `DISABLED`. Synchronizing identity data
  never re-enables a disabled account.
- Provider data is normalized into an external identity record with provider,
  subject, display name, optional name and email fields, and `lastSyncedAt`.
  Raw provider payloads are not persisted or exposed through API contracts.
- The authenticated-session response contains only CID, display name, and the
  server-side expiry instant.

The `SessionService.synchronizeVatsimIdentity` input is the boundary that issue
#10's VATSIM adapter must target. Changes in VATSIM's response shape belong in
that adapter rather than in database or public contract types.

## Session lifecycle

Session identifiers are 32 cryptographically random bytes encoded as Base64URL.
Only a SHA-256 digest is persisted; the opaque token exists only in the
HTTP-only browser cookie and the request that creates it.

The server enforces an absolute expiry and a nullable revocation timestamp.
Every authenticated lookup also checks current user status. Expired sessions
and sessions belonging to disabled users are revoked and rejected. Session
creation checks active status inside a serializable database transaction.

The endpoints currently exposed are:

| Endpoint | Behavior |
| --- | --- |
| `GET /v1/auth/session` | Returns the normalized current identity, or `401 AUTHENTICATION_REQUIRED`. Invalid and expired cookies are cleared. |
| `DELETE /v1/auth/session` | Idempotently revokes the server-side session, clears the cookie, and returns `204`. |

Both responses use `Cache-Control: no-store`.

## Cookie defaults

Cookies are host-only because no `Domain` attribute is set. They use `Path=/`,
`HttpOnly`, and `SameSite=Lax`. They are non-persistent in the browser; the
database remains the source of truth for the absolute session expiry.

| Runtime | Cookie name | `Secure` |
| --- | --- | ---: |
| Local and test | `event_hub_id` | No, so plain HTTP localhost works |
| Production | `__Host-id` | Yes |

Production therefore requires HTTPS. The `__Host-` prefix also requires
`Path=/` and forbids a `Domain` attribute; do not weaken these settings when
deploying the API. Only an explicit `NODE_ENV=development` or `NODE_ENV=test`
selects the insecure localhost cookie. Missing and other runtime modes fail
secure with the production cookie.

`SESSION_TTL_SECONDS` controls the server-side lifetime. It defaults to 28,800
seconds (8 hours) and accepts values from 300 seconds through 604,800 seconds
(7 days).

## Verification

Database-free tests cover normalization, token hashing, secure cookie
attributes, expiry, revocation, logout, and disabled-user behavior. The API
integration suite applies the real migration and verifies identity
synchronization, digest-only storage, authenticated lookup, and immediate
revocation after an account is disabled against MySQL.

The implementation follows the
[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and the
[`@fastify/cookie` security guidance](https://github.com/fastify/fastify-cookie#readme).
