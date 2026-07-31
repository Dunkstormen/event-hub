"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { AuditRecordsResponse } from "@event-hub/contracts";

import { FeedbackState } from "@/components/feedback-state";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  AuditLogViewer,
  emptyAuditFilters,
  type AuditFilters,
} from "./audit-log-viewer";

const auditPageSize = 25;

function messageForError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message} Reference: ${error.requestId}`;
  }

  return "The audit log request could not be completed.";
}

function auditPath(filters: AuditFilters, cursor?: string) {
  const parameters = new URLSearchParams({
    limit: String(auditPageSize),
  });

  if (filters.query.trim() !== "") {
    parameters.set("q", filters.query.trim());
  }
  if (filters.actorCid.trim() !== "") {
    parameters.set("actorCid", filters.actorCid.trim());
  }
  if (filters.action.trim() !== "") {
    parameters.set("action", filters.action.trim());
  }
  if (filters.targetKind !== "all") {
    parameters.set("targetKind", filters.targetKind);
  }
  if (filters.from !== "") {
    parameters.set("from", new Date(filters.from).toISOString());
  }
  if (filters.to !== "") {
    parameters.set("to", new Date(filters.to).toISOString());
  }
  if (cursor !== undefined) {
    parameters.set("cursor", cursor);
  }

  return `/v1/admin/audit?${parameters.toString()}`;
}

export function AuditLogManager() {
  const [page, setPage] = useState<AuditRecordsResponse>();
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters);
  const [initialError, setInitialError] = useState<unknown>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    void apiRequest<AuditRecordsResponse>(auditPath(emptyAuditFilters))
      .then((nextPage) => {
        if (active) {
          setPage(nextPage);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setInitialError(error);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function search(nextFilters: AuditFilters) {
    setPending(true);

    try {
      const nextPage = await apiRequest<AuditRecordsResponse>(
        auditPath(nextFilters),
      );
      setFilters(nextFilters);
      setPage(nextPage);
    } catch (error) {
      toast.error(messageForError(error));
    } finally {
      setPending(false);
    }
  }

  async function loadMore() {
    const cursor = page?.pageInfo.nextCursor;

    if (cursor === null || cursor === undefined) {
      return;
    }

    setPending(true);

    try {
      const nextPage = await apiRequest<AuditRecordsResponse>(
        auditPath(filters, cursor),
      );
      setPage((current) => ({
        items: [...(current?.items ?? []), ...nextPage.items],
        pageInfo: nextPage.pageInfo,
      }));
    } catch (error) {
      toast.error(messageForError(error));
    } finally {
      setPending(false);
    }
  }

  if (initialError !== undefined) {
    const forbidden =
      initialError instanceof ApiClientError &&
      initialError.status === 403;
    const unauthenticated =
      initialError instanceof ApiClientError &&
      initialError.status === 401;

    return (
      <FeedbackState
        kind="error"
        title={
          forbidden
            ? "Administrator access required"
            : unauthenticated
              ? "Sign in to continue"
              : "Audit log unavailable"
        }
        description={
          forbidden
            ? "Only administrators can inspect the application audit log."
            : messageForError(initialError)
        }
      />
    );
  }

  if (page === undefined) {
    return (
      <FeedbackState
        kind="loading"
        title="Loading audit records"
        description="Retrieving the latest security-sensitive changes."
      />
    );
  }

  return (
    <AuditLogViewer
      records={page.items}
      hasNextPage={page.pageInfo.hasNextPage}
      pending={pending}
      onSearch={search}
      onLoadMore={loadMore}
    />
  );
}
