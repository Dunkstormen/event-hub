import type { AuditRecord } from "@event-hub/contracts";
import { Prisma, type PrismaClient } from "@event-hub/database";

const vatsimIdentityProvider = "vatsim";

export type AuditRecordCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

export type AuditRecordFilters = Readonly<{
  query?: string;
  actorCid?: string;
  action?: string;
  targetKind?: string;
  from?: Date;
  to?: Date;
}>;

export interface AuditAdministration {
  list(
    filters: AuditRecordFilters,
    page: Readonly<{
      after?: AuditRecordCursor;
      limit: number;
    }>,
  ): Promise<{
    items: AuditRecord[];
    hasNextPage: boolean;
  }>;
}

function displayName(user: Readonly<{
  cid: string;
  identities: readonly Readonly<{ displayName: string }>[];
}>) {
  return user.identities[0]?.displayName ?? user.cid;
}

function mapSnapshot(value: Prisma.JsonValue | null) {
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object"
  ) {
    return null;
  }

  return value as AuditRecord["beforeState"];
}

export function createAuditAdministration(
  database: PrismaClient,
): AuditAdministration {
  return {
    async list(filters, page) {
      const conditions: Prisma.AuditRecordWhereInput[] = [];
      const query = filters.query?.trim();

      if (query !== undefined && query !== "") {
        conditions.push({
          OR: [
            { action: { contains: query } },
            { targetKey: { contains: query } },
            { summary: { contains: query } },
            { actor: { is: { cid: { contains: query } } } },
            {
              actor: {
                is: {
                  identities: {
                    some: {
                      provider: vatsimIdentityProvider,
                      displayName: { contains: query },
                    },
                  },
                },
              },
            },
          ],
        });
      }

      if (filters.actorCid !== undefined) {
        conditions.push({ actor: { is: { cid: filters.actorCid } } });
      }
      if (filters.action !== undefined) {
        conditions.push({ action: filters.action });
      }
      if (filters.targetKind !== undefined) {
        conditions.push({ targetKind: filters.targetKind });
      }
      if (filters.from !== undefined || filters.to !== undefined) {
        conditions.push({
          createdAt: {
            ...(filters.from === undefined ? {} : { gte: filters.from }),
            ...(filters.to === undefined ? {} : { lte: filters.to }),
          },
        });
      }
      if (page.after !== undefined) {
        conditions.push({
          OR: [
            { createdAt: { lt: page.after.createdAt } },
            {
              createdAt: page.after.createdAt,
              id: { lt: page.after.id },
            },
          ],
        });
      }

      const records = await database.auditRecord.findMany({
        ...(conditions.length === 0 ? {} : { where: { AND: conditions } }),
        include: {
          actor: {
            select: {
              cid: true,
              identities: {
                where: { provider: vatsimIdentityProvider },
                take: 1,
                select: { displayName: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
      });

      return {
        items: records.slice(0, page.limit).map((record) => ({
          id: record.id,
          action: record.action,
          actor: {
            cid: record.actor.cid,
            displayName: displayName(record.actor),
          },
          targetKind: record.targetKind,
          targetKey: record.targetKey,
          summary: record.summary,
          beforeState: mapSnapshot(record.beforeState),
          afterState: mapSnapshot(record.afterState),
          createdAt: record.createdAt.toISOString(),
        })),
        hasNextPage: records.length > page.limit,
      };
    },
  };
}
