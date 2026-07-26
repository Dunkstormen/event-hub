import { createHash } from "node:crypto";

import type { PrismaClient } from "@event-hub/database";
import { Prisma } from "@event-hub/database";

import {
  type ControllerEligibilityProvider,
  EligibilityProviderError,
  type EligibilityProviderKey,
  type NormalizedControllerEndorsement,
  type NormalizedEligibilityBatch,
} from "./provider.js";

const controlCenterSourceProvider = "control-center";
const maximumTransactionAttempts = 4;
const maximumRetryDelaySeconds = 6 * 60 * 60;

type DatabaseProvider = "CONTROL_CENTER" | "VATEUD";
type DatabaseTrigger = "STARTUP" | "PERIODIC" | "ON_DEMAND";

export type EligibilitySynchronizationTrigger =
  | "startup"
  | "periodic"
  | "on-demand";

export type EligibilitySynchronizationResult = Readonly<{
  controllersSeen: number;
  freshUntil: Date;
  membershipsChanged: number;
  provider: EligibilityProviderKey;
  runId: string;
}>;

type SynchronizationOptions = Readonly<{
  clock?: () => Date;
  freshnessSeconds: number;
  retryBaseSeconds?: number;
}>;

function databaseProvider(
  provider: EligibilityProviderKey,
): DatabaseProvider {
  return provider === "control-center" ? "CONTROL_CENTER" : "VATEUD";
}

function databaseTrigger(
  trigger: EligibilitySynchronizationTrigger,
): DatabaseTrigger {
  switch (trigger) {
    case "startup":
      return "STARTUP";
    case "periodic":
      return "PERIODIC";
    case "on-demand":
      return "ON_DEMAND";
  }
}

function endorsementKind(
  kind: NormalizedControllerEndorsement["kind"],
) {
  switch (kind) {
    case "examiner":
      return "EXAMINER" as const;
    case "facility":
      return "FACILITY" as const;
    case "solo":
      return "SOLO" as const;
    case "tier-1":
      return "TIER_1" as const;
    case "tier-2":
      return "TIER_2" as const;
    case "visiting":
      return "VISITING" as const;
  }
}

function sourceKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The eligibility synchronization failed.";

  return message.slice(0, 500);
}

function errorCode(error: unknown) {
  return error instanceof EligibilityProviderError
    ? error.code.slice(0, 64)
    : "SYNCHRONIZATION_FAILED";
}

async function serializableTransaction<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maximumTransactionAttempts;
    attempt += 1
  ) {
    try {
      return await database.$transaction(operation, {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (!retryable || attempt === maximumTransactionAttempts) {
        throw error;
      }
    }
  }

  throw new Error(
    "Eligibility synchronization transaction retry limit exceeded.",
  );
}

async function synchronizeProviderEvidence(
  transaction: Prisma.TransactionClient,
  batch: NormalizedEligibilityBatch,
  provider: DatabaseProvider,
  freshUntil: Date,
) {
  const userIds = new Map<string, string>();

  for (const controller of batch.controllers) {
    const user = await transaction.user.upsert({
      where: { cid: controller.cid },
      update: {},
      create: { cid: controller.cid },
      select: { id: true },
    });
    userIds.set(controller.cid, user.id);

    if (controller.displayName !== null) {
      await transaction.externalIdentity.upsert({
        where: {
          provider_subject: {
            provider: batch.provider,
            subject: controller.cid,
          },
        },
        update: {
          displayName: controller.displayName,
          lastSyncedAt: batch.fetchedAt,
          userId: user.id,
        },
        create: {
          provider: batch.provider,
          subject: controller.cid,
          displayName: controller.displayName,
          lastSyncedAt: batch.fetchedAt,
          userId: user.id,
        },
      });
    }

    await transaction.controllerEligibilitySnapshot.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        },
      },
      update: {
        rostered: controller.rostered,
        ratingCode: controller.rating?.code ?? null,
        ratingValue: controller.rating?.value ?? null,
        fetchedAt: batch.fetchedAt,
        freshUntil,
      },
      create: {
        userId: user.id,
        provider,
        rostered: controller.rostered,
        ratingCode: controller.rating?.code ?? null,
        ratingValue: controller.rating?.value ?? null,
        fetchedAt: batch.fetchedAt,
        freshUntil,
      },
    });
  }

  await transaction.controllerEligibilitySnapshot.deleteMany({
    where: {
      provider,
      ...(userIds.size === 0
        ? {}
        : { userId: { notIn: [...userIds.values()] } }),
    },
  });

  const endorsementKeys = new Map<string, Set<string>>();
  for (const controller of batch.controllers) {
    const userId = userIds.get(controller.cid);
    if (userId === undefined) {
      continue;
    }

    const controllerKeys = new Set<string>();
    for (const endorsement of controller.endorsements) {
      const key = sourceKey(endorsement.sourceKey);
      controllerKeys.add(key);
      await transaction.controllerEndorsement.upsert({
        where: {
          userId_provider_sourceKey: {
            userId,
            provider,
            sourceKey: key,
          },
        },
        update: {
          kind: endorsementKind(endorsement.kind),
          position: endorsement.position,
          rating: endorsement.rating,
          validFrom: endorsement.validFrom,
          validUntil: endorsement.validUntil,
          fetchedAt: batch.fetchedAt,
          freshUntil,
        },
        create: {
          userId,
          provider,
          sourceKey: key,
          kind: endorsementKind(endorsement.kind),
          position: endorsement.position,
          rating: endorsement.rating,
          validFrom: endorsement.validFrom,
          validUntil: endorsement.validUntil,
          fetchedAt: batch.fetchedAt,
          freshUntil,
        },
      });
    }
    endorsementKeys.set(userId, controllerKeys);
  }

  for (const [userId, keys] of endorsementKeys) {
    await transaction.controllerEndorsement.deleteMany({
      where: {
        userId,
        provider,
        ...(keys.size === 0
          ? {}
          : { sourceKey: { notIn: [...keys] } }),
      },
    });
  }
  await transaction.controllerEndorsement.deleteMany({
    where: {
      provider,
      ...(userIds.size === 0
        ? {}
        : { userId: { notIn: [...userIds.values()] } }),
    },
  });

  const callsigns = new Set<string>();
  for (const position of batch.positions) {
    callsigns.add(position.callsign);
    await transaction.knownControllerPosition.upsert({
      where: {
        provider_callsign: {
          provider,
          callsign: position.callsign,
        },
      },
      update: {
        name: position.name,
        frequency: position.frequency,
        fetchedAt: batch.fetchedAt,
        freshUntil,
      },
      create: {
        provider,
        callsign: position.callsign,
        name: position.name,
        frequency: position.frequency,
        fetchedAt: batch.fetchedAt,
        freshUntil,
      },
    });
  }
  await transaction.knownControllerPosition.deleteMany({
    where: {
      provider,
      ...(callsigns.size === 0
        ? {}
        : { callsign: { notIn: [...callsigns] } }),
    },
  });

  return userIds;
}

async function synchronizeControlCenterMemberships(
  transaction: Prisma.TransactionClient,
  batch: NormalizedEligibilityBatch,
  userIds: ReadonlyMap<string, string>,
  freshUntil: Date,
) {
  const requestedFirCodes = new Set(
    batch.controllers.flatMap((controller) =>
      controller.rostered ? controller.firIcaoCodes : [],
    ),
  );
  const firs = await transaction.fir.findMany({
    where: {
      active: true,
      icaoCode: { in: [...requestedFirCodes] },
    },
    select: { id: true, icaoCode: true },
  });
  const firIds = new Map(firs.map((fir) => [fir.icaoCode, fir.id]));
  const missingFirCodes = [...requestedFirCodes].filter(
    (icaoCode) => !firIds.has(icaoCode),
  );

  if (missingFirCodes.length > 0) {
    throw new EligibilityProviderError(
      "UNKNOWN_FIR",
      `Control Center returned unconfigured FIRs: ${missingFirCodes.join(", ")}.`,
      false,
    );
  }

  const desiredKeys = new Set<string>();
  let membershipsChanged = 0;

  for (const controller of batch.controllers) {
    if (!controller.rostered) {
      continue;
    }

    const userId = userIds.get(controller.cid);
    if (userId === undefined) {
      continue;
    }

    for (const icaoCode of controller.firIcaoCodes) {
      const firId = firIds.get(icaoCode);
      if (firId === undefined) {
        continue;
      }

      desiredKeys.add(`${userId}:${firId}`);
      const existing = await transaction.firMembership.findUnique({
        where: { userId_firId: { userId, firId } },
        select: {
          id: true,
          source: true,
          sourceProvider: true,
          status: true,
        },
      });

      if (existing?.source === "MANUAL") {
        continue;
      }

      if (
        existing === null ||
        existing.status !== "ACTIVE" ||
        existing.sourceProvider !== controlCenterSourceProvider
      ) {
        membershipsChanged += 1;
      }

      await transaction.firMembership.upsert({
        where: { userId_firId: { userId, firId } },
        update: {
          source: "AUTOMATIC",
          status: "ACTIVE",
          sourceProvider: controlCenterSourceProvider,
          providerFreshUntil: freshUntil,
          reason: null,
          changedByUserId: null,
          ...(existing?.status === "ACTIVE"
            ? {}
            : { activeSince: batch.fetchedAt }),
          revokedAt: null,
        },
        create: {
          userId,
          firId,
          source: "AUTOMATIC",
          status: "ACTIVE",
          sourceProvider: controlCenterSourceProvider,
          providerFreshUntil: freshUntil,
          activeSince: batch.fetchedAt,
        },
      });
    }
  }

  const existingAutomaticMemberships =
    await transaction.firMembership.findMany({
      where: {
        source: "AUTOMATIC",
        sourceProvider: controlCenterSourceProvider,
      },
      select: {
        id: true,
        firId: true,
        status: true,
        userId: true,
      },
    });

  for (const membership of existingAutomaticMemberships) {
    if (desiredKeys.has(`${membership.userId}:${membership.firId}`)) {
      continue;
    }

    if (membership.status === "ACTIVE") {
      membershipsChanged += 1;
    }
    await transaction.firMembership.update({
      where: { id: membership.id },
      data: {
        status: "REVOKED",
        providerFreshUntil: freshUntil,
        ...(membership.status === "ACTIVE"
          ? { revokedAt: batch.fetchedAt }
          : {}),
      },
    });
  }

  return membershipsChanged;
}

export class ControllerEligibilitySynchronization {
  readonly #clock: () => Date;
  readonly #database: PrismaClient;
  readonly #freshnessSeconds: number;
  readonly #providers: ReadonlyMap<
    EligibilityProviderKey,
    ControllerEligibilityProvider
  >;
  readonly #retryBaseSeconds: number;
  readonly #inFlight = new Map<
    EligibilityProviderKey,
    Promise<EligibilitySynchronizationResult>
  >();

  constructor(
    database: PrismaClient,
    providers: readonly ControllerEligibilityProvider[],
    {
      clock = () => new Date(),
      freshnessSeconds,
      retryBaseSeconds = 5 * 60,
    }: SynchronizationOptions,
  ) {
    this.#clock = clock;
    this.#database = database;
    this.#freshnessSeconds = freshnessSeconds;
    this.#providers = new Map(
      providers.map((provider) => [provider.key, provider]),
    );
    this.#retryBaseSeconds = retryBaseSeconds;
  }

  get configuredProviders() {
    return [...this.#providers.keys()];
  }

  sync(
    providerKey: EligibilityProviderKey,
    trigger: EligibilitySynchronizationTrigger,
  ) {
    const existing = this.#inFlight.get(providerKey);
    if (existing !== undefined) {
      return existing;
    }

    const operation = this.#synchronize(providerKey, trigger).finally(
      () => {
        this.#inFlight.delete(providerKey);
      },
    );
    this.#inFlight.set(providerKey, operation);
    return operation;
  }

  async syncAll(trigger: EligibilitySynchronizationTrigger) {
    return Promise.allSettled(
      this.configuredProviders.map((provider) =>
        this.sync(provider, trigger),
      ),
    );
  }

  async #synchronize(
    providerKey: EligibilityProviderKey,
    trigger: EligibilitySynchronizationTrigger,
  ): Promise<EligibilitySynchronizationResult> {
    const provider = this.#providers.get(providerKey);
    if (provider === undefined) {
      throw new Error(
        `Eligibility provider ${providerKey} is not configured.`,
      );
    }

    const providerValue = databaseProvider(providerKey);
    const startedAt = this.#clock();
    const run = await this.#database.eligibilitySyncRun.create({
      data: {
        provider: providerValue,
        trigger: databaseTrigger(trigger),
        status: "RUNNING",
        startedAt,
      },
      select: { id: true },
    });

    try {
      const batch = await provider.fetchEligibility();
      if (batch.provider !== providerKey) {
        throw new EligibilityProviderError(
          "PROVIDER_MISMATCH",
          `Eligibility provider ${providerKey} returned a ${batch.provider} batch.`,
          false,
        );
      }

      const freshUntil = new Date(
        batch.fetchedAt.valueOf() + this.#freshnessSeconds * 1000,
      );
      const membershipsChanged = await serializableTransaction(
        this.#database,
        async (transaction) => {
          const userIds = await synchronizeProviderEvidence(
            transaction,
            batch,
            providerValue,
            freshUntil,
          );
          const changed =
            providerKey === "control-center"
              ? await synchronizeControlCenterMemberships(
                  transaction,
                  batch,
                  userIds,
                  freshUntil,
                )
              : 0;

          await transaction.eligibilityProviderState.upsert({
            where: { provider: providerValue },
            update: {
              status: "SUCCEEDED",
              lastAttemptedAt: startedAt,
              lastSucceededAt: batch.fetchedAt,
              freshUntil,
              lastErrorCode: null,
              lastErrorMessage: null,
              consecutiveFailures: 0,
              recordsSeen: batch.controllers.length,
              nextRetryAt: null,
            },
            create: {
              provider: providerValue,
              status: "SUCCEEDED",
              lastAttemptedAt: startedAt,
              lastSucceededAt: batch.fetchedAt,
              freshUntil,
              recordsSeen: batch.controllers.length,
            },
          });
          await transaction.eligibilitySyncRun.update({
            where: { id: run.id },
            data: {
              status: "SUCCEEDED",
              completedAt: this.#clock(),
              fetchedAt: batch.fetchedAt,
              freshUntil,
              controllersSeen: batch.controllers.length,
              membershipsChanged: changed,
            },
          });

          return changed;
        },
      );

      return {
        controllersSeen: batch.controllers.length,
        freshUntil,
        membershipsChanged,
        provider: providerKey,
        runId: run.id,
      };
    } catch (error) {
      const failedAt = this.#clock();
      const previous = await this.#database.eligibilityProviderState.findUnique({
        where: { provider: providerValue },
        select: {
          consecutiveFailures: true,
          freshUntil: true,
          lastSucceededAt: true,
          recordsSeen: true,
        },
      });
      const failures = (previous?.consecutiveFailures ?? 0) + 1;
      const retryDelaySeconds = Math.min(
        this.#retryBaseSeconds * 2 ** (failures - 1),
        maximumRetryDelaySeconds,
      );
      const nextRetryAt = new Date(
        failedAt.valueOf() + retryDelaySeconds * 1000,
      );
      const code = errorCode(error);
      const message = boundedMessage(error);

      await this.#database.$transaction([
        this.#database.eligibilityProviderState.upsert({
          where: { provider: providerValue },
          update: {
            status: "FAILED",
            lastAttemptedAt: startedAt,
            lastErrorCode: code,
            lastErrorMessage: message,
            consecutiveFailures: failures,
            nextRetryAt,
          },
          create: {
            provider: providerValue,
            status: "FAILED",
            lastAttemptedAt: startedAt,
            lastErrorCode: code,
            lastErrorMessage: message,
            consecutiveFailures: failures,
            recordsSeen: previous?.recordsSeen ?? 0,
            lastSucceededAt: previous?.lastSucceededAt ?? null,
            freshUntil: previous?.freshUntil ?? null,
            nextRetryAt,
          },
        }),
        this.#database.eligibilitySyncRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            completedAt: failedAt,
            errorCode: code,
            errorMessage: message,
          },
        }),
      ]);

      throw error;
    }
  }
}
