import { HistoryIcon } from "lucide-react";

import type { AuthorizationOverview } from "@event-hub/contracts";

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

type AuditRecord = AuthorizationOverview["recentAuditRecords"][number];

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function actionLabel(action: string) {
  return action
    .replace(/^authorization\./u, "")
    .split(".")
    .map((part) => part.replaceAll("-", " "))
    .join(" · ");
}

export function AuthorizationAuditPanel({
  records,
}: Readonly<{ records: readonly AuditRecord[] }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon />
          Recent authorization changes
        </CardTitle>
        <CardDescription>
          The latest 25 role, capability, assignment, and account changes.
          Times are shown in UTC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No administrator changes have been recorded yet.
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
                  <TableCell>
                    <span>{record.summary}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {record.targetKind}:{record.targetKey}
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
