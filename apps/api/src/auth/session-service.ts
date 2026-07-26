import { createHash, randomBytes } from "node:crypto";

import type {
  AuthenticatedSession,
  AuthenticatedUser,
} from "@event-hub/contracts";

export const VATSIM_IDENTITY_PROVIDER = "vatsim";

const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const vatsimCidPattern = /^[0-9]{1,16}$/u;

export type AccountStatus = "ACTIVE" | "DISABLED";

export type NormalizedVatsimIdentity = Readonly<{
  cid: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  synchronizedAt: Date;
}>;

export type SynchronizedUser = Readonly<{
  id: string;
  cid: string;
  status: AccountStatus;
  displayName: string;
}>;

export type StoredSession = Readonly<{
  expiresAt: Date;
  revokedAt: Date | null;
  user: SynchronizedUser;
}>;

export type AuthenticatedActor = Readonly<{
  id: string;
  cid: string;
  displayName: string;
}>;

export interface IdentitySessionRepository {
  synchronizeVatsimIdentity(
    identity: NormalizedVatsimIdentity,
  ): Promise<SynchronizedUser>;
  createSessionForActiveUser(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    authenticatedAt: Date;
  }): Promise<boolean>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  revokeSessionByTokenHash(
    tokenHash: string,
    revokedAt: Date,
  ): Promise<void>;
}

export class DisabledUserError extends Error {
  constructor() {
    super("Disabled users cannot create sessions.");
    this.name = "DisabledUserError";
  }
}

export class InvalidIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdentityError";
  }
}

type SessionServiceOptions = Readonly<{
  ttlSeconds: number;
  now?: () => Date;
  tokenFactory?: () => string;
}>;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizedOptionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function assertMaximumLength(
  value: string | undefined,
  field: string,
  maximumLength: number,
) {
  if (value !== undefined && value.length > maximumLength) {
    throw new InvalidIdentityError(
      `${field} must be at most ${maximumLength} characters.`,
    );
  }
}

function validateIdentity(
  identity: NormalizedVatsimIdentity,
): NormalizedVatsimIdentity {
  const cid = identity.cid.trim();
  const displayName = identity.displayName.trim();
  const givenName = normalizedOptionalValue(identity.givenName);
  const familyName = normalizedOptionalValue(identity.familyName);
  const email = normalizedOptionalValue(identity.email);

  if (!vatsimCidPattern.test(cid)) {
    throw new InvalidIdentityError("VATSIM CID must contain 1 to 16 digits.");
  }

  if (displayName === "") {
    throw new InvalidIdentityError("Display name is required.");
  }

  assertMaximumLength(displayName, "Display name", 191);
  assertMaximumLength(givenName, "Given name", 191);
  assertMaximumLength(familyName, "Family name", 191);
  assertMaximumLength(email, "Email", 320);

  if (Number.isNaN(identity.synchronizedAt.getTime())) {
    throw new InvalidIdentityError("Synchronization time must be valid.");
  }

  return {
    cid,
    displayName,
    synchronizedAt: identity.synchronizedAt,
    ...(givenName === undefined ? {} : { givenName }),
    ...(familyName === undefined ? {} : { familyName }),
    ...(email === undefined ? {} : { email }),
  };
}

export class SessionService {
  readonly #now: () => Date;
  readonly #repository: IdentitySessionRepository;
  readonly #tokenFactory: () => string;
  readonly #ttlMilliseconds: number;

  constructor(
    repository: IdentitySessionRepository,
    {
      ttlSeconds,
      now = () => new Date(),
      tokenFactory = () => randomBytes(32).toString("base64url"),
    }: SessionServiceOptions,
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error("Session lifetime must be a positive integer.");
    }

    this.#repository = repository;
    this.#ttlMilliseconds = ttlSeconds * 1000;
    this.#now = now;
    this.#tokenFactory = tokenFactory;
  }

  async synchronizeVatsimIdentity(identity: NormalizedVatsimIdentity) {
    return this.#repository.synchronizeVatsimIdentity(
      validateIdentity(identity),
    );
  }

  async createSession(userId: string) {
    const token = this.#tokenFactory();

    if (!sessionTokenPattern.test(token)) {
      throw new Error("Session token factory returned an invalid token.");
    }

    const authenticatedAt = this.#now();
    const expiresAt = new Date(
      authenticatedAt.getTime() + this.#ttlMilliseconds,
    );
    const created = await this.#repository.createSessionForActiveUser({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      authenticatedAt,
    });

    if (!created) {
      throw new DisabledUserError();
    }

    return { token, expiresAt };
  }

  async authenticateSession(
    token: string | undefined,
  ): Promise<AuthenticatedSession | null> {
    const session = await this.#authenticateStoredSession(token);

    if (session === null) {
      return null;
    }

    const user: AuthenticatedUser = {
      cid: session.user.cid,
      displayName: session.user.displayName,
    };

    return {
      user,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async authenticateActor(
    token: string | undefined,
  ): Promise<AuthenticatedActor | null> {
    const session = await this.#authenticateStoredSession(token);

    if (session === null) {
      return null;
    }

    return {
      id: session.user.id,
      cid: session.user.cid,
      displayName: session.user.displayName,
    };
  }

  async #authenticateStoredSession(
    token: string | undefined,
  ): Promise<StoredSession | null> {
    if (token === undefined || !sessionTokenPattern.test(token)) {
      return null;
    }

    const tokenHash = hashSessionToken(token);
    const session = await this.#repository.findSessionByTokenHash(tokenHash);

    if (session === null || session.revokedAt !== null) {
      return null;
    }

    const now = this.#now();

    if (
      session.expiresAt.getTime() <= now.getTime() ||
      session.user.status !== "ACTIVE"
    ) {
      await this.#repository.revokeSessionByTokenHash(tokenHash, now);
      return null;
    }

    return session;
  }

  async revokeSession(token: string | undefined) {
    if (token === undefined || !sessionTokenPattern.test(token)) {
      return;
    }

    await this.#repository.revokeSessionByTokenHash(
      hashSessionToken(token),
      this.#now(),
    );
  }
}
