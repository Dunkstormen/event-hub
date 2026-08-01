"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FilePenLineIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";

import type {
  EventLifecycleState,
  ManagedEventSummary,
} from "@event-hub/contracts";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type WorkspaceLifecycleFilter = "all" | EventLifecycleState;

const lifecycleFilters: ReadonlyArray<{
  value: WorkspaceLifecycleFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const lifecyclePresentation = {
  draft: {
    icon: FilePenLineIcon,
    label: "Draft",
    variant: "outline" as const,
  },
  published: {
    icon: CircleCheckIcon,
    label: "Published",
    variant: "default" as const,
  },
  cancelled: {
    icon: CircleXIcon,
    label: "Cancelled",
    variant: "destructive" as const,
  },
  archived: {
    icon: ArchiveIcon,
    label: "Archived",
    variant: "secondary" as const,
  },
};

const dateFormatterByTimeZone = new Map<string, Intl.DateTimeFormat>();
const timeZoneFormatterByTimeZone = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  const existing = dateFormatterByTimeZone.get(timeZone);

  if (existing !== undefined) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  dateFormatterByTimeZone.set(timeZone, formatter);
  return formatter;
}

function timeZoneFormatter(timeZone: string) {
  const existing = timeZoneFormatterByTimeZone.get(timeZone);

  if (existing !== undefined) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
  timeZoneFormatterByTimeZone.set(timeZone, formatter);
  return formatter;
}

function eventSchedule(event: ManagedEventSummary) {
  const start = new Date(event.schedule.startInstant);
  const timeZoneLabel = timeZoneFormatter(event.schedule.timeZone)
    .formatToParts(start)
    .find(({ type }) => type === "timeZoneName")?.value;

  return {
    date: dateFormatter(event.schedule.timeZone).format(start),
    time: `${event.schedule.localStart.slice(11, 16)}–${event.schedule.localEnd.slice(11, 16)}${
      timeZoneLabel === undefined ? "" : ` ${timeZoneLabel}`
    }`,
  };
}

function LifecycleBadge({
  state,
}: Readonly<{ state: EventLifecycleState }>) {
  const presentation = lifecyclePresentation[state];
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.variant}>
      <Icon data-icon="inline-start" />
      {presentation.label}
    </Badge>
  );
}

function RoleBadge({ event }: Readonly<{ event: ManagedEventSummary }>) {
  const owner = event.managementRole === "owner";

  return (
    <Badge variant={owner ? "secondary" : "outline"}>
      {owner ? (
        <ShieldCheckIcon data-icon="inline-start" />
      ) : (
        <UsersRoundIcon data-icon="inline-start" />
      )}
      {owner ? "Owner" : "Collaborator"}
    </Badge>
  );
}

function ManageEventLink({ eventId, compact = false }: Readonly<{
  eventId: string;
  compact?: boolean;
}>) {
  return (
    <Link
      href={`/workspace/events/${eventId}`}
      prefetch={false}
      className={buttonVariants({
        className: cn(compact ? "w-full" : "min-w-24"),
        size: compact ? "lg" : "sm",
        variant: "outline",
      })}
    >
      {compact ? "Manage event" : "Manage"}
      <ChevronRightIcon data-icon="inline-end" />
    </Link>
  );
}

function DesktopEventList({
  events,
}: Readonly<{ events: readonly ManagedEventSummary[] }>) {
  return (
    <div className="hidden overflow-hidden rounded-xl border xl:block">
      <div className="grid grid-cols-[minmax(18rem,1.8fr)_minmax(11rem,1fr)_minmax(10rem,0.9fr)_minmax(11rem,1fr)_8rem_8rem_7rem] items-center gap-5 border-b bg-muted/25 px-5 py-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <span>Event</span>
        <span>Date &amp; time (local)</span>
        <span>Owning FIR</span>
        <span>Participating FIRs</span>
        <span>Status</span>
        <span>My role</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="divide-y">
        {events.map((event) => {
          const schedule = eventSchedule(event);

          return (
            <article
              key={event.id}
              className="grid grid-cols-[minmax(18rem,1.8fr)_minmax(11rem,1fr)_minmax(10rem,0.9fr)_minmax(11rem,1fr)_8rem_8rem_7rem] items-center gap-5 bg-card/18 px-5 py-5 transition-colors hover:bg-card/35"
            >
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {event.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {event.shortDescription}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 text-sm tabular-nums">
                <span className="flex items-center gap-2">
                  <CalendarDaysIcon className="size-4 text-muted-foreground" />
                  {schedule.date}
                </span>
                <span className="text-muted-foreground">{schedule.time}</span>
              </div>
              <div className="min-w-0 text-sm">
                <span className="font-mono font-medium">
                  {event.ownerFir.icaoCode}
                </span>
                <span className="mt-1 block truncate text-muted-foreground">
                  {event.ownerFir.name}
                </span>
              </div>
              <p className="line-clamp-2 font-mono text-sm leading-6 text-muted-foreground">
                {event.participatingFirs
                  .map(({ icaoCode }) => icaoCode)
                  .join(", ")}
              </p>
              <LifecycleBadge state={event.lifecycleState} />
              <RoleBadge event={event} />
              <ManageEventLink eventId={event.id} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function MobileEventList({
  events,
}: Readonly<{ events: readonly ManagedEventSummary[] }>) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border xl:hidden">
      {events.map((event) => {
        const schedule = eventSchedule(event);

        return (
          <article key={event.id} className="flex flex-col gap-4 bg-card/18 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-[-0.015em]">
                  {event.name}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {event.shortDescription}
                </p>
              </div>
              <LifecycleBadge state={event.lifecycleState} />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <CalendarDaysIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="sr-only">Date and local time</dt>
                  <dd className="tabular-nums">
                    {schedule.date}
                    <span className="block text-muted-foreground">
                      {schedule.time}
                    </span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="sr-only">Owning FIR and management role</dt>
                  <dd>
                    <span className="font-mono">{event.ownerFir.icaoCode}</span>
                    <span className="mx-2 text-muted-foreground" aria-hidden="true">
                      ·
                    </span>
                    {event.managementRole === "owner" ? "Owner" : "Collaborator"}
                  </dd>
                  <dd className="text-muted-foreground">{event.ownerFir.name}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2">
                <UsersRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="sr-only">Participating FIRs</dt>
                  <dd className="font-mono leading-6 text-muted-foreground">
                    {event.participatingFirs
                      .map(({ icaoCode }) => icaoCode)
                      .join(", ")}
                  </dd>
                </div>
              </div>
            </dl>
            <ManageEventLink compact eventId={event.id} />
          </article>
        );
      })}
    </div>
  );
}

export type EventWorkspaceProps = Readonly<{
  events: readonly ManagedEventSummary[];
  hasNextPage: boolean;
  lifecycle: WorkspaceLifecycleFilter;
  pending: boolean;
  query: string;
  onLifecycleChange: (lifecycle: WorkspaceLifecycleFilter) => void;
  onLoadMore: () => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
}>;

export function EventWorkspace({
  events,
  hasNextPage,
  lifecycle,
  pending,
  query,
  onLifecycleChange,
  onLoadMore,
  onQueryChange,
  onReset,
}: EventWorkspaceProps) {
  const filtered = query.trim() !== "" || lifecycle !== "all";

  function changeQuery(event: ChangeEvent<HTMLInputElement>) {
    onQueryChange(event.target.value);
  }

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Find manageable events"
        className="rounded-xl border bg-card/15 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <label className="sr-only" htmlFor="workspace-event-search">
              Search manageable events
            </label>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="workspace-event-search"
              className="h-12 pl-11 text-base md:text-base"
              placeholder="Search manageable events"
              type="search"
              value={query}
              onChange={changeQuery}
            />
          </div>
          <Tabs
            value={lifecycle}
            onValueChange={(value) =>
              onLifecycleChange(value as WorkspaceLifecycleFilter)
            }
          >
            <TabsList
              variant="line"
              aria-label="Event lifecycle"
              className="h-auto max-w-full justify-start gap-1 overflow-x-auto pb-1"
            >
              {lifecycleFilters.map((filter) => (
                <TabsTrigger
                  key={filter.value}
                  value={filter.value}
                  className="h-11 flex-none rounded-lg border-border px-3.5 data-active:border-primary data-active:bg-primary/10 data-active:text-foreground after:hidden"
                >
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </section>

      <div aria-live="polite" aria-atomic="true" className="min-h-5">
        {pending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner data-icon="inline-start" />
            Updating events
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {events.length} {events.length === 1 ? "event" : "events"} loaded
          </p>
        )}
      </div>

      {events.length === 0 ? (
        <Empty className="min-h-72 border bg-card/15">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12 rounded-full">
              {filtered ? <SearchIcon /> : <FolderOpenIcon />}
            </EmptyMedia>
            <EmptyTitle className="text-lg">
              {filtered ? "No matching events" : "No manageable events yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another search or show events from every lifecycle state."
                : "Create a draft for an FIR you coordinate to begin planning."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button
                type="button"
                variant="outline"
                onClick={onReset}
              >
                Reset search and filters
              </Button>
            ) : (
              <Link
                href="/workspace/events/new"
                prefetch={false}
                className={buttonVariants()}
              >
                <PlusIcon data-icon="inline-start" />
                Create event
              </Link>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <DesktopEventList events={events} />
          <MobileEventList events={events} />
          {hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={pending}
                onClick={onLoadMore}
              >
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function EventWorkspaceLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <p className="sr-only">Loading manageable events</p>
      <div className="rounded-xl border bg-card/15 p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <Skeleton className="h-12 w-full xl:max-w-md" />
          <div className="flex gap-2 overflow-hidden">
            {lifecycleFilters.map(({ value }) => (
              <Skeleton key={value} className="h-11 w-24 shrink-0" />
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {["first", "second", "third"].map((key) => (
          <div key={key} className="flex flex-col gap-3 border-b p-5 last:border-b-0">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
