# Roles, capabilities, and administrator bootstrap

Issues #11 and #12 establish the persistence, administration API, and
administrator UI for Event Hub authorization. Issue #15 will apply these
capabilities centrally to event and FIR-scoped operations. Until that issue
lands, the role matrix protects its own management workflows but does not by
itself authorize every future domain operation.

## Capability model

Authorization decisions use stable capability keys rather than role names.
Roles are configurable bundles of those capabilities:

| Built-in role | Scope | Initial capabilities |
| --- | --- | --- |
| Pilot | Global | `events.participate` |
| Event Coordinator | FIR | `events.manage`, `rosters.manage` |
| Administrator | Global | Every initial capability, including `system.administrator` |

Every authenticated VATSIM identity receives the global Pilot role
idempotently. Event Coordinator assignments require an explicit active FIR
relation; they never infer scope from an airport prefix, role name, or browser
claim. Global roles reject FIR scope, and FIR roles cannot receive a capability
marked `GLOBAL_ONLY`.

`system.administrator` is the administrator marker, while
`authorization.manage` grants role-matrix management. Administrator safety
requires at least one active user to retain both capabilities through global
assignments. It does not compare the display name or role key "Administrator"
to authorize a user.

The built-in roles and capabilities are protected seed definitions. Seeding
restores missing initial grants but never removes custom grants, roles, or
assignments. The administrator workflow may configure the matrix within the
scope and lockout invariants.

## Assignment integrity

`user_role_assignments` stores a required `scope_key` so MySQL can enforce a
stable uniqueness key even when a global assignment has no FIR. A checked
constraint permits exactly these shapes:

- global: `fir_id IS NULL` and `scope_key = 'GLOBAL'`;
- FIR-scoped: `fir_id IS NOT NULL` and `scope_key = fir_id`.

Application administration validates that the target role has the matching
scope before writing. Capability-matrix updates similarly reject global-only
capabilities on FIR roles.

## Administrator lockout protection

The API-owned authorization administration repository protects every currently
implemented mutation that can reduce effective administrators:

- revoking a global role assignment;
- removing `system.administrator` from a configurable role;
- disabling an active administrator.

These operations use MySQL `SERIALIZABLE` transactions. After the mutation,
the transaction must still find at least one active user with global grants for
both `system.administrator` and `authorization.manage`; otherwise it throws and
rolls back. Prisma write conflicts use bounded retries. The protected built-in
Administrator role cannot lose either capability, so a known recovery role
always remains assignable.

Database-owner intervention can bypass application safeguards and should be
reserved for disaster recovery. Normal management code must use the
administration repository rather than writing assignments or user status
directly.

## Administrator management

The access-management interface is available at
`/administration/access`. Its API boundary is:

| Method and path | Purpose |
| --- | --- |
| `GET /v1/admin/authorization` | Capabilities, roles, FIRs, and the latest 25 audit records |
| `GET /v1/admin/authorization/users` | CID/display-name search with cursor pagination and effective grants |
| `POST /v1/admin/authorization/roles` | Create an unprotected custom role |
| `PATCH /v1/admin/authorization/roles/{roleKey}` | Update role metadata and replace its capability matrix |
| `DELETE /v1/admin/authorization/roles/{roleKey}` | Delete an unprotected, unassigned role |
| `POST /v1/admin/authorization/users/{userId}/assignments` | Grant a global or explicit FIR-scoped role |
| `DELETE /v1/admin/authorization/assignments/{assignmentId}` | Revoke one assignment |

Every endpoint requires an active session whose user has a global assignment
granting `authorization.manage`. The API resolves that capability from the
database for every request; a browser-supplied role or FIR claim is never
trusted.

The UI previews the union of the user's existing and proposed capability
grants before assignment. Global grants supersede narrower FIR grants in that
preview. Role-matrix changes show the resulting capability set and number of
affected assignments before a confirmation dialog is accepted.

Role scope and stable keys are immutable after creation. Protected roles cannot
be deleted, the protected Administrator management capabilities cannot be
removed, and custom roles must have no assignments before deletion.

## Authorization audit records

Each successful administrator mutation writes an
`authorization_audit_records` row in the same serializable transaction as the
change. Records identify the acting user, action, target, human-readable
summary, timestamp, and JSON before/after states where applicable. Failed,
rolled-back, and idempotent no-op requests do not create misleading audit
entries.

Audit rows retain their actor relation and are not deleted with roles or
assignments. The access-management UI shows the latest 25 records; the database
remains the source of truth for older history.

## Initial administrator provisioning

For a new environment:

1. Set `BOOTSTRAP_ADMIN_CID` to the intended administrator's numeric VATSIM CID.
2. Apply migrations.
3. Run `pnpm db:seed`.
4. Sign in through VATSIM Connect with that CID.
5. Verify access management at `/administration/access`.
6. Verify broader domain authorization after issue #15 is deployed.

The seed creates the user if necessary and idempotently grants the protected
global Administrator role. VATSIM login later attaches the normalized external
identity to the same CID record.

Running the seed again with the same CID creates no duplicate user or
assignment. Changing the CID only adds a new administrator; it never revokes
the old one. Before removing the environment value, provision and test another
administrator. Leaving the same value configured provides a repeatable
recovery path, but deployment logs and secret-management access should remain
restricted because a CID is personal data.

## Security basis

The model follows the
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html):
least privilege, explicit grants, deny by default, and authorization checks on
every protected request. Serializable mutation behavior follows
[Prisma's transaction guidance](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
