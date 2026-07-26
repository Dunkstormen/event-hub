import { describe, expect, it } from "vitest";

import {
  ADMINISTRATOR_ROLE_KEY,
  INITIAL_CAPABILITIES,
  INITIAL_ROLES,
  parseBootstrapAdministratorCid,
  SYSTEM_ADMINISTRATOR_CAPABILITY,
} from "./authorization.js";

describe("initial authorization model", () => {
  it("uses unique stable capability and role keys", () => {
    const capabilityKeys = INITIAL_CAPABILITIES.map(
      (capability) => capability.key,
    );
    const roleKeys = INITIAL_ROLES.map((role) => role.key);

    expect(new Set(capabilityKeys).size).toBe(capabilityKeys.length);
    expect(new Set(roleKeys).size).toBe(roleKeys.length);
  });

  it("keeps the administrator role global and protected", () => {
    const administrator = INITIAL_ROLES.find(
      (role) => role.key === ADMINISTRATOR_ROLE_KEY,
    );

    expect(administrator).toMatchObject({
      scope: "GLOBAL",
      protected: true,
    });
    expect(administrator?.capabilityKeys).toContain(
      SYSTEM_ADMINISTRATOR_CAPABILITY,
    );
  });

  it("never grants global-only capabilities to FIR roles", () => {
    const globalOnly = new Set<string>(
      INITIAL_CAPABILITIES.filter(
        (capability) => capability.scope === "GLOBAL_ONLY",
      ).map((capability) => capability.key),
    );
    const firRoles = INITIAL_ROLES.filter(
      (role) => role.scope === "FIR",
    );

    expect(
      firRoles.every((role) =>
        role.capabilityKeys.every(
          (capability) => !globalOnly.has(capability),
        ),
      ),
    ).toBe(true);
  });
});

describe("parseBootstrapAdministratorCid", () => {
  it("accepts an optional canonical CID", () => {
    expect(parseBootstrapAdministratorCid(undefined)).toBeUndefined();
    expect(parseBootstrapAdministratorCid(" 1234567 ")).toBe("1234567");
  });

  it.each(["", "abc", "123 456", "1".repeat(17)])(
    "rejects an invalid CID of %s",
    (cid) => {
      if (cid === "") {
        expect(parseBootstrapAdministratorCid(cid)).toBeUndefined();
      } else {
        expect(() =>
          parseBootstrapAdministratorCid(cid),
        ).toThrow("BOOTSTRAP_ADMIN_CID");
      }
    },
  );
});
