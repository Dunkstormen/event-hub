import type {
  AuthorizationAssignment,
  AuthorizationRole,
  EffectiveCapability,
} from "@event-hub/contracts";

type PendingAssignment = Readonly<{
  roleKey: string;
  firIcaoCode?: string;
}>;

export function effectivePermissions(
  assignments: readonly AuthorizationAssignment[],
  roles: readonly AuthorizationRole[],
  pendingAssignment?: PendingAssignment,
): EffectiveCapability[] {
  const roleByKey = new Map(roles.map((role) => [role.key, role]));
  const grants = new Map<
    string,
    { global: boolean; firIcaoCodes: Set<string> }
  >();
  const effectiveAssignments = [
    ...assignments.map((assignment) => ({
      roleKey: assignment.roleKey,
      ...(assignment.fir === null
        ? {}
        : { firIcaoCode: assignment.fir.icaoCode }),
    })),
    ...(pendingAssignment === undefined ? [] : [pendingAssignment]),
  ];

  for (const assignment of effectiveAssignments) {
    const role = roleByKey.get(assignment.roleKey);

    if (role === undefined) {
      continue;
    }

    for (const capabilityKey of role.capabilityKeys) {
      const effective = grants.get(capabilityKey) ?? {
        global: false,
        firIcaoCodes: new Set<string>(),
      };

      if (assignment.firIcaoCode === undefined) {
        effective.global = true;
        effective.firIcaoCodes.clear();
      } else if (!effective.global) {
        effective.firIcaoCodes.add(assignment.firIcaoCode);
      }

      grants.set(capabilityKey, effective);
    }
  }

  return [...grants.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capabilityKey, effective]) => ({
      capabilityKey,
      global: effective.global,
      firIcaoCodes: effective.global
        ? []
        : [...effective.firIcaoCodes].sort(),
    }));
}
