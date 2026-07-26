import { EligibilityProviderError } from "./provider.js";

type FetchLike = typeof fetch;

type ProviderHttpClientOptions = Readonly<{
  fetchImplementation?: FetchLike;
  requestTimeoutMs: number;
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
}>;

function delay(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export class ProviderHttpClient {
  readonly #fetch: FetchLike;
  readonly #requestTimeoutMs: number;
  readonly #retryDelaysMs: readonly number[];
  readonly #sleep: (delayMs: number) => Promise<void>;

  constructor({
    fetchImplementation = fetch,
    requestTimeoutMs,
    retryDelaysMs = [250, 750],
    sleep = delay,
  }: ProviderHttpClientOptions) {
    this.#fetch = fetchImplementation;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#retryDelaysMs = retryDelaysMs;
    this.#sleep = sleep;
  }

  async getJson(
    url: URL,
    headers: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    for (
      let attempt = 0;
      attempt <= this.#retryDelaysMs.length;
      attempt += 1
    ) {
      try {
        const response = await this.#fetch(url, {
          headers,
          method: "GET",
          signal: AbortSignal.timeout(this.#requestTimeoutMs),
        });

        if (response.ok) {
          try {
            return (await response.json()) as unknown;
          } catch {
            throw new EligibilityProviderError(
              "INVALID_RESPONSE",
              "The eligibility provider returned invalid JSON.",
              false,
            );
          }
        }

        if (response.status === 401 || response.status === 403) {
          throw new EligibilityProviderError(
            "AUTHENTICATION_FAILED",
            "The eligibility provider rejected its API credentials.",
            false,
          );
        }

        const retryable =
          response.status === 429 || response.status >= 500;

        if (!retryable) {
          throw new EligibilityProviderError(
            "REQUEST_REJECTED",
            `The eligibility provider rejected the request with HTTP ${response.status}.`,
            false,
          );
        }

        if (attempt === this.#retryDelaysMs.length) {
          throw new EligibilityProviderError(
            "PROVIDER_UNAVAILABLE",
            `The eligibility provider remained unavailable after ${attempt + 1} attempts.`,
            true,
          );
        }
      } catch (error) {
        if (error instanceof EligibilityProviderError) {
          if (!error.retryable || attempt === this.#retryDelaysMs.length) {
            throw error;
          }
        } else if (attempt === this.#retryDelaysMs.length) {
          throw new EligibilityProviderError(
            "NETWORK_FAILURE",
            "The eligibility provider could not be reached.",
            true,
          );
        }
      }

      await this.#sleep(this.#retryDelaysMs[attempt] ?? 0);
    }

    throw new EligibilityProviderError(
      "PROVIDER_UNAVAILABLE",
      "The eligibility provider could not be reached.",
      true,
    );
  }
}
