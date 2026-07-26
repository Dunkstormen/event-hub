import { describe, expect, it, vi } from "vitest";

import { OAuthTransactionManager } from "./oauth-transaction.js";
import { VatsimAuthenticationService } from "./vatsim-authentication.js";

describe("VatsimAuthenticationService", () => {
  it("validates the transaction before exchanging the code", async () => {
    const authenticateCode = vi.fn(async () => ({
      cid: "1234567",
      displayName: "Ada Lovelace",
      synchronizedAt: new Date("2026-07-26T08:00:00.000Z"),
    }));
    const synchronizeVatsimIdentity = vi.fn(async () => ({
      id: "user-1",
      cid: "1234567",
      status: "ACTIVE" as const,
      displayName: "Ada Lovelace",
    }));
    const createSession = vi.fn(async () => ({
      token: "S".repeat(43),
      expiresAt: new Date("2026-07-26T16:00:00.000Z"),
    }));
    const transactions = new OAuthTransactionManager({
      randomValueFactory: vi
        .fn()
        .mockReturnValueOnce("A".repeat(43))
        .mockReturnValueOnce("B".repeat(43)),
    });
    const service = new VatsimAuthenticationService(
      {
        createAuthorizationUrl: (state) =>
          `https://auth.example.test?state=${state}`,
        authenticateCode,
      },
      { synchronizeVatsimIdentity, createSession },
      transactions,
    );
    const started = service.begin();

    await expect(
      service.complete({
        code: "code",
        providerState: `${"A".repeat(43)}.${"B".repeat(43)}`,
        transactionCookieValue: started.transactionCookieValue,
      }),
    ).resolves.toEqual({
      token: "S".repeat(43),
      expiresAt: new Date("2026-07-26T16:00:00.000Z"),
    });
    expect(authenticateCode).toHaveBeenCalledWith("code");
    expect(synchronizeVatsimIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ cid: "1234567" }),
    );
    expect(createSession).toHaveBeenCalledWith("user-1");
  });

  it("does not contact VATSIM when transaction validation fails", async () => {
    const authenticateCode = vi.fn();
    const service = new VatsimAuthenticationService(
      {
        createAuthorizationUrl: () => "https://auth.example.test",
        authenticateCode,
      },
      {
        synchronizeVatsimIdentity: vi.fn(),
        createSession: vi.fn(),
      },
      new OAuthTransactionManager(),
    );

    await expect(
      service.complete({
        code: "code",
        providerState: "invalid",
        transactionCookieValue: undefined,
      }),
    ).rejects.toThrow("could not be verified");
    expect(authenticateCode).not.toHaveBeenCalled();
  });
});
