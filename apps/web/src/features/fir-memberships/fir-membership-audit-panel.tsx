import { HistoryIcon } from "lucide-react";

import type { FirMembershipOverview } from "@event-hub/contracts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRecord =
  FirMembershipOverview["recentAuditRecords"][number];

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function actionLabel(action: string) {
  return action
    .replace(/^fir-membership\./u, "")
    .split(".")
    .map((part) => part.replaceAll("-", " "))
    .join(" · ");
}

export function FirMembershipAuditPanel({
  records,
}: Readonly<{ records: readonly AuditRecord[] }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon />
          Recent membership changes
        </CardTitle>
        <CardDescription>
          The latest 25 manual assignments, overrides, reactivations, and
          revocations. Times are shown in UTC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No manual FIR membership changes have been recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Administrator</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-muted-foreground">
                    {timestampFormatter.format(new Date(record.createdAt))}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {record.actor.displayName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      CID {record.actor.cid}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {actionLabel(record.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <span>{record.summary}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {record.targetKey}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
