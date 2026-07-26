import { describe, expect, it } from "vitest";

import {
  InvalidOAuthTransactionError,
  OAuthTransactionManager,
} from "./oauth-transaction.js";

describe("OAuthTransactionManager", () => {
  it("creates independent state and nonce values", () => {
    const values = ["A".repeat(43), "B".repeat(43)];
    const manager = new OAuthTransactionManager({
      randomValueFactory: () => values.shift() ?? "",
    });

    expect(manager.create()).toEqual({
      providerState: `${"A".repeat(43)}.${"B".repeat(43)}`,
      cookieValue: `${"A".repeat(43)}.${"B".repeat(43)}`,
    });
  });

  it("validates both state and nonce", () => {
    const manager = new OAuthTransactionManager();
    const transaction = manager.create();

    expect(() =>
      manager.validate(
        transaction.providerState,
        transaction.cookieValue,
      ),
    ).not.toThrow();

    expect(() =>
      manager.validate(
        `${"C".repeat(43)}.${transaction.providerState.split(".")[1]}`,
        transaction.cookieValue,
      ),
    ).toThrow(InvalidOAuthTransactionError);

    expect(() =>
      manager.validate(
        `${transaction.providerState.split(".")[0]}.${"C".repeat(43)}`,
        transaction.cookieValue,
      ),
    ).toThrow(InvalidOAuthTransactionError);
  });

  it.each([
    [undefined, undefined],
    ["malformed", "malformed"],
    [`${"A".repeat(43)}.${"B".repeat(42)}`, undefined],
  ])(
    "rejects missing or malformed transactions",
    (providerState, cookieValue) => {
      const manager = new OAuthTransactionManager();

      expect(() =>
        manager.validate(providerState, cookieValue),
      ).toThrow(InvalidOAuthTransactionError);
    },
  );
});
