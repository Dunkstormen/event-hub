"use client";

import { useEffect, useState } from "react";
import {
  DatabaseZapIcon,
  RefreshCwIcon,
  MapPinnedIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  UserRoundCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import type {
  ControllerEligibilityProvider,
  ControllerEligibilityStatus,
  FirMembership,
  FirMembershipOverview,
  FirMembershipUsersResponse,
} from "@event-hub/contracts";

import { FeedbackState } from "@/components/feedback-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { FirMembershipAuditPanel } from "./fir-membership-audit-panel";
import { FirMembershipManagementPanel } from "./fir-membership-management-panel";
import { ControllerEligibilityPanel } from "./controller-eligibility-panel";

const initialUserPageSize = 25;

function usersPath(query: string, cursor?: string) {
  const parameters = new URLSearchParams({
    limit: String(initialUserPageSize),
  });

  if (query !== "") {
    parameters.set("q", query);
  }

  if (cursor !== undefined) {
    parameters.set("cursor", cursor);
  }

  return `/v1/admin/fir-memberships/users?${parameters.toString()}`;
}

function membershipPath(userId: string, firIcaoCode: string) {
  return `/v1/admin/fir-memberships/users/${encodeURIComponent(userId)}/firs/${encodeURIComponent(firIcaoCode)}`;
}

function messageForError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message} Reference: ${error.requestId}`;
  }

  return "The FIR membership request could not be completed.";
}

function LoadingState() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-label="Loading FIR membership management"
    >
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <Skeleton className="h-[38rem] rounded-xl" />
    </div>
  );
}

export function FirMembershipManager() {
  const [overview, setOverview] = useState<FirMembershipOverview>();
  const [usersPage, setUsersPage] =
    useState<FirMembershipUsersResponse>();
  const [eligibilityStatus, setEligibilityStatus] =
    useState<ControllerEligibilityStatus>();
  const [userQuery, setUserQuery] = useState("");
  const [initialError, setInitialError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<ControllerEligibilityProvider | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      apiRequest<FirMembershipOverview>("/v1/admin/fir-memberships"),
      apiRequest<FirMembershipUsersResponse>(usersPath("")),
      apiRequest<ControllerEligibilityStatus>(
        "/v1/admin/controller-eligibility",
      ),
    ])
      .then(([nextOverview, nextUsers, nextEligibilityStatus]) => {
        if (active) {
          setOverview(nextOverview);
          setUsersPage(nextUsers);
          setEligibilityStatus(nextEligibilityStatus);
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

  async function refresh(query = userQuery) {
    const [nextOverview, nextUsers, nextEligibilityStatus] =
      await Promise.all([
      apiRequest<FirMembershipOverview>("/v1/admin/fir-memberships"),
      apiRequest<FirMembershipUsersResponse>(usersPath(query)),
        apiRequest<ControllerEligibilityStatus>(
          "/v1/admin/controller-eligibility",
        ),
      ]);

    setOverview(nextOverview);
    setUsersPage(nextUsers);
    setEligibilityStatus(nextEligibilityStatus);
  }

  async function runMutation(
    successMessage: string,
    operation: () => Promise<unknown>,
  ) {
    setPending(true);

    try {
      await operation();
      await refresh();
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(messageForError(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function searchUsers(query: string) {
    setPending(true);

    try {
      const page = await apiRequest<FirMembershipUsersResponse>(
        usersPath(query),
      );
      setUserQuery(query);
      setUsersPage(page);
    } catch (error) {
      toast.error(messageForError(error));
    } finally {
      setPending(false);
    }
  }

  async function loadMoreUsers() {
    const cursor = usersPage?.pageInfo.nextCursor;

    if (cursor === null || cursor === undefined) {
      return;
    }

    setPending(true);

    try {
      const nextPage = await apiRequest<FirMembershipUsersResponse>(
        usersPath(userQuery, cursor),
      );
      setUsersPage((current) => {
        const users = new Map(
          [...(current?.items ?? []), ...nextPage.items].map((user) => [
            user.id,
            user,
          ]),
        );

        return {
          items: [...users.values()],
          pageInfo: nextPage.pageInfo,
        };
      });
    } catch (error) {
      toast.error(messageForError(error));
    } finally {
      setPending(false);
    }
  }

  async function synchronizeProvider(
    provider: ControllerEligibilityProvider,
  ) {
    setPendingProvider(provider);

    try {
      await apiRequest(
        `/v1/admin/controller-eligibility/${encodeURIComponent(provider)}/sync`,
        { method: "POST" },
      );
      const nextStatus = await apiRequest<ControllerEligibilityStatus>(
        "/v1/admin/controller-eligibility",
      );
      setEligibilityStatus(nextStatus);
      await refresh();
      toast.success(
        `${provider === "control-center" ? "Control Center" : "VATEUD"} synchronization completed.`,
      );
    } catch (error) {
      toast.error(messageForError(error));
      const nextStatus = await apiRequest<ControllerEligibilityStatus>(
        "/v1/admin/controller-eligibility",
      ).catch(() => undefined);
      if (nextStatus !== undefined) {
        setEligibilityStatus(nextStatus);
      }
    } finally {
      setPendingProvider(null);
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
            ? "Membership manager access required"
            : unauthenticated
              ? "Sign in to continue"
              : "FIR membership management is unavailable"
        }
        description={
          forbidden
            ? "Your current roles do not grant FIR membership management."
            : messageForError(initialError)
        }
      />
    );
  }

  if (
    overview === undefined ||
    usersPage === undefined ||
    eligibilityStatus === undefined
  ) {
    return <LoadingState />;
  }

  const memberships = usersPage.items.flatMap(
    (user) => user.memberships,
  );
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );
  const manualMemberships = activeMemberships.filter(
    (membership) => membership.source === "manual",
  );

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>Audited manual fallback</AlertTitle>
        <AlertDescription>
          Use manual membership only when automatic controller eligibility is
          unavailable or needs an explicit override. Every change requires a
          reason and takes effect on the next authorization check.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundCheckIcon />
              {activeMemberships.length} active memberships
            </CardTitle>
            <CardDescription>
              Across the {usersPage.items.length} users currently loaded
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZapIcon />
              {manualMemberships.length} manual fallbacks
            </CardTitle>
            <CardDescription>
              Distinguished from provider-synchronized eligibility
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinnedIcon />
              {overview.firs.filter((fir) => fir.active).length} active FIRs
            </CardTitle>
            <CardDescription>
              Explicit configured relations only
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="memberships">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-11"
        >
          <TabsTrigger value="memberships">
            <UsersRoundIcon data-icon="inline-start" />
            Memberships
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollTextIcon data-icon="inline-start" />
            Audit<span className="hidden sm:inline"> history</span>
          </TabsTrigger>
          <TabsTrigger value="providers">
            <RefreshCwIcon data-icon="inline-start" />
            <span className="hidden sm:inline">Provider </span>sync
          </TabsTrigger>
        </TabsList>

        <TabsContent value="memberships" className="pt-3">
          <FirMembershipManagementPanel
            firs={overview.firs}
            users={usersPage.items}
            hasNextPage={usersPage.pageInfo.hasNextPage}
            pending={pending}
            onSearch={searchUsers}
            onLoadMore={loadMoreUsers}
            onAssign={(input) =>
              runMutation("FIR membership assigned.", () =>
                apiRequest<FirMembership>(
                  membershipPath(input.userId, input.firIcaoCode),
                  {
                    method: "PUT",
                    body: JSON.stringify({ reason: input.reason }),
                  },
                ),
              )
            }
            onRevoke={(input) =>
              runMutation("FIR membership revoked.", () =>
                apiRequest<FirMembership>(
                  membershipPath(input.userId, input.firIcaoCode),
                  {
                    method: "DELETE",
                    body: JSON.stringify({ reason: input.reason }),
                  },
                ),
              )
            }
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-3">
          <FirMembershipAuditPanel
            records={overview.recentAuditRecords}
          />
        </TabsContent>

        <TabsContent value="providers" className="pt-3">
          <ControllerEligibilityPanel
            status={eligibilityStatus}
            pendingProvider={pendingProvider}
            onSynchronize={synchronizeProvider}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
