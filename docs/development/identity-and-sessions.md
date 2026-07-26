# Identity and session security

The provider-independent identity and session foundation is connected to
VATSIM through an OAuth 2.0 authorization-code adapter. Provider access and
refresh tokens are used only during the callback and are never persisted.

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
| `GET /v1/auth/vatsim` | Creates a short-lived authorization transaction and redirects to VATSIM Connect. |
| `GET /v1/auth/vatsim/callback` | Validates the transaction, exchanges the authorization code, normalizes the VATSIM user, creates the Event Hub session, and redirects to the configured web application. |
| `GET /v1/auth/session` | Returns the normalized current identity, or `401 AUTHENTICATION_REQUIRED`. Invalid and expired cookies are cleared. |
| `DELETE /v1/auth/session` | Idempotently revokes the server-side session, clears the cookie, and returns `204`. |

Both responses use `Cache-Control: no-store`.

## VATSIM Connect transaction

VATSIM Connect currently documents OAuth 2.0 rather than OpenID Connect and
does not issue an ID token or expose an OIDC `nonce` parameter. Event Hub
therefore generates independent 256-bit state and nonce values and binds both
into the opaque OAuth `state` round trip. The same pair is held in a
short-lived HTTP-only transaction cookie. The callback parses and compares
both values using constant-time comparisons before it contacts the token
endpoint.

The transaction cookie lasts ten minutes, uses `SameSite=Lax`, is host-only,
and is cleared on every callback attempt. A transaction cannot be replayed
without the consumed browser cookie. Production uses the secure
`__Host-vatsim-oauth` name; local development uses
`event_hub_vatsim_oauth` so the sandbox can redirect to an HTTP localhost
callback.

The callback requests only the `full_name` and `email` scopes. It maps CID,
name, and optional email into the normalized identity boundary, then discards
the provider response and credentials. Provider errors, payloads,
authorization codes, and tokens are never returned to the browser.

Callback failures use the standard API error envelope:

- denied or incomplete authorization returns an actionable `400`;
- invalid, missing, expired, or mismatched transactions return `400`;
- disabled Event Hub users return `403`;
- provider transport and response failures return `502` with a generic retry
  message;
- an unconfigured local integration returns `503`.

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

VATSIM Connect configuration is all-or-nothing. Leaving its client values
empty keeps the API available but makes the start endpoint return `503`.
Once configured, the client ID, client secret, exact callback URI, and trusted
success redirect URI are required. Provider requests have a ten-second
timeout. Non-local callback and success redirects must use HTTPS.

## Verification

Database-free tests cover state and nonce validation, provider payload
normalization, token hashing, secure cookie attributes, callback errors,
expiry, revocation, logout, and disabled-user behavior. The API integration
suite applies the real migration and verifies the mocked VATSIM callback,
identity synchronization, digest-only storage, authenticated lookup, and
immediate revocation after an account is disabled against MySQL.

The implementation follows the
[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and the
[`@fastify/cookie` security guidance](https://github.com/fastify/fastify-cookie#readme).
The external adapter targets VATSIM's current documentation for the
[authorization redirect](https://vatsim.dev/api/connect-api/redirect/),
[token exchange](https://vatsim.dev/api/connect-api/get-token/), and
[authenticated user response](https://vatsim.dev/api/connect-api/get-user/).
