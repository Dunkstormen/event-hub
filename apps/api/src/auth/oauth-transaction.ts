import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const transactionPartPattern = /^[A-Za-z0-9_-]{43}$/u;

export class InvalidOAuthTransactionError extends Error {
  constructor() {
    super("The OAuth transaction could not be verified.");
    this.name = "InvalidOAuthTransactionError";
  }
}

type OAuthTransactionManagerOptions = Readonly<{
  randomValueFactory?: () => string;
}>;

function parseTransaction(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  const [state, nonce, extra] = value.split(".");

  if (
    extra !== undefined ||
    state === undefined ||
    nonce === undefined ||
    !transactionPartPattern.test(state) ||
    !transactionPartPattern.test(nonce)
  ) {
    return null;
  }

  return { state, nonce };
}

function valuesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export class OAuthTransactionManager {
  readonly #randomValueFactory: () => string;

  constructor({
    randomValueFactory = () =>
      randomBytes(32).toString("base64url"),
  }: OAuthTransactionManagerOptions = {}) {
    this.#randomValueFactory = randomValueFactory;
  }

  create() {
    const state = this.#randomValueFactory();
    const nonce = this.#randomValueFactory();

    if (
      !transactionPartPattern.test(state) ||
      !transactionPartPattern.test(nonce)
    ) {
      throw new Error(
        "OAuth transaction random-value factory returned an invalid value.",
      );
    }

    const value = `${state}.${nonce}`;

    return {
      providerState: value,
      cookieValue: value,
    };
  }

  validate(
    providerState: string | undefined,
    cookieValue: string | undefined,
  ) {
    const returned = parseTransaction(providerState);
    const stored = parseTransaction(cookieValue);

    if (
      returned === null ||
      stored === null ||
      !valuesMatch(returned.state, stored.state) ||
      !valuesMatch(returned.nonce, stored.nonce)
    ) {
      throw new InvalidOAuthTransactionError();
    }
  }
}
