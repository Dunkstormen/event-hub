import { FormatRegistry, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  API_PREFIX,
  API_VERSION,
  AuditRecordSchema,
  AuditRecordsQuerySchema,
  AuthenticatedSessionSchema,
  AuthorizationOverviewSchema,
  CreateAuthorizationRoleSchema,
  AirportListResponseSchema,
  ApiErrorResponseSchema,
  DEFAULT_PAGE_SIZE,
  CreateEventDraftSchema,
  ManagedEventSchema,
  UpdateEventDraftSchema,
  FirMembershipSchema,
  FirSchema,
  HealthResponseSchema,
  IcaoCodeSchema,
  MAX_PAGE_SIZE,
  ManualFirMembershipChangeSchema,
  PaginationQuerySchema,
  VatsimCidSchema,
  listQuerySchema,
  paginatedResponseSchema,
} from "./index.js";

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(
        value,
      ) && !Number.isNaN(Date.parse(value)),
  );
}

describe("API contracts", () => {
  it("uses the v1 URL boundary", () => {
    expect(API_VERSION).toBe("v1");
    expect(API_PREFIX).toBe("/v1");
  });

  it("validates health responses at runtime", () => {
    expect(
      Value.Check(HealthResponseSchema, {
        status: "ok",
        service: "event-hub-api",
        version: "v1",
      }),
    ).toBe(true);
    expect(
      Value.Check(HealthResponseSchema, {
        status: "ok",
        service: "event-hub-api",
        version: "v2",
      }),
    ).toBe(false);
  });

  it("enforces the common error envelope", () => {
    expect(
      Value.Check(ApiErrorResponseSchema, {
        error: {
          code: "FORBIDDEN",
          message: "You cannot manage this event.",
          requestId: "request-123",
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(ApiErrorResponseSchema, {
        code: "FORBIDDEN",
        message: "The envelope is missing.",
      }),
    ).toBe(false);
  });

  it("exposes normalized session identities without provider payloads", () => {
    expect(Value.Check(VatsimCidSchema, "1234567")).toBe(true);
    expect(Value.Check(VatsimCidSchema, "vatsim-123")).toBe(false);
    expect(
      Value.Check(AuthenticatedSessionSchema, {
        user: {
          cid: "1234567",
          displayName: "Ada Lovelace",
        },
        expiresAt: "2026-07-25T13:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(AuthenticatedSessionSchema, {
        user: {
          cid: "1234567",
          displayName: "Ada Lovelace",
          providerPayload: { id: 1234567 },
        },
        expiresAt: "2026-07-25T13:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("defines administrator role and permission-matrix contracts", () => {
    expect(
      Value.Check(CreateAuthorizationRoleSchema, {
        key: "event-planner",
        name: "Event Planner",
        description: "Plans events for one FIR.",
        scope: "fir",
        capabilityKeys: ["events.manage"],
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateAuthorizationRoleSchema, {
        key: "Event Planner",
        name: "Event Planner",
        description: "Plans events for one FIR.",
        scope: "fir",
        capabilityKeys: ["events.manage"],
      }),
    ).toBe(false);
    expect(
      Value.Check(AuthorizationOverviewSchema, {
        capabilities: [
          {
            key: "events.manage",
            name: "Manage events",
            description: "Manage events in scope.",
            scope: "global-or-fir",
          },
        ],
        roles: [],
        firs: [
          {
            icaoCode: "EKDK",
            name: "Copenhagen FIR",
            active: true,
          },
        ],
        recentAuditRecords: [],
      }),
    ).toBe(true);
  });

  it("defines complete filterable audit records", () => {
    expect(
      Value.Check(AuditRecordSchema, {
        id: "audit-1",
        action: "authorization.role.updated",
        actor: {
          cid: "10000001",
          displayName: "Ada Administrator",
        },
        targetKind: "role",
        targetKey: "event-coordinator",
        summary: "Updated role Event Coordinator.",
        beforeState: { capabilityKeys: ["events.manage"] },
        afterState: {
          capabilityKeys: ["events.manage", "rosters.manage"],
        },
        createdAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(AuditRecordsQuerySchema, {
        actorCid: "10000001",
        targetKind: "fir-membership",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-31T23:59:59.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(AuditRecordsQuerySchema, {
        targetKind: "FIR membership",
      }),
    ).toBe(false);
  });

  it("defines FIR membership provenance and manual reason contracts", () => {
    expect(
      Value.Check(FirMembershipSchema, {
        id: "membership-1",
        fir: {
          icaoCode: "EKDK",
          name: "Copenhagen FIR",
          active: true,
        },
        source: "manual",
        status: "active",
        sourceProvider: null,
        providerFreshUntil: null,
        reason: "Control Center is temporarily unavailable.",
        changedBy: {
          cid: "1000001",
          displayName: "Alex Administrator",
        },
        activeSince: "2026-07-26T10:00:00.000Z",
        revokedAt: null,
        updatedAt: "2026-07-26T10:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      Value.Check(ManualFirMembershipChangeSchema, {
        reason: "ok",
      }),
    ).toBe(false);
    expect(
      Value.Check(ManualFirMembershipChangeSchema, {
        reason: "Verified by the training team.",
      }),
    ).toBe(true);
  });

  it("defines bounded cursor pagination", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(Value.Check(PaginationQuerySchema, { limit: 100 })).toBe(true);
    expect(Value.Check(PaginationQuerySchema, { limit: 101 })).toBe(false);
  });

  it("rejects filters outside an endpoint allowlist", () => {
    const schema = listQuerySchema({
      status: Type.Optional(
        Type.Union([Type.Literal("published"), Type.Literal("cancelled")]),
      ),
    });

    expect(Value.Check(schema, { status: "published" })).toBe(true);
    expect(Value.Check(schema, { status: "draft" })).toBe(false);
    expect(Value.Check(schema, { owner: "EKDK" })).toBe(false);
  });

  it("creates typed paginated response schemas", () => {
    const schema = paginatedResponseSchema(
      Type.Object({ id: Type.String() }, { additionalProperties: false }),
    );

    expect(
      Value.Check(schema, {
        items: [{ id: "event-1" }],
        pageInfo: {
          hasNextPage: false,
          nextCursor: null,
        },
      }),
    ).toBe(true);
  });

  it("accepts only canonical uppercase ICAO codes", () => {
    expect(Value.Check(IcaoCodeSchema, "EKDK")).toBe(true);
    expect(Value.Check(IcaoCodeSchema, "ekdk")).toBe(false);
    expect(Value.Check(IcaoCodeSchema, "EKD")).toBe(false);
    expect(
      Value.Check(FirSchema, {
        icaoCode: "EKDK",
        name: "Copenhagen FIR",
        active: true,
      }),
    ).toBe(true);
  });

  it("describes airport lookup results with their FIR", () => {
    expect(
      Value.Check(AirportListResponseSchema, {
        items: [
          {
            icaoCode: "EKCH",
            name: "Copenhagen/Kastrup",
            active: true,
            fir: {
              icaoCode: "EKDK",
              name: "Copenhagen FIR",
            },
          },
        ],
        pageInfo: {
          hasNextPage: false,
          nextCursor: null,
        },
      }),
    ).toBe(true);
  });

  it("defines versioned event-management requests and responses", () => {
    expect(
      Value.Check(CreateEventDraftSchema, {
        name: "Cross the Pond Nordic",
        shortDescription: "An evening of Nordic traffic.",
        description: "Fly between participating Nordic airports.",
        rosteringType: "open-interest",
        localStart: "2026-08-15T18:00:00",
        localEnd: "2026-08-15T22:00:00",
        timeZone: "Europe/Copenhagen",
        participatingFirIcaoCodes: ["EFIN"],
        participatingAirportIcaoCodes: ["EKCH"],
      }),
    ).toBe(true);
    expect(
      Value.Check(UpdateEventDraftSchema, { expectedVersion: 2 }),
    ).toBe(false);
    expect(
      Value.Check(UpdateEventDraftSchema, {
        expectedVersion: 2,
        name: "Updated event",
        participatingFirIcaoCodes: ["EKDK", "EFIN"],
        participatingAirportIcaoCodes: ["EKCH", "EFHK"],
      }),
    ).toBe(true);
    expect(
      Value.Check(ManagedEventSchema, {
        id: "event-1",
        name: "Cross the Pond Nordic",
        shortDescription: "An evening of Nordic traffic.",
        description: "Fly between participating Nordic airports.",
        bannerStorageKey: null,
        rosteringType: "open-interest",
        lifecycleState: "draft",
        cancellationReason: null,
        schedule: {
          localStart: "2026-08-15T18:00:00",
          localEnd: "2026-08-15T22:00:00",
          timeZone: "Europe/Copenhagen",
          startInstant: "2026-08-15T16:00:00Z",
          endInstant: "2026-08-15T20:00:00Z",
        },
        ownerFir: {
          icaoCode: "EKDK",
          name: "Copenhagen FIR",
          active: true,
        },
        participatingFirs: [],
        participatingAirports: [],
        createdBy: { id: "user-1", cid: "10000001" },
        managementRole: "owner",
        permissions: {
          edit: true,
          transferOwnership: true,
          delete: true,
        },
        version: 1,
        createdAt: "2026-07-31T12:00:00.000Z",
        updatedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toBe(true);
  });
});
