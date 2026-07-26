"use client";

import { useState } from "react";
import {
  BadgeCheckIcon,
  CircleOffIcon,
  MapPinnedIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react";

import type {
  FirMembership,
  FirMembershipOverview,
  FirMembershipUser,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { Textarea } from "@/components/ui/textarea";

type MembershipFir = FirMembershipOverview["firs"][number];

type FirMembershipManagementPanelProps = Readonly<{
  firs: readonly MembershipFir[];
  hasNextPage: boolean;
  pending: boolean;
  users: readonly FirMembershipUser[];
  onAssign: (input: {
    userId: string;
    firIcaoCode: string;
    reason: string;
  }) => Promise<boolean>;
  onLoadMore: () => Promise<void>;
  onRevoke: (input: {
    userId: string;
    firIcaoCode: string;
    reason: string;
  }) => Promise<boolean>;
  onSearch: (query: string) => Promise<void>;
}>;

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function RevokeMembershipDialog({
  membership,
  pending,
  user,
  onRevoke,
}: Readonly<{
  membership: FirMembership;
  pending: boolean;
  user: FirMembershipUser;
  onRevoke: FirMembershipManagementPanelProps["onRevoke"];
}>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const validReason = reason.trim().length >= 3;

  async function revoke() {
    if (!validReason) {
      return;
    }

    const changed = await onRevoke({
      userId: user.id,
      firIcaoCode: membership.fir.icaoCode,
      reason: reason.trim(),
    });

    if (changed) {
      setReason("");
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
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
        <CircleOffIcon data-icon="inline-start" />
        Revoke
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CircleOffIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Revoke {membership.fir.icaoCode} membership?
          </AlertDialogTitle>
          <AlertDialogDescription>
            CID {user.cid} loses this active membership on the next
            authorization check. The reason and administrator are retained in
            the audit history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`revoke-${membership.id}-reason`}>
            Revocation reason
          </FieldLabel>
          <Textarea
            id={`revoke-${membership.id}-reason`}
            value={reason}
            minLength={3}
            maxLength={500}
            rows={3}
            placeholder="Why is this manual membership being revoked?"
            disabled={pending}
            onChange={(event) => setReason(event.target.value)}
          />
          <FieldDescription>
            Required for the permanent audit record.
          </FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Keep membership
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!validReason || pending}
            onClick={() => void revoke()}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Revoke membership
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MembershipRecord({
  membership,
  pending,
  user,
  onRevoke,
}: Readonly<{
  membership: FirMembership;
  pending: boolean;
  user: FirMembershipUser;
  onRevoke: FirMembershipManagementPanelProps["onRevoke"];
}>) {
  const active = membership.status === "active";
  const manual = membership.source === "manual";

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-base font-medium">
            {membership.fir.icaoCode} · {membership.fir.name}
          </p>
          <Badge variant={active ? "secondary" : "destructive"}>
            {active ? "Active" : "Revoked"}
          </Badge>
          <Badge variant="outline">
            {manual ? "Manual fallback" : "Automatic"}
          </Badge>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">
              {manual ? "Reason" : "Provider"}
            </dt>
            <dd className="mt-0.5 break-words">
              {manual
                ? membership.reason
                : membership.sourceProvider}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last changed by</dt>
            <dd className="mt-0.5">
              {membership.changedBy === null
                ? "Automatic synchronization"
                : `${membership.changedBy.displayName} · CID ${membership.changedBy.cid}`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active since</dt>
            <dd className="mt-0.5">
              {timestampFormatter.format(
                new Date(membership.activeSince),
              )}{" "}
              UTC
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {membership.revokedAt === null ? "Last updated" : "Revoked"}
            </dt>
            <dd className="mt-0.5">
              {timestampFormatter.format(
                new Date(
                  membership.revokedAt ?? membership.updatedAt,
                ),
              )}{" "}
              UTC
            </dd>
          </div>
        </dl>
      </div>
      {active ? (
        <RevokeMembershipDialog
          membership={membership}
          pending={pending}
          user={user}
          onRevoke={onRevoke}
        />
      ) : null}
    </div>
  );
}

export function FirMembershipManagementPanel({
  firs,
  hasNextPage,
  pending,
  users,
  onAssign,
  onLoadMore,
  onRevoke,
  onSearch,
}: FirMembershipManagementPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(
    users[0]?.id ?? "",
  );
  const selectedUser =
    users.find((user) => user.id === selectedUserId) ?? users[0];
  const activeFirs = firs.filter((fir) => fir.active);
  const [selectedFirCode, setSelectedFirCode] = useState(
    activeFirs[0]?.icaoCode ?? "",
  );
  const selectedFir =
    activeFirs.find((fir) => fir.icaoCode === selectedFirCode) ??
    activeFirs[0];
  const [reason, setReason] = useState("");
  const selectedMembership = selectedUser?.memberships.find(
    (membership) =>
      membership.fir.icaoCode === selectedFir?.icaoCode,
  );
  const validReason = reason.trim().length >= 3;
  const alreadyManual =
    selectedMembership?.status === "active" &&
    selectedMembership.source === "manual";
  const canAssign =
    selectedUser !== undefined &&
    selectedFir !== undefined &&
    validReason &&
    !alreadyManual;
  const operation =
    selectedMembership === undefined
      ? "assign"
      : selectedMembership.status === "revoked"
        ? "reactivate"
        : "override";

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    await onSearch(query.trim());
  }

  async function assignMembership() {
    if (!canAssign || selectedUser === undefined || selectedFir === undefined) {
      return;
    }

    const changed = await onAssign({
      userId: selectedUser.id,
      firIcaoCode: selectedFir.icaoCode,
      reason: reason.trim(),
    });

    if (changed) {
      setReason("");
    }
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
                  htmlFor="fir-membership-user-search"
                  className="sr-only"
                >
                  Search users
                </FieldLabel>
                <Input
                  id="fir-membership-user-search"
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
              <Empty className="border py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersRoundIcon />
                  </EmptyMedia>
                  <EmptyTitle>No matching users</EmptyTitle>
                  <EmptyDescription>
                    Try another CID or synchronized display name.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              users.map((user) => {
                const activeCount = user.memberships.filter(
                  (membership) => membership.status === "active",
                ).length;

                return (
                  <Button
                    key={user.id}
                    variant={
                      selectedUser?.id === user.id
                        ? "secondary"
                        : "ghost"
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
                        CID {user.cid} · {activeCount} active FIR
                        {activeCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Button>
                );
              })
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
              Choose a synchronized Event Hub user to manage FIR memberships.
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
                    <FieldLabel htmlFor="fir-membership-fir">
                      FIR
                    </FieldLabel>
                    <Select
                      value={selectedFir?.icaoCode}
                      onValueChange={(value) =>
                        setSelectedFirCode(String(value))
                      }
                      items={activeFirs.map((fir) => ({
                        label: `${fir.icaoCode} · ${fir.name}`,
                        value: fir.icaoCode,
                      }))}
                      disabled={pending}
                    >
                      <SelectTrigger
                        id="fir-membership-fir"
                        className="h-11 w-full"
                      >
                        <SelectValue placeholder="Select FIR" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {activeFirs.map((fir) => (
                            <SelectItem
                              key={fir.icaoCode}
                              value={fir.icaoCode}
                            >
                              {fir.icaoCode} · {fir.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Only configured active FIRs can receive a manual
                      membership.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="fir-membership-reason">
                      Manual reason
                    </FieldLabel>
                    <Textarea
                      id="fir-membership-reason"
                      value={reason}
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      placeholder="Why is manual access required?"
                      disabled={pending || alreadyManual}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <FieldDescription>
                      Required and retained with the administrator identity.
                    </FieldDescription>
                  </Field>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <MapPinnedIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">
                        {selectedFir === undefined
                          ? "No active FIR available"
                          : alreadyManual
                            ? `${selectedFir.icaoCode} already has an active manual membership`
                            : operation === "override"
                              ? `Replace the automatic ${selectedFir.icaoCode} membership with a manual fallback`
                              : operation === "reactivate"
                                ? `Reactivate the ${selectedFir.icaoCode} membership manually`
                                : `Assign ${selectedFir.icaoCode} manually`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {operation === "override"
                          ? "The previous provider provenance remains visible in the audit record."
                          : "The change takes effect on the next authorization check."}
                      </p>
                    </div>
                  </div>
                </div>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      className="min-h-11"
                      disabled={!canAssign || pending}
                    />
                  }
                >
                  <UserRoundPlusIcon data-icon="inline-start" />
                  {alreadyManual
                    ? "Already active"
                    : operation === "override"
                      ? "Review manual override"
                      : operation === "reactivate"
                        ? "Review reactivation"
                        : "Review membership"}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia>
                      <ShieldCheckIcon />
                    </AlertDialogMedia>
                    <AlertDialogTitle>
                      {operation === "override"
                        ? "Apply manual override?"
                        : operation === "reactivate"
                          ? "Reactivate FIR membership?"
                          : "Assign FIR membership?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      CID {selectedUser.cid} will have an active{" "}
                      {selectedFir?.icaoCode} membership. This is recorded as a
                      manual administrator decision with the supplied reason.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Audit reason</p>
                    <p className="mt-1 break-words text-muted-foreground">
                      {reason.trim()}
                    </p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!canAssign || pending}
                      onClick={() => void assignMembership()}
                    >
                      {pending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <BadgeCheckIcon data-icon="inline-start" />
                      )}
                      Confirm membership
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membership history</CardTitle>
              <CardDescription>
                Current state and provenance for every FIR previously linked to
                this user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedUser.memberships.length === 0 ? (
                <Empty className="border py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MapPinnedIcon />
                    </EmptyMedia>
                    <EmptyTitle>No FIR memberships</EmptyTitle>
                    <EmptyDescription>
                      This user has no automatic or manual membership records.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedUser.memberships.map((membership) => (
                    <MembershipRecord
                      key={membership.id}
                      membership={membership}
                      pending={pending}
                      user={selectedUser}
                      onRevoke={onRevoke}
                    />
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
