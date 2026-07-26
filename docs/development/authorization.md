# Roles, capabilities, and administrator bootstrap

Issue #11 establishes the persistence and administration boundary for Event
Hub authorization. Issue #12 will expose administrator management workflows,
and issue #15 will enforce these capabilities on protected API operations.
Until those issues land, this model does not by itself authorize a request.

## Capability model

Authorization decisions use stable capability keys rather than role names.
Roles are configurable bundles of those capabilities:

| Built-in role | Scope | Initial capabilities |
| --- | --- | --- |
| Pilot | Global | `events.participate` |
| Event Coordinator | FIR | `events.manage`, `rosters.manage` |
| Administrator | Global | Every initial capability, including `system.administrator` |

Every authenticated VATSIM identity receives the global Pilot role
idempotently. Event Coordinator assignments require an explicit FIR relation;
they never infer scope from an airport prefix, role name, or browser claim.
Global roles reject FIR scope, and FIR roles cannot receive a capability marked
`GLOBAL_ONLY`.

`system.administrator` is the effective-administrator marker. Code that checks
administrator safety queries that capability through role grants and active,
global assignments. It does not compare the display name or role key
"Administrator" to authorize a user.

The built-in roles and capabilities are protected seed definitions. Seeding
restores missing initial grants but never removes custom grants, roles, or
assignments. Later administrator workflows may configure the matrix within the
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
the transaction must still find at least one active user with a global role
granting `system.administrator`; otherwise it throws and rolls back. Prisma
write conflicts use bounded retries. The protected built-in administrator role
cannot lose the marker capability, so a known recovery role always remains
assignable.

Database-owner intervention can bypass application safeguards and should be
reserved for disaster recovery. Normal management code must use the
administration repository rather than writing assignments or user status
directly.

## Initial administrator provisioning

For a new environment:

1. Set `BOOTSTRAP_ADMIN_CID` to the intended administrator's numeric VATSIM CID.
2. Apply migrations.
3. Run `pnpm db:seed`.
4. Sign in through VATSIM Connect with that CID.
5. Verify administrator access after issues #12 and #15 are deployed.

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
