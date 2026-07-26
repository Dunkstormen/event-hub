import type { PrismaClient } from "@event-hub/database";

import type { EligibilityProviderKey } from "./provider.js";
import { ControllerEligibilitySynchronization } from "./synchronization.js";

type SchedulerLogger = Readonly<{
  error(value: unknown, message: string): void;
  info(value: unknown, message: string): void;
}>;

function databaseProvider(provider: EligibilityProviderKey) {
  return provider === "control-center"
    ? ("CONTROL_CENTER" as const)
    : ("VATEUD" as const);
}

export class ControllerEligibilityScheduler {
  readonly #database: PrismaClient;
  readonly #logger: SchedulerLogger;
  readonly #synchronization: ControllerEligibilitySynchronization;
  readonly #syncIntervalMs: number;
  readonly #timers = new Map<
    EligibilityProviderKey,
    NodeJS.Timeout
  >();
  #started = false;

  constructor(
    database: PrismaClient,
    synchronization: ControllerEligibilitySynchronization,
    options: Readonly<{
      logger: SchedulerLogger;
      syncIntervalSeconds: number;
    }>,
  ) {
    this.#database = database;
    this.#logger = options.logger;
    this.#synchronization = synchronization;
    this.#syncIntervalMs = options.syncIntervalSeconds * 1000;
  }

  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;

    for (const provider of this.#synchronization.configuredProviders) {
      this.#schedule(provider, 0, "startup");
    }
  }

  stop() {
    this.#started = false;
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
  }

  #schedule(
    provider: EligibilityProviderKey,
    delayMs: number,
    trigger: "startup" | "periodic",
  ) {
    if (!this.#started) {
      return;
    }

    const timer = setTimeout(() => {
      void this.#run(provider, trigger);
    }, delayMs);
    timer.unref();
    this.#timers.set(provider, timer);
  }

  async #run(
    provider: EligibilityProviderKey,
    trigger: "startup" | "periodic",
  ) {
    this.#timers.delete(provider);

    try {
      const result = await this.#synchronization.sync(provider, trigger);
      this.#logger.info(
        {
          provider,
          controllersSeen: result.controllersSeen,
          membershipsChanged: result.membershipsChanged,
          freshUntil: result.freshUntil,
        },
        "Controller eligibility synchronization succeeded",
      );
      this.#schedule(provider, this.#syncIntervalMs, "periodic");
    } catch (error) {
      this.#logger.error(
        { err: error, provider },
        "Controller eligibility synchronization failed",
      );
      const state =
        await this.#database.eligibilityProviderState.findUnique({
          where: { provider: databaseProvider(provider) },
          select: { nextRetryAt: true },
        });
      const retryDelayMs =
        state?.nextRetryAt === null ||
        state?.nextRetryAt === undefined
          ? this.#syncIntervalMs
          : Math.max(1000, state.nextRetryAt.valueOf() - Date.now());
      this.#schedule(provider, retryDelayMs, "periodic");
    }
  }
}
