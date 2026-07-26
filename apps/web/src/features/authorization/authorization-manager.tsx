"use client";

import { useEffect, useState } from "react";
import {
  KeyRoundIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import type {
  AuthorizationAssignment,
  AuthorizationOverview,
  AuthorizationRole,
  AuthorizationUsersResponse,
  CreateAuthorizationRole,
  UpdateAuthorizationRole,
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
import { AssignmentManagementPanel } from "./assignment-management-panel";
import { AuthorizationAuditPanel } from "./authorization-audit-panel";
import { RoleManagementPanel } from "./role-management-panel";

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

  return `/v1/admin/authorization/users?${parameters.toString()}`;
}

function messageForError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message} Reference: ${error.requestId}`;
  }

  return "The authorization request could not be completed.";
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading access management">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <Skeleton className="h-[34rem] rounded-xl" />
    </div>
  );
}

export function AuthorizationManager() {
  const [overview, setOverview] = useState<AuthorizationOverview>();
  const [usersPage, setUsersPage] =
    useState<AuthorizationUsersResponse>();
  const [userQuery, setUserQuery] = useState("");
  const [initialError, setInitialError] = useState<unknown>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([
      apiRequest<AuthorizationOverview>(
        "/v1/admin/authorization",
      ),
      apiRequest<AuthorizationUsersResponse>(usersPath("")),
    ])
      .then(([nextOverview, nextUsers]) => {
        if (active) {
          setOverview(nextOverview);
          setUsersPage(nextUsers);
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
    const [nextOverview, nextUsers] = await Promise.all([
      apiRequest<AuthorizationOverview>(
        "/v1/admin/authorization",
      ),
      apiRequest<AuthorizationUsersResponse>(usersPath(query)),
    ]);

    setOverview(nextOverview);
    setUsersPage(nextUsers);
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
      const page = await apiRequest<AuthorizationUsersResponse>(
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
      const nextPage = await apiRequest<AuthorizationUsersResponse>(
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
              : "Access management is unavailable"
        }
        description={
          forbidden
            ? "Your current roles do not grant authorization management."
            : messageForError(initialError)
        }
      />
    );
  }

  if (overview === undefined || usersPage === undefined) {
    return <LoadingState />;
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>Security-sensitive workspace</AlertTitle>
        <AlertDescription>
          Every change is authorized by explicit capability, validated in a
          serializable transaction, and written to the audit log.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon />
              {overview.roles.length} roles
            </CardTitle>
            <CardDescription>
              {overview.roles.filter((role) => role.protected).length} protected
              defaults
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon />
              {overview.capabilities.length} capabilities
            </CardTitle>
            <CardDescription>
              Explicit grants replace role-name checks
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRoundIcon />
              {usersPage.items.length} users loaded
            </CardTitle>
            <CardDescription>
              Search and page through synchronized identities
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="roles">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-11"
        >
          <TabsTrigger value="roles">
            <KeyRoundIcon data-icon="inline-start" />
            Roles and capabilities
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <UsersRoundIcon data-icon="inline-start" />
            User assignments
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollTextIcon data-icon="inline-start" />
            Audit log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="pt-3">
          <RoleManagementPanel
            capabilities={overview.capabilities}
            roles={overview.roles}
            pending={pending}
            onCreate={(role: CreateAuthorizationRole) =>
              runMutation("Role created.", () =>
                apiRequest<AuthorizationRole>(
                  "/v1/admin/authorization/roles",
                  {
                    method: "POST",
                    body: JSON.stringify(role),
                  },
                ),
              )
            }
            onUpdate={(
              roleKey: string,
              role: UpdateAuthorizationRole,
            ) =>
              runMutation("Role updated.", () =>
                apiRequest<AuthorizationRole>(
                  `/v1/admin/authorization/roles/${roleKey}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify(role),
                  },
                ),
              )
            }
            onDelete={(roleKey: string) =>
              runMutation("Role deleted.", () =>
                apiRequest<void>(
                  `/v1/admin/authorization/roles/${roleKey}`,
                  { method: "DELETE" },
                ),
              )
            }
          />
        </TabsContent>

        <TabsContent value="assignments" className="pt-3">
          <AssignmentManagementPanel
            firs={overview.firs}
            roles={overview.roles}
            users={usersPage.items}
            hasNextPage={usersPage.pageInfo.hasNextPage}
            pending={pending}
            onSearch={searchUsers}
            onLoadMore={loadMoreUsers}
            onAssign={(input) =>
              runMutation("Role assigned.", () =>
                apiRequest<AuthorizationAssignment>(
                  `/v1/admin/authorization/users/${input.userId}/assignments`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      roleKey: input.roleKey,
                      ...(input.firIcaoCode === undefined
                        ? {}
                        : { firIcaoCode: input.firIcaoCode }),
                    }),
                  },
                ),
              ).then(() => undefined)
            }
            onRevoke={(assignmentId) =>
              runMutation("Role revoked.", () =>
                apiRequest<void>(
                  `/v1/admin/authorization/assignments/${assignmentId}`,
                  { method: "DELETE" },
                ),
              ).then(() => undefined)
            }
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-3">
          <AuthorizationAuditPanel
            records={overview.recentAuditRecords}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
