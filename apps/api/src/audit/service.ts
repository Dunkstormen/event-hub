import { Prisma } from "@event-hub/database";

const auditActionPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const auditTargetKindPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const prohibitedSnapshotKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "clientsecret",
  "cookie",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "session",
  "sessionid",
  "token",
]);

export type AuditSnapshot = Prisma.InputJsonObject;

export type AppendAuditRecordInput = Readonly<{
  actorUserId: string;
  action: string;
  targetKind: string;
  targetKey: string;
  summary: string;
  beforeState?: AuditSnapshot;
  afterState?: AuditSnapshot;
}>;

export class AuditRecordInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditRecordInputError";
  }
}

function normalizedSnapshotKey(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

function assertSafeValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeValue(item, `${path}[${index}]`);
    });
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (prohibitedSnapshotKeys.has(normalizedSnapshotKey(key))) {
      throw new AuditRecordInputError(
        `Audit snapshots cannot include sensitive field ${path}.${key}.`,
      );
    }

    assertSafeValue(nestedValue, `${path}.${key}`);
  }
}

export function assertSafeAuditSnapshot(
  snapshot: AuditSnapshot,
  label = "snapshot",
) {
  assertSafeValue(snapshot, label);
}

function requiredText(value: string, label: string, maximum: number) {
  const normalized = value.trim();

  if (normalized === "" || normalized.length > maximum) {
    throw new AuditRecordInputError(
      `${label} must contain between 1 and ${maximum} characters.`,
    );
  }

  return normalized;
}

export async function appendAuditRecord(
  transaction: Prisma.TransactionClient,
  input: AppendAuditRecordInput,
) {
  const action = requiredText(input.action, "Audit action", 64);
  const targetKind = requiredText(
    input.targetKind,
    "Audit target kind",
    32,
  );

  if (!auditActionPattern.test(action)) {
    throw new AuditRecordInputError("Audit action format is invalid.");
  }

  if (!auditTargetKindPattern.test(targetKind)) {
    throw new AuditRecordInputError(
      "Audit target kind format is invalid.",
    );
  }

  if (input.beforeState !== undefined) {
    assertSafeAuditSnapshot(input.beforeState, "beforeState");
  }
  if (input.afterState !== undefined) {
    assertSafeAuditSnapshot(input.afterState, "afterState");
  }

  await transaction.auditRecord.create({
    data: {
      actorUserId: requiredText(input.actorUserId, "Audit actor", 30),
      action,
      targetKind,
      targetKey: requiredText(input.targetKey, "Audit target key", 191),
      summary: requiredText(input.summary, "Audit summary", 500),
      ...(input.beforeState === undefined
        ? {}
        : { beforeState: input.beforeState }),
      ...(input.afterState === undefined
        ? {}
        : { afterState: input.afterState }),
    },
  });
}
