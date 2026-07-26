import type { ReactNode } from "react";
import Link from "next/link";
import {
  CheckIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type FeedbackStateProps = Readonly<{
  kind: "loading" | "empty" | "error" | "success";
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  stackActionOnMobile?: boolean;
}>;

export function FeedbackState({
  kind,
  title,
  description,
  action,
  className,
  stackActionOnMobile = false,
}: FeedbackStateProps) {
  if (kind === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-h-36 items-center gap-4 rounded-xl border bg-card/35 p-5",
          className,
        )}
      >
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-12 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-base font-medium">{title}</p>
          <Skeleton className="h-2.5 w-full max-w-32" />
          <Skeleton className="h-2.5 w-2/3 max-w-24" />
        </div>
      </div>
    );
  }

  if (kind === "empty") {
    return (
      <Empty
        className={cn(
          "min-h-36 flex-row justify-start border bg-card/35 text-left",
          stackActionOnMobile &&
            "max-sm:flex-col max-sm:items-stretch",
          className,
        )}
      >
        <EmptyMedia
          variant="icon"
          className="mb-0 size-12 rounded-full bg-transparent text-muted-foreground ring-1 ring-border"
        >
          <FolderOpenIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader className="items-start text-left">
          <EmptyTitle className="text-base">{title}</EmptyTitle>
          {description ? (
            <EmptyDescription>{description}</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {action ? (
          <EmptyContent
            className={cn(
              "ml-auto w-auto items-end",
              stackActionOnMobile &&
                "max-sm:ml-0 max-sm:w-full max-sm:items-stretch",
            )}
          >
            {action}
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  const success = kind === "success";

  return (
    <Alert
      variant={success ? "success" : "destructive"}
      className={cn(
        "min-h-36 content-center bg-card/35 p-5",
        className,
      )}
    >
      {success ? (
        <CheckIcon aria-hidden="true" />
      ) : (
        <TriangleAlertIcon aria-hidden="true" />
      )}
      <AlertTitle className="text-base">{title}</AlertTitle>
      {description ? (
        <AlertDescription>{description}</AlertDescription>
      ) : null}
      {action ? (
        <AlertAction className="top-auto right-4 bottom-4">
          {action}
        </AlertAction>
      ) : null}
    </Alert>
  );
}

export function FeedbackRail() {
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card/20 sm:grid-cols-2 xl:grid-cols-4">
      <FeedbackState
        kind="loading"
        title="Loading events"
        className="rounded-none border-0 border-b sm:border-r xl:border-b-0"
      />
      <FeedbackState
        kind="empty"
        title="No events found"
        className="rounded-none border-0 border-b xl:border-r xl:border-b-0"
      />
      <FeedbackState
        kind="error"
        title="Something went wrong"
        className="rounded-none border-0 border-b sm:border-r sm:border-b-0"
        action={
          <Link
            href="/events"
            className="rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Try again
          </Link>
        }
      />
      <FeedbackState
        kind="success"
        title="Changes saved"
        className="rounded-none border-0"
        action={
          <Link
            href="/events"
            className="rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            View details
          </Link>
        }
      />
    </div>
  );
}
