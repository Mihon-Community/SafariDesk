"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";

import { usePayments } from "@/hooks/usePayments";
import type { ReconciliationRow } from "@/lib/types";
import { maskPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, EmptyState } from "@/components/States";

export default function Payments() {
  const query = usePayments();
  const data = query.data;

  const tabs = data
    ? [
        { key: "matched", label: "Matched", icon: CheckCircle2, rows: data.matched },
        { key: "mismatched", label: "Mismatched", icon: AlertTriangle, rows: data.mismatched },
        { key: "unmatched", label: "Unmatched", icon: HelpCircle, rows: data.unmatched },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments"
        description="Deposits matched to bookings. Mismatches need a human decision."
      />

      {query.isLoading && <Skeleton className="h-72 w-full" />}

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Request failed"}
          onRetry={() => query.refetch()}
        />
      )}

      {data && (
        <Tabs defaultValue="matched">
          <TabsList>
            {tabs.map(({ key, label, icon: Icon, rows }) => (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {rows.length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(({ key, label, rows }) => (
            <TabsContent key={key} value={key}>
              <Card>
                <CardContent className="p-0">
                  {rows.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        title={`No ${label.toLowerCase()} payments`}
                        description={
                          key === "matched"
                            ? "Successful deposits appear here once the amount equals the deposit due."
                            : key === "mismatched"
                              ? "Nothing is off by amount right now."
                              : "Money with no booking will show up here for manual matching."
                        }
                      />
                    </div>
                  ) : (
                    <div className="rtable-wrap">
                      <Table className="rtable">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guest</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          {key === "mismatched" && <TableHead className="text-right">Deposit due</TableHead>}
                          <TableHead>M-Pesa ref</TableHead>
                          <TableHead>Booking</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <PaymentRow key={r.id} row={r} showDue={key === "mismatched"} />
                        ))}
                      </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function PaymentRow({ row, showDue }: { row: ReconciliationRow; showDue: boolean }) {
  return (
    <TableRow>
      <TableCell data-label="Guest">{row.guestName ?? "—"}</TableCell>
      <TableCell data-label="Phone" className="text-xs text-muted-foreground">
        {maskPhone(row.phone)}
      </TableCell>
      <TableCell data-label="Amount" className="text-right font-medium">
        <Money value={row.amount} plain />
      </TableCell>
      {showDue && (
        <TableCell data-label="Deposit due" className="text-right text-destructive">
          <Money value={row.depositDue} plain />
        </TableCell>
      )}
      <TableCell data-label="M-Pesa ref" className="text-xs text-muted-foreground">
        {row.mpesaRef ?? row.providerRef ?? "—"}
      </TableCell>
      <TableCell data-label="Booking">
        {row.bookingId ? (
          <Link href={`/bookings/${row.bookingId}`} className="font-medium text-primary hover:underline">
            #{row.bookingId}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell data-label="Status">
        <Badge
          variant={
            row.status === "SUCCESS"
              ? "success"
              : row.status === "MANUAL"
                ? "info"
                : row.status === "FAILED"
                  ? "destructive"
                  : "warning"
          }
        >
          {row.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
