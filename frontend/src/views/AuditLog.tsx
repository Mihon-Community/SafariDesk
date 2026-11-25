"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, ScrollText } from "lucide-react";

import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/States";

interface AuditEntry {
  id: string;
  userId: string | null;
  userEmail: string;
  event: string;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Super-admin-only trail of security and configuration events. */
export default function AuditLog() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ entries: AuditEntry[] }>("/api/audit").then((r) => r.entries),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Who did what, when — sign-ins, role changes, approvals and invites."
      />

      {query.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
        </div>
      )}
      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Request failed"}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && (
        <Card>
          <CardContent className="p-0">
            {query.data.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <ScrollText className="h-4 w-4" /> No events recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="px-4 py-3">{entry.userEmail}</td>
                        <td className="px-4 py-3">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{entry.event}</code>
                        </td>
                        <td className="max-w-md truncate px-4 py-3 text-xs text-muted-foreground">
                          {Object.keys(entry.metadata).length
                            ? JSON.stringify(entry.metadata)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
