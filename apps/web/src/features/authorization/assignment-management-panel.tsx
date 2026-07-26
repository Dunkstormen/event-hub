"use client";

import { useState } from "react";
import {
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react";

import type {
  AuthorizationOverview,
  AuthorizationRole,
  AuthorizationUser,
  EffectiveCapability,
} from "@event-hub/contracts";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { effectivePermissions } from "./effective-permissions";

type AuthorizationFir = AuthorizationOverview["firs"][number];

type AssignmentManagementPanelProps = Readonly<{
  firs: readonly AuthorizationFir[];
  hasNextPage: boolean;
  pending: boolean;
  roles: readonly AuthorizationRole[];
  users: readonly AuthorizationUser[];
  onAssign: (input: {
    userId: string;
    roleKey: string;
    firIcaoCode?: string;
  }) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onRevoke: (assignmentId: string) => Promise<void>;
  onSearch: (query: string) => Promise<void>;
}>;

function EffectivePermissionList({
  permissions,
}: Readonly<{ permissions: readonly EffectiveCapability[] }>) {
  if (permissions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No capabilities are effective for this user.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {permissions.map((permission) => (
        <Badge
          key={permission.capabilityKey}
          variant={permission.global ? "secondary" : "outline"}
        >
          {permission.capabilityKey}
          {permission.global
            ? " · Global"
            : ` · ${permission.firIcaoCodes.join(", ")}`}
        </Badge>
      ))}
    </div>
  );
}

export function AssignmentManagementPanel({
  firs,
  hasNextPage,
  pending,
  roles,
  users,
  onAssign,
  onLoadMore,
  onRevoke,
  onSearch,
}: AssignmentManagementPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(
    users[0]?.id ?? "",
  );
  const selectedUser =
    users.find((user) => user.id === selectedUserId) ?? users[0];
  const [selectedRoleKey, setSelectedRoleKey] = useState(
    roles[0]?.key ?? "",
  );
  const selectedRole =
    roles.find((role) => role.key === selectedRoleKey) ?? roles[0];
  const [selectedFirCode, setSelectedFirCode] = useState(
    firs.find((fir) => fir.active)?.icaoCode ?? firs[0]?.icaoCode ?? "",
  );

  const pendingAssignment =
    selectedRole === undefined
      ? undefined
      : {
          roleKey: selectedRole.key,
          ...(selectedRole.scope === "fir"
            ? { firIcaoCode: selectedFirCode }
            : {}),
        };
  const preview =
    selectedUser === undefined
      ? []
      : effectivePermissions(
          selectedUser.assignments,
          roles,
          pendingAssignment,
        );
  const canAssign =
    selectedUser !== undefined &&
    selectedRole !== undefined &&
    (selectedRole.scope === "global" || selectedFirCode !== "");
  const alreadyAssigned =
    selectedUser !== undefined &&
    selectedRole !== undefined &&
    selectedUser.assignments.some(
      (assignment) =>
        assignment.roleKey === selectedRole.key &&
        (selectedRole.scope === "global"
          ? assignment.fir === null
          : assignment.fir?.icaoCode === selectedFirCode),
    );

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    await onSearch(query.trim());
  }

  async function assignRole() {
    if (!canAssign || selectedUser === undefined || selectedRole === undefined) {
      return;
    }

    await onAssign({
      userId: selectedUser.id,
      roleKey: selectedRole.key,
      ...(selectedRole.scope === "fir"
        ? { firIcaoCode: selectedFirCode }
        : {}),
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Search by VATSIM CID or synchronized display name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submitSearch(event)}>
            <FieldGroup className="mb-3 flex-row gap-2">
              <Field>
                <FieldLabel
                  htmlFor="authorization-user-search"
                  className="sr-only"
                >
                  Search users
                </FieldLabel>
                <Input
                  id="authorization-user-search"
                  type="search"
                  value={query}
                  placeholder="CID or name"
                  disabled={pending}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="Search users"
                disabled={pending}
              >
                {pending ? <Spinner /> : <SearchIcon />}
              </Button>
            </FieldGroup>
          </form>

          <div className="flex flex-col gap-1">
            {users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No users match this search.
              </p>
            ) : (
              users.map((user) => (
                <Button
                  key={user.id}
                  variant={
                    selectedUser?.id === user.id ? "secondary" : "ghost"
                  }
                  className="h-auto min-h-12 justify-start px-3 py-2 text-left"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <UsersRoundIcon data-icon="inline-start" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      CID {user.cid} · {user.assignments.length} assignment
                      {user.assignments.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </Button>
              ))
            )}
          </div>
        </CardContent>
        {hasNextPage ? (
          <CardFooter>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={pending}
              onClick={() => void onLoadMore()}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Load more users
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {selectedUser === undefined ? (
        <Card>
          <CardHeader>
            <CardTitle>Select a user</CardTitle>
            <CardDescription>
              Choose a synchronized Event Hub user to manage assignments.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{selectedUser.displayName}</CardTitle>
              <CardDescription>
                CID {selectedUser.cid} ·{" "}
                {selectedUser.status === "active"
                  ? "Active account"
                  : "Disabled account"}
              </CardDescription>
              <CardAction>
                <Badge
                  variant={
                    selectedUser.status === "active"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {selectedUser.status}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="authorization-assignment-role">
                      Role
                    </FieldLabel>
                    <Select
                      value={selectedRole?.key}
                      onValueChange={(value) =>
                        setSelectedRoleKey(String(value))
                      }
                      items={roles.map((role) => ({
                        label: role.name,
                        value: role.key,
                      }))}
                      disabled={pending}
                    >
                      <SelectTrigger
                        id="authorization-assignment-role"
                        className="h-11 w-full"
                      >
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {roles.map((role) => (
                            <SelectItem key={role.key} value={role.key}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {selectedRole?.description ??
                        "Choose an access bundle."}
                    </FieldDescription>
                  </Field>

                  <Field data-disabled={selectedRole?.scope !== "fir"}>
                    <FieldLabel htmlFor="authorization-assignment-fir">
                      FIR scope
                    </FieldLabel>
                    <Select
                      value={selectedFirCode}
                      onValueChange={(value) =>
                        setSelectedFirCode(String(value))
                      }
                      items={firs.map((fir) => ({
                        label: `${fir.icaoCode} · ${fir.name}`,
                        value: fir.icaoCode,
                      }))}
                      disabled={selectedRole?.scope !== "fir" || pending}
                    >
                      <SelectTrigger
                        id="authorization-assignment-fir"
                        className="h-11 w-full"
                      >
                        <SelectValue
                          placeholder={
                            selectedRole?.scope === "fir"
                              ? "Select FIR"
                              : "Not required"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {firs.map((fir) => (
                            <SelectItem
                              key={fir.icaoCode}
                              value={fir.icaoCode}
                              disabled={!fir.active}
                            >
                              {fir.icaoCode} · {fir.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      FIR roles require an explicit canonical relation.
                    </FieldDescription>
                  </Field>
                </div>

                <FieldSet>
                  <FieldLegend>
                    Effective permissions after assignment
                  </FieldLegend>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <EffectivePermissionList permissions={preview} />
                  </div>
                </FieldSet>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      className="min-h-11"
                      disabled={!canAssign || alreadyAssigned || pending}
                    />
                  }
                >
                  <UserRoundPlusIcon data-icon="inline-start" />
                  {alreadyAssigned ? "Already assigned" : "Review assignment"}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia>
                      <ShieldCheckIcon />
                    </AlertDialogMedia>
                    <AlertDialogTitle>
                      Grant {selectedRole?.name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This grants the previewed capabilities to CID{" "}
                      {selectedUser.cid}
                      {selectedRole?.scope === "fir"
                        ? ` within ${selectedFirCode}`
                        : " globally"}
                      . The change will be recorded in the audit log.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void assignRole()}
                    >
                      Grant role
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current assignments</CardTitle>
              <CardDescription>
                Revoke access only after reviewing the effective grants above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedUser.assignments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This user has no role assignments.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedUser.assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{assignment.roleName}</p>
                        <p className="text-sm text-muted-foreground">
                          {assignment.fir === null
                            ? "Global scope"
                            : `${assignment.fir.icaoCode} · ${assignment.fir.name}`}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="destructive"
                              size="sm"
                              className="min-h-11"
                              disabled={pending}
                            />
                          }
                        >
                          <Trash2Icon data-icon="inline-start" />
                          Revoke
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogMedia>
                              <Trash2Icon />
                            </AlertDialogMedia>
                            <AlertDialogTitle>
                              Revoke {assignment.roleName}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Access is removed immediately. The API will reject
                              this change if it would remove the last active
                              administrator.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep assignment</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() =>
                                void onRevoke(assignment.id)
                              }
                            >
                              Revoke role
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
