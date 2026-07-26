import type { SessionService } from "./session-service.js";
import type { OAuthTransactionManager } from "./oauth-transaction.js";
import type { VatsimIdentityProvider } from "./vatsim-connect-client.js";

export type VatsimSessionIssuer = Pick<
  SessionService,
  "synchronizeVatsimIdentity" | "createSession"
>;

export type CompletedVatsimAuthentication = Readonly<{
  token: string;
  expiresAt: Date;
}>;

export interface VatsimAuthenticationFlow {
  begin(): Readonly<{
    authorizationUrl: string;
    transactionCookieValue: string;
  }>;
  complete(input: {
    code: string;
    providerState: string | undefined;
    transactionCookieValue: string | undefined;
  }): Promise<CompletedVatsimAuthentication>;
}

export class VatsimAuthenticationService
  implements VatsimAuthenticationFlow
{
  readonly #identityProvider: VatsimIdentityProvider;
  readonly #sessions: VatsimSessionIssuer;
  readonly #transactions: OAuthTransactionManager;

  constructor(
    identityProvider: VatsimIdentityProvider,
    sessions: VatsimSessionIssuer,
    transactions: OAuthTransactionManager,
  ) {
    this.#identityProvider = identityProvider;
    this.#sessions = sessions;
    this.#transactions = transactions;
  }

  begin() {
    const transaction = this.#transactions.create();

    return {
      authorizationUrl: this.#identityProvider.createAuthorizationUrl(
        transaction.providerState,
      ),
      transactionCookieValue: transaction.cookieValue,
    };
  }

  async complete({
    code,
    providerState,
    transactionCookieValue,
  }: {
    code: string;
    providerState: string | undefined;
    transactionCookieValue: string | undefined;
  }) {
    this.#transactions.validate(
      providerState,
      transactionCookieValue,
    );
    const identity =
      await this.#identityProvider.authenticateCode(code);
    const user =
      await this.#sessions.synchronizeVatsimIdentity(identity);

    return this.#sessions.createSession(user.id);
  }
}
