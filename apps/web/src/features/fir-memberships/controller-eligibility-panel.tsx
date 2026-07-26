"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleOffIcon,
  RefreshCwIcon,
} from "lucide-react";

import type {
  ControllerEligibilityProvider,
  ControllerEligibilityStatus,
} from "@event-hub/contracts";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ControllerEligibilityPanelProps = Readonly<{
  pendingProvider: ControllerEligibilityProvider | null;
  status: ControllerEligibilityStatus;
  onSynchronize: (
    provider: ControllerEligibilityProvider,
  ) => Promise<void>;
}>;

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const providerNames = {
  "control-center": "Control Center",
  vateud: "VATEUD",
} satisfies Record<ControllerEligibilityProvider, string>;

function timestamp(value: string | null) {
  return value === null
    ? "Never"
    : `${timestampFormatter.format(new Date(value))} UTC`;
}

function statusBadge(
  provider: ControllerEligibilityStatus["providers"][number],
) {
  if (!provider.configured) {
    return <Badge variant="outline">Disabled</Badge>;
  }
  if (provider.freshness === "stale") {
    return <Badge variant="destructive">Stale evidence</Badge>;
  }
  if (provider.state === "failed") {
    return <Badge variant="destructive">Last sync failed</Badge>;
  }
  if (provider.freshness === "fresh") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" />
        Fresh
      </Badge>
    );
  }
  return <Badge variant="outline">Awaiting first sync</Badge>;
}

export function ControllerEligibilityPanel({
  pendingProvider,
  status,
  onSynchronize,
}: ControllerEligibilityPanelProps) {
  const needsAttention = status.providers.some(
    (provider) =>
      provider.configured &&
      (provider.freshness === "stale" ||
        provider.freshness === "never" ||
        provider.state === "failed"),
  );

  return (
    <div className="flex flex-col gap-4">
      {needsAttention ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Provider evidence needs attention</AlertTitle>
          <AlertDescription>
            Failed or stale evidence is visible here and never grants new
            automatic access. Run the affected provider again after checking
            its credentials and availability.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {status.providers.map((provider) => {
          const pending = pendingProvider === provider.provider;

          return (
            <Card key={provider.provider}>
              <CardHeader>
                <CardTitle>{providerNames[provider.provider]}</CardTitle>
                <CardDescription>
                  {provider.provider === "control-center"
                    ? "Authoritative FIR-area membership and controller evidence"
                    : "vACC roster, rating, solo, and tier endorsement evidence"}
                </CardDescription>
                <CardAction>{statusBadge(provider)}</CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      Last successful sync
                    </dt>
                    <dd className="mt-0.5">
                      {timestamp(provider.lastSucceededAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Evidence fresh until
                    </dt>
                    <dd className="mt-0.5">
                      {timestamp(provider.freshUntil)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Controllers seen
                    </dt>
                    <dd className="mt-0.5">{provider.recordsSeen}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Consecutive failures
                    </dt>
                    <dd className="mt-0.5">
                      {provider.consecutiveFailures}
                    </dd>
                  </div>
                  {provider.lastErrorMessage !== null ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">
                        Last error · {provider.lastErrorCode}
                      </dt>
                      <dd className="mt-0.5">
                        {provider.lastErrorMessage}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {provider.nextRetryAt === null
                    ? "Normal synchronization schedule"
                    : `Next retry ${timestamp(provider.nextRetryAt)}`}
                </p>
                {provider.configured ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={pendingProvider !== null}
                    onClick={() =>
                      void onSynchronize(provider.provider)
                    }
                  >
                    {pending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    {pending ? "Synchronizing…" : "Synchronize now"}
                  </Button>
                ) : (
                  <Badge variant="outline">
                    <CircleOffIcon data-icon="inline-start" />
                    Not configured
                  </Badge>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent synchronization runs</CardTitle>
          <CardDescription>
            The latest startup, scheduled, and administrator-triggered attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Controllers</TableHead>
                <TableHead className="text-right">Membership changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {status.recentRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No synchronization attempts have been recorded.
                  </TableCell>
                </TableRow>
              ) : (
                status.recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{providerNames[run.provider]}</TableCell>
                    <TableCell>{run.trigger}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.status === "failed"
                            ? "destructive"
                            : run.status === "succeeded"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{timestamp(run.startedAt)}</TableCell>
                    <TableCell className="text-right">
                      {run.controllersSeen}
                    </TableCell>
                    <TableCell className="text-right">
                      {run.membershipsChanged}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
