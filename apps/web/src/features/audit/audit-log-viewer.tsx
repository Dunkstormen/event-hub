"use client";

import { useState, type FormEvent } from "react";
import {
  EyeIcon,
  FilterIcon,
  LoaderCircleIcon,
  ScrollTextIcon,
  SearchIcon,
} from "lucide-react";

import type { AuditRecord } from "@event-hub/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AuditFilters = Readonly<{
  query: string;
  actorCid: string;
  action: string;
  targetKind: string;
  from: string;
  to: string;
}>;

export const emptyAuditFilters: AuditFilters = {
  query: "",
  actorCid: "",
  action: "",
  targetKind: "all",
  from: "",
  to: "",
};

const targetKinds = [
  { value: "all", label: "All targets" },
  { value: "role", label: "Roles" },
  { value: "user", label: "Users and assignments" },
  { value: "fir-membership", label: "FIR memberships" },
  { value: "event", label: "Events" },
  { value: "eligibility-override", label: "Eligibility overrides" },
  { value: "roster-assignment", label: "Roster assignments" },
  { value: "settings", label: "Settings" },
] as const;

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

function actionLabel(action: string) {
  return action
    .split(".")
    .map((part) => part.replaceAll("-", " "))
    .join(" · ");
}

function StateSnapshot({
  label,
  value,
}: Readonly<{
  label: string;
  value: AuditRecord["beforeState"];
}>) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      {value === null ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          No state recorded.
        </p>
      ) : (
        <pre className="max-w-full overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
  );
}

function RecordDetails({ record }: Readonly<{ record: AuditRecord }>) {
  return (
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
      <SheetHeader className="pr-12">
        <SheetTitle>Audit record</SheetTitle>
        <SheetDescription>
          Immutable evidence for {actionLabel(record.action)}.
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{actionLabel(record.action)}</Badge>
          <Badge variant="secondary">{record.targetKind}</Badge>
        </div>
        <p className="text-base leading-relaxed">{record.summary}</p>
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Actor
            </dt>
            <dd>
              {record.actor.displayName}
              <span className="block font-mono text-xs text-muted-foreground">
                CID {record.actor.cid}
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Recorded at
            </dt>
            <dd className="tabular-nums">
              {timestampFormatter.format(new Date(record.createdAt))} UTC
            </dd>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">
              Target
            </dt>
            <dd className="break-all font-mono text-xs">
              {record.targetKind}:{record.targetKey}
            </dd>
          </div>
        </dl>
        <StateSnapshot label="Before" value={record.beforeState} />
        <StateSnapshot label="After" value={record.afterState} />
      </div>
    </SheetContent>
  );
}

type AuditLogViewerProps = Readonly<{
  records: readonly AuditRecord[];
  hasNextPage: boolean;
  pending: boolean;
  onSearch: (filters: AuditFilters) => Promise<void>;
  onLoadMore: () => Promise<void>;
}>;

export function AuditLogViewer({
  records,
  hasNextPage,
  pending,
  onSearch,
  onLoadMore,
}: AuditLogViewerProps) {
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters);
  const [selected, setSelected] = useState<AuditRecord>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSearch(draft);
  }

  function reset() {
    setDraft(emptyAuditFilters);
    void onSearch(emptyAuditFilters);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <form onSubmit={submit}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilterIcon />
              Filter records
            </CardTitle>
            <CardDescription>
              Search evidence or narrow by actor, action, target, and local time.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
              <Label htmlFor="audit-query">Search</Label>
              <Input
                id="audit-query"
                className="h-11"
                placeholder="Summary, target, action, or actor"
                value={draft.query}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audit-actor">Actor CID</Label>
              <Input
                id="audit-actor"
                className="h-11"
                inputMode="numeric"
                placeholder="10000001"
                value={draft.actorCid}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    actorCid: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audit-action">Exact action</Label>
              <Input
                id="audit-action"
                className="h-11"
                placeholder="authorization.role.updated"
                value={draft.action}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audit-target-kind">Target kind</Label>
              <Select
                value={draft.targetKind}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    targetKind: String(value),
                  }))
                }
                items={targetKinds}
              >
                <SelectTrigger id="audit-target-kind" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {targetKinds.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {kind.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audit-from">From (local time)</Label>
              <Input
                id="audit-from"
                className="h-11"
                type="datetime-local"
                value={draft.from}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="audit-to">To (local time)</Label>
              <Input
                id="audit-to"
                className="h-11"
                type="datetime-local"
                value={draft.to}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={reset}
            >
              Reset
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
              ) : (
                <SearchIcon />
              )}
              Apply filters
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollTextIcon />
            Audit records
          </CardTitle>
          <CardDescription>
            {records.length} records loaded. Times are shown in UTC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <Empty className="min-h-52 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollTextIcon />
                </EmptyMedia>
                <EmptyTitle>No audit records found</EmptyTitle>
                <EmptyDescription>
                  Adjust the filters or reset them to inspect the full history.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {timestampFormatter.format(new Date(record.createdAt))}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {record.actor.displayName}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            CID {record.actor.cid}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {actionLabel(record.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span>{record.summary}</span>
                          <span className="block break-all font-mono text-xs text-muted-foreground">
                            {record.targetKind}:{record.targetKey}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelected(record)}
                          >
                            <EyeIcon />
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {records.map((record) => (
                  <article
                    key={record.id}
                    className="flex flex-col gap-3 rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline">
                        {actionLabel(record.action)}
                      </Badge>
                      <time className="text-xs text-muted-foreground tabular-nums">
                        {timestampFormatter.format(new Date(record.createdAt))}
                      </time>
                    </div>
                    <div className="flex flex-col gap-1">
                      <p>{record.summary}</p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {record.targetKind}:{record.targetKey}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t pt-3">
                      <p className="min-w-0 text-sm">
                        <span className="truncate font-medium">
                          {record.actor.displayName}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          CID {record.actor.cid}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSelected(record)}
                      >
                        <EyeIcon />
                        Inspect
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </CardContent>
        {hasNextPage ? (
          <CardFooter className="justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void onLoadMore()}
            >
              {pending ? (
                <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Load more records
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Sheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(undefined);
          }
        }}
      >
        {selected === undefined ? null : <RecordDetails record={selected} />}
      </Sheet>
    </div>
  );
}
