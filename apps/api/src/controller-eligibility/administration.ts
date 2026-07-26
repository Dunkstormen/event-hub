import type {
  ControllerEligibilityProvider,
  ControllerEligibilityStatus,
  ControllerEligibilitySyncResult,
} from "@event-hub/contracts";
import type { PrismaClient } from "@event-hub/database";
import { FIR_MEMBERSHIPS_MANAGE_CAPABILITY } from "@event-hub/database";

import {
  AuthorizationPolicyDeniedError,
  requireGlobalCapability,
} from "../authorization/policy.js";
import {
  ControllerEligibilitySynchronization,
} from "./synchronization.js";

const providerOrder = ["control-center", "vateud"] as const;

export class ControllerEligibilityDeniedError extends Error {
  constructor() {
    super("Controller eligibility management permission is required.");
    this.name = "ControllerEligibilityDeniedError";
  }
}

export class ControllerEligibilityNotConfiguredError extends Error {
  constructor(provider: ControllerEligibilityProvider) {
    super(`Eligibility provider ${provider} is not configured.`);
    this.name = "ControllerEligibilityNotConfiguredError";
  }
}

function providerKey(provider: "CONTROL_CENTER" | "VATEUD") {
  return provider === "CONTROL_CENTER" ? "control-center" : "vateud";
}

function runTrigger(trigger: "STARTUP" | "PERIODIC" | "ON_DEMAND") {
  switch (trigger) {
    case "STARTUP":
      return "startup" as const;
    case "PERIODIC":
      return "periodic" as const;
    case "ON_DEMAND":
      return "on-demand" as const;
  }
}

function runStatus(status: "RUNNING" | "SUCCEEDED" | "FAILED") {
  switch (status) {
    case "RUNNING":
      return "running" as const;
    case "SUCCEEDED":
      return "succeeded" as const;
    case "FAILED":
      return "failed" as const;
  }
}

async function assertManager(database: PrismaClient, actorUserId: string) {
  try {
    await requireGlobalCapability(
      database,
      actorUserId,
      FIR_MEMBERSHIPS_MANAGE_CAPABILITY,
    );
  } catch (error) {
    if (error instanceof AuthorizationPolicyDeniedError) {
      throw new ControllerEligibilityDeniedError();
    }
    throw error;
  }
}

export interface ControllerEligibilityAdministration {
  getStatus(actorUserId: string): Promise<ControllerEligibilityStatus>;
  synchronize(
    actorUserId: string,
    provider: ControllerEligibilityProvider,
  ): Promise<ControllerEligibilitySyncResult>;
}

export function createControllerEligibilityAdministration(
  database: PrismaClient,
  synchronization: ControllerEligibilitySynchronization,
  clock: () => Date = () => new Date(),
): ControllerEligibilityAdministration {
  return {
    async getStatus(actorUserId) {
      await assertManager(database, actorUserId);
      const generatedAt = clock();
      const configured = new Set(
        synchronization.configuredProviders,
      );
      const [states, runs] = await Promise.all([
        database.eligibilityProviderState.findMany(),
        database.eligibilitySyncRun.findMany({
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
          take: 20,
        }),
      ]);
      const statesByProvider = new Map(
        states.map((state) => [providerKey(state.provider), state]),
      );

      return {
        generatedAt: generatedAt.toISOString(),
        providers: providerOrder.map((provider) => {
          const state = statesByProvider.get(provider);
          const isConfigured = configured.has(provider);
          const freshUntil = state?.freshUntil ?? null;

          return {
            provider,
            configured: isConfigured,
            state:
              state === undefined
                ? "never"
                : state.status === "SUCCEEDED"
                  ? "succeeded"
                  : "failed",
            freshness: !isConfigured
              ? "disabled"
              : freshUntil === null
                ? "never"
                : freshUntil > generatedAt
                  ? "fresh"
                  : "stale",
            lastAttemptedAt:
              state?.lastAttemptedAt.toISOString() ?? null,
            lastSucceededAt:
              state?.lastSucceededAt?.toISOString() ?? null,
            freshUntil: freshUntil?.toISOString() ?? null,
            lastErrorCode: state?.lastErrorCode ?? null,
            lastErrorMessage: state?.lastErrorMessage ?? null,
            consecutiveFailures: state?.consecutiveFailures ?? 0,
            recordsSeen: state?.recordsSeen ?? 0,
            nextRetryAt: state?.nextRetryAt?.toISOString() ?? null,
          };
        }),
        recentRuns: runs.map((run) => ({
          id: run.id,
          provider: providerKey(run.provider),
          trigger: runTrigger(run.trigger),
          status: runStatus(run.status),
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
          controllersSeen: run.controllersSeen,
          membershipsChanged: run.membershipsChanged,
          errorCode: run.errorCode,
        })),
      };
    },

    async synchronize(actorUserId, provider) {
      await assertManager(database, actorUserId);
      if (!synchronization.configuredProviders.includes(provider)) {
        throw new ControllerEligibilityNotConfiguredError(provider);
      }

      const result = await synchronization.sync(provider, "on-demand");
      return {
        ...result,
        freshUntil: result.freshUntil.toISOString(),
      };
    },
  };
}
