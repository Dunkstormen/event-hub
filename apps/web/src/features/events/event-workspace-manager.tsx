"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";

import type { ManageableEventsResponse } from "@event-hub/contracts";

import { FeedbackState } from "@/components/feedback-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  EventWorkspace,
  EventWorkspaceLoading,
  type WorkspaceLifecycleFilter,
} from "./event-workspace";

const workspacePageSize = 25;

export function manageableEventsPath(
  query: string,
  lifecycle: WorkspaceLifecycleFilter,
  cursor?: string,
) {
  const parameters = new URLSearchParams({
    limit: String(workspacePageSize),
  });
  const normalizedQuery = query.trim();

  if (normalizedQuery !== "") {
    parameters.set("q", normalizedQuery);
  }
  if (lifecycle !== "all") {
    parameters.set("lifecycleState", lifecycle);
  }
  if (cursor !== undefined) {
    parameters.set("cursor", cursor);
  }

  return `/v1/events/manageable?${parameters.toString()}`;
}

function messageForError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message} Reference: ${error.requestId}`;
  }

  return "The event workspace request could not be completed.";
}

export function EventWorkspaceManager() {
  const [page, setPage] = useState<ManageableEventsResponse>();
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] =
    useState<WorkspaceLifecycleFilter>("all");
  const [initialError, setInitialError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void apiRequest<ManageableEventsResponse>(
      manageableEventsPath(deferredQuery, lifecycle),
      { signal: controller.signal },
    )
      .then((nextPage) => {
        if (active) {
          setPage(nextPage);
          setInitialError(undefined);
        }
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          setInitialError(error);
        }
      })
      .finally(() => {
        if (active) {
          setPending(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [deferredQuery, lifecycle, refreshKey]);

  async function loadMore() {
    const cursor = page?.pageInfo.nextCursor;

    if (cursor === null || cursor === undefined || pending) {
      return;
    }

    setPending(true);
    try {
      const nextPage = await apiRequest<ManageableEventsResponse>(
        manageableEventsPath(deferredQuery, lifecycle, cursor),
      );
      setPage((current) => ({
        items: [...(current?.items ?? []), ...nextPage.items],
        pageInfo: nextPage.pageInfo,
      }));
    } catch (error) {
      setInitialError(error);
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setPending(true);
    setQuery("");
    setLifecycle("all");
  }

  function retry() {
    setPending(true);
    setInitialError(undefined);
    setPage(undefined);
    setRefreshKey((current) => current + 1);
  }

  function changeQuery(nextQuery: string) {
    setPending(true);
    setQuery(nextQuery);
  }

  function changeLifecycle(nextLifecycle: WorkspaceLifecycleFilter) {
    setPending(true);
    setLifecycle(nextLifecycle);
  }

  if (initialError !== undefined) {
    const forbidden =
      initialError instanceof ApiClientError && initialError.status === 403;
    const unauthenticated =
      initialError instanceof ApiClientError && initialError.status === 401;

    return (
      <FeedbackState
        kind="error"
        title={
          forbidden
            ? "Coordinator access required"
            : unauthenticated
              ? "Sign in to continue"
              : "Event workspace unavailable"
        }
        description={
          forbidden
            ? "An active Event Coordinator assignment is required to manage events."
            : unauthenticated
              ? "Sign in with VATSIM Connect to view the events you can manage."
              : messageForError(initialError)
        }
        action={
          unauthenticated ? (
            <Link href="/sign-in" className={buttonVariants()}>
              Sign in
            </Link>
          ) : forbidden ? null : (
            <Button type="button" variant="destructive" onClick={retry}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  if (page === undefined) {
    return <EventWorkspaceLoading />;
  }

  return (
    <EventWorkspace
      events={page.items}
      hasNextPage={page.pageInfo.hasNextPage}
      lifecycle={lifecycle}
      pending={pending}
      query={query}
      onLifecycleChange={changeLifecycle}
      onLoadMore={() => void loadMore()}
      onQueryChange={changeQuery}
      onReset={reset}
    />
  );
}
