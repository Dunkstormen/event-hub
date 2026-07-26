import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import type { VatsimConnectConfiguration } from "@event-hub/config/vatsim-connect";

import type { NormalizedVatsimIdentity } from "./session-service.js";

const tokenResponseSchema = Type.Object({
  access_token: Type.String({ minLength: 1 }),
  token_type: Type.Literal("Bearer"),
});

const userResponseSchema = Type.Object({
  data: Type.Object({
    cid: Type.String({
      minLength: 1,
      maxLength: 16,
      pattern: "^[0-9]+$",
    }),
    personal: Type.Object({
      name_first: Type.String(),
      name_last: Type.String(),
      name_full: Type.String(),
      email: Type.Optional(Type.String()),
    }),
  }),
});

type TokenResponse = typeof tokenResponseSchema.static;
type UserResponse = typeof userResponseSchema.static;

export class VatsimConnectProviderError extends Error {
  constructor() {
    super("VATSIM Connect could not complete authentication.");
    this.name = "VatsimConnectProviderError";
  }
}

export interface VatsimIdentityProvider {
  createAuthorizationUrl(state: string): string;
  authenticateCode(code: string): Promise<NormalizedVatsimIdentity>;
}

type VatsimConnectClientOptions = Readonly<{
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}>;

function joinName(first: string, last: string) {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

export class VatsimConnectClient implements VatsimIdentityProvider {
  readonly #configuration: VatsimConnectConfiguration;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(
    configuration: VatsimConnectConfiguration,
    {
      fetchImplementation = fetch,
      now = () => new Date(),
    }: VatsimConnectClientOptions = {},
  ) {
    this.#configuration = configuration;
    this.#fetch = fetchImplementation;
    this.#now = now;
  }

  createAuthorizationUrl(state: string) {
    const url = new URL(
      "/oauth/authorize",
      this.#configuration.baseUrl,
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.#configuration.clientId);
    url.searchParams.set(
      "redirect_uri",
      this.#configuration.redirectUri,
    );
    url.searchParams.set("scope", "full_name email");
    url.searchParams.set("state", state);

    return url.toString();
  }

  async #requestJson(url: URL, init: RequestInit) {
    let response: Response;

    try {
      response = await this.#fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(
          this.#configuration.requestTimeoutMs,
        ),
      });
    } catch {
      throw new VatsimConnectProviderError();
    }

    if (!response.ok) {
      throw new VatsimConnectProviderError();
    }

    try {
      return await response.json();
    } catch {
      throw new VatsimConnectProviderError();
    }
  }

  async #exchangeCode(code: string) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.#configuration.clientId,
      client_secret: this.#configuration.clientSecret,
      redirect_uri: this.#configuration.redirectUri,
      code,
    });
    const payload = await this.#requestJson(
      new URL("/oauth/token", this.#configuration.baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    if (!Value.Check(tokenResponseSchema, payload)) {
      throw new VatsimConnectProviderError();
    }

    return payload as TokenResponse;
  }

  async #getUser(accessToken: string) {
    const payload = await this.#requestJson(
      new URL("/api/user", this.#configuration.baseUrl),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!Value.Check(userResponseSchema, payload)) {
      throw new VatsimConnectProviderError();
    }

    return payload as UserResponse;
  }

  async authenticateCode(
    code: string,
  ): Promise<NormalizedVatsimIdentity> {
    const token = await this.#exchangeCode(code);
    const response = await this.#getUser(token.access_token);
    const personal = response.data.personal;
    const displayName =
      personal.name_full.trim() ||
      joinName(personal.name_first, personal.name_last);

    if (displayName === "") {
      throw new VatsimConnectProviderError();
    }

    const email = personal.email?.trim();

    return {
      cid: response.data.cid,
      displayName,
      synchronizedAt: this.#now(),
      ...(personal.name_first.trim() === ""
        ? {}
        : { givenName: personal.name_first.trim() }),
      ...(personal.name_last.trim() === ""
        ? {}
        : { familyName: personal.name_last.trim() }),
      ...(email === undefined || email === "" ? {} : { email }),
    };
  }
}
