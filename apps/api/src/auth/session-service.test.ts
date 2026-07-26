import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  DisabledUserError,
  type IdentitySessionRepository,
  InvalidIdentityError,
  SessionService,
} from "./session-service.js";

const now = new Date("2026-07-25T12:00:00.000Z");
const token = "A".repeat(43);

function createRepository(
  overrides: Partial<IdentitySessionRepository> = {},
): IdentitySessionRepository {
  return {
    synchronizeVatsimIdentity: vi.fn(async (identity) => ({
      id: "user-1",
      cid: identity.cid,
      status: "ACTIVE",
      displayName: identity.displayName,
    })),
    createSessionForActiveUser: vi.fn(async () => true),
    findSessionByTokenHash: vi.fn(async () => null),
    revokeSessionByTokenHash: vi.fn(async () => {}),
    ...overrides,
  };
}

function createService(repository: IdentitySessionRepository) {
  return new SessionService(repository, {
    ttlSeconds: 3600,
    now: () => now,
    tokenFactory: () => token,
  });
}

describe("SessionService identity synchronization", () => {
  it("passes only normalized provider-independent identity fields", async () => {
    const synchronizeVatsimIdentity = vi.fn(async () => ({
      id: "user-1",
      cid: "1234567",
      status: "ACTIVE" as const,
      displayName: "Ada Lovelace",
    }));
    const repository = createRepository({ synchronizeVatsimIdentity });
    const service = createService(repository);

    await service.synchronizeVatsimIdentity({
      cid: " 1234567 ",
      displayName: " Ada Lovelace ",
      givenName: " Ada ",
      familyName: " Lovelace ",
      email: " ada@example.test ",
      synchronizedAt: now,
    });

    expect(synchronizeVatsimIdentity).toHaveBeenCalledWith({
      cid: "1234567",
      displayName: "Ada Lovelace",
      givenName: "Ada",
      familyName: "Lovelace",
      email: "ada@example.test",
      synchronizedAt: now,
    });
  });

  it("rejects invalid CIDs and empty display names", async () => {
    const service = createService(createRepository());

    await expect(
      service.synchronizeVatsimIdentity({
        cid: "not-a-cid",
        displayName: "Ada",
        synchronizedAt: now,
      }),
    ).rejects.toBeInstanceOf(InvalidIdentityError);
    await expect(
      service.synchronizeVatsimIdentity({
        cid: "1234567",
        displayName: " ",
        synchronizedAt: now,
      }),
    ).rejects.toBeInstanceOf(InvalidIdentityError);
  });
});

describe("SessionService lifecycle", () => {
  it("stores only a digest of a random token with a server-side expiry", async () => {
    const createSessionForActiveUser = vi.fn(async () => true);
    const service = createService(
      createRepository({ createSessionForActiveUser }),
    );

    await expect(service.createSession("user-1")).resolves.toEqual({
      token,
      expiresAt: new Date("2026-07-25T13:00:00.000Z"),
    });
    expect(createSessionForActiveUser).toHaveBeenCalledWith({
      userId: "user-1",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date("2026-07-25T13:00:00.000Z"),
      authenticatedAt: now,
    });
    expect(createSessionForActiveUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ token }),
    );
  });

  it("fails closed when the repository rejects a disabled user", async () => {
    const service = createService(
      createRepository({
        createSessionForActiveUser: vi.fn(async () => false),
      }),
    );

    await expect(service.createSession("user-disabled")).rejects.toBeInstanceOf(
      DisabledUserError,
    );
  });

  it("returns a normalized authenticated identity for an active session", async () => {
    const service = createService(
      createRepository({
        findSessionByTokenHash: vi.fn(async () => ({
          expiresAt: new Date("2026-07-25T13:00:00.000Z"),
          revokedAt: null,
          user: {
            id: "user-1",
            cid: "1234567",
            status: "ACTIVE",
            displayName: "Ada Lovelace",
          },
        })),
      }),
    );

    await expect(service.authenticateSession(token)).resolves.toEqual({
      user: {
        cid: "1234567",
        displayName: "Ada Lovelace",
      },
      expiresAt: "2026-07-25T13:00:00.000Z",
    });
  });

  it.each([
    {
      reason: "expired",
      expiresAt: new Date("2026-07-25T12:00:00.000Z"),
      status: "ACTIVE" as const,
    },
    {
      reason: "disabled",
      expiresAt: new Date("2026-07-25T13:00:00.000Z"),
      status: "DISABLED" as const,
    },
  ])("revokes and rejects a $reason session", async ({ expiresAt, status }) => {
    const revokeSessionByTokenHash = vi.fn(async () => {});
    const service = createService(
      createRepository({
        findSessionByTokenHash: vi.fn(async () => ({
          expiresAt,
          revokedAt: null,
          user: {
            id: "user-1",
            cid: "1234567",
            status,
            displayName: "Ada Lovelace",
          },
        })),
        revokeSessionByTokenHash,
      }),
    );

    await expect(service.authenticateSession(token)).resolves.toBeNull();
    expect(revokeSessionByTokenHash).toHaveBeenCalledWith(
      createHash("sha256").update(token).digest("hex"),
      now,
    );
  });

  it("ignores malformed or already revoked session tokens", async () => {
    const findSessionByTokenHash = vi.fn(async () => null);
    const service = createService(
      createRepository({ findSessionByTokenHash }),
    );

    await expect(service.authenticateSession("malformed")).resolves.toBeNull();
    expect(findSessionByTokenHash).not.toHaveBeenCalled();
  });
});
