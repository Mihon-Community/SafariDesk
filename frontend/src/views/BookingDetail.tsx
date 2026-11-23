"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Check,
  Loader2,
  MessageSquareText,
  Send,
  Truck,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import {
  useMarkPaid,
  usePayBooking,
  useResendAssignment,
  useUpdateBooking,
} from "@/hooks/useBookings";
import type { BookingStatus, BookingWithRelations, PaymentStatus } from "@/lib/types";
import { formatDate, formatDateTime, maskPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/States";

const FLOW: BookingStatus[] = ["PENDING", "DEPOSIT_PAID", "CONFIRMED", "ACTIVE", "COMPLETED"];

const ASSIGNMENT_CHIP: Record<string, string> = {
  WAITING: "chip-warning",
  ACCEPTED: "chip-success",
  DECLINED: "chip-danger",
  CANCELLED: "chip-neutral",
};

const PAYMENT_CHIP: Record<PaymentStatus, string> = {
  PENDING: "chip-warning",
  SUCCESS: "chip-success",
  FAILED: "chip-danger",
  MANUAL: "chip-info",
};

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["bookings", id],
    enabled: !!id,
    queryFn: () => api<BookingWithRelations>(`/api/bookings/${id}`),
  });

  const pay = usePayBooking();
  const markPaid = useMarkPaid();
  const update = useUpdateBooking();
  const resend = useResendAssignment();

  /** Resending the assignment SMS to a WAITING driver. */
  function resendSms() {
    const b = detail.data;
    if (!b?.assignment) return;
    resend.mutate(b.assignment.id, {
      onSuccess: () => toast.success("Assignment SMS resent"),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not resend SMS"),
    });
  }

  async function changeStatus(status: BookingStatus) {
    if (!detail.data) return;
    try {
      await update.mutateAsync({ id: detail.data.id, status });
      toast.success(`Status updated to ${status.replace(/_/g, " ")}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Status change failed");
    }
  }

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        message={detail.error instanceof Error ? detail.error.message : "Booking not found"}
        onRetry={() => detail.refetch()}
      />
    );
  }

  const b = detail.data;
  const stepIndex = FLOW.indexOf(b.status);
  const cancelled = b.status === "CANCELLED";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Booking #${b.id}`}
        description={`${b.packageName ?? `Package #${b.packageId}`} · booked via ${b.source}`}
        actions={
          <>
            {(b.status === "PENDING" || b.status === "DEPOSIT_PAID") && (
              <Button
                onClick={() =>
                  pay.mutate(b.id, {
                    onSuccess: () =>
                      toast.success("M-Pesa prompt sent", {
                        description: "Waiting for the guest to approve on their phone.",
                      }),
                    onError: (e) =>
                      toast.error(e instanceof ApiError ? e.message : "Could not send the prompt"),
                  })
                }
                disabled={pay.isPending}
              >
                {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Pay deposit
              </Button>
            )}
            {b.status === "PENDING" && (
              <Button variant="outline" onClick={() => setMarkPaidOpen(true)}>
                <Banknote className="h-4 w-4" /> Mark as paid
              </Button>
            )}
          </>
        }
      />

      {/* Status stepper */}
      <Card>
        <CardContent className="p-4">
          {cancelled ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span className="font-medium">Cancelled</span>
              <span className="text-muted-foreground">· this booking is no longer active</span>
            </div>
          ) : (
            <ol className="flex flex-wrap items-center gap-y-3">
              {FLOW.map((s, i) => {
                const reached = i <= stepIndex;
                return (
                  <li key={s} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          reached
                            ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                            : "flex h-6 w-6 items-center justify-center rounded-full border bg-card text-[11px] font-semibold text-muted-foreground"
                        }
                      >
                        {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span
                        className={
                          reached ? "text-xs font-medium" : "text-xs text-muted-foreground"
                        }
                      >
                        {s === "DEPOSIT_PAID" ? "Deposit" : s.charAt(0) + s.slice(1).toLowerCase()}
                      </span>
                    </div>
                    {i < FLOW.length - 1 && (
                      <ArrowRight className="mx-2 h-3.5 w-3.5 text-muted-foreground/60" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {/* Status actions */}
          {!cancelled && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              {b.status === "DEPOSIT_PAID" && (
                <Button size="sm" onClick={() => changeStatus("CONFIRMED")}>
                  Confirm booking
                </Button>
              )}
              {b.status === "CONFIRMED" && (
                <Button size="sm" onClick={() => changeStatus("ACTIVE")}>
                  Start trip (mark active)
                </Button>
              )}
              {b.status === "ACTIVE" && (
                <Button size="sm" onClick={() => changeStatus("COMPLETED")}>
                  Mark completed
                </Button>
              )}
              {b.status !== "COMPLETED" && (
                <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
                  Cancel booking
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Guest */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Guest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2 text-sm">
            <p className="font-medium">{b.guest?.name ?? `Guest #${b.guestId}`}</p>
            <p className="text-muted-foreground">{maskPhone(b.guest?.phone)}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline">{b.guest?.residency?.replace(/_/g, " ") ?? "—"}</Badge>
              <Badge variant="outline">{b.pax} pax</Badge>
              <Badge variant="outline">
                {formatDate(b.startDate)} – {formatDate(b.endDate)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quote */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Quote</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 text-sm">
            {b.quoteBreakdown ? (
              <dl className="space-y-1.5">
                <Line label="Park fees" value={b.quoteBreakdown.parkFees} />
                {b.quoteBreakdown.conservancy > 0 && (
                  <Line label="Conservancy" value={b.quoteBreakdown.conservancy} />
                )}
                <Line label="Vehicle + driver" value={b.quoteBreakdown.transport} />
                <Line
                  label="Season adjustment"
                  value={b.quoteBreakdown.seasonAdjustment}
                  signed
                />
                <Line label="Margin" value={b.quoteBreakdown.margin} />
                <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money value={b.total} />
                  </dd>
                </div>
                <div className="flex justify-between text-primary">
                  <dt>Deposit due</dt>
                  <dd>
                    <Money value={b.depositDue} />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">No quote stored for this booking.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignment */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-sm">Dispatch assignment</CardTitle>
          <Link href="/dispatch" className="text-xs font-medium text-primary hover:underline">
            Open dispatch board
          </Link>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {b.assignment ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ASSIGNMENT_CHIP[b.assignment.status]}`}
                >
                  {b.assignment.status}
                </span>
                <p className="text-sm">
                  <span className="font-medium">{b.assignment.driver?.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {maskPhone(b.assignment.driver?.phone)} ·{" "}
                    {b.assignment.vehicle?.plate ?? "no vehicle"}
                  </span>
                </p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDate(b.assignment.tripStart)} – {formatDate(b.assignment.tripEnd)}
                </span>
              </div>
              {b.assignment.status === "WAITING" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={resendSms}>
                    <MessageSquareText className="h-4 w-4" /> Resend SMS
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Waiting for the driver to reply YES or NO.
                  </p>
                </div>
              )}
              {b.assignment.status === "DECLINED" && (
                <p className="text-xs text-destructive">
                  Driver declined — choose another driver on the dispatch board.
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              title="Not assigned yet"
              description="Assign a driver and vehicle from the dispatch board."
              action={
                <Link href="/dispatch">
                  <Button size="sm">
                    <Truck className="h-4 w-4" /> Go to dispatch
                  </Button>
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payments */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {b.payments.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="rtable-wrap">
                <Table className="rtable">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell data-label="Date">{formatDateTime(p.createdAt)}</TableCell>
                      <TableCell data-label="Amount" className="text-right">
                        <Money value={p.amount} plain />
                      </TableCell>
                      <TableCell data-label="Status">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT_CHIP[p.status]}`}
                        >
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell data-label="Reference" className="text-xs text-muted-foreground">
                        {p.mpesaRef ?? p.providerRef ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Messages</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {b.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SMS history for this booking.</p>
            ) : (
              <ul className="space-y-2">
                {b.messages.map((m) => (
                  <li key={m.id} className="flex gap-2 text-sm">
                    <Badge variant={m.direction === "in" ? "secondary" : "outline"}>
                      {m.direction === "in" ? "in" : "out"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-words">{m.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.channel} · {formatDateTime(m.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mark as paid fallback */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark deposit as paid</DialogTitle>
            <DialogDescription>
              Admin fallback for when the Paystack webhook cannot reach the server. The booking
              moves to Deposit paid immediately.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const reference = new FormData(e.currentTarget).get("reference") as string;
              try {
                await markPaid.mutateAsync({ bookingId: b.id, input: { reference } });
                toast.success("Marked as paid");
                setMarkPaidOpen(false);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "Could not mark as paid");
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="reference">M-Pesa reference</Label>
              <Input id="reference" name="reference" required placeholder="e.g. SD-12-1732368000000" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMarkPaidOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={markPaid.isPending}>
                {markPaid.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark paid
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              Booking #{b.id} will be marked cancelled. This cannot be undone from the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button variant="destructive" onClick={() => changeStatus("CANCELLED")}>
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value, signed = false }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        {signed && value > 0 ? "+" : ""}
        {value.toLocaleString("en-KE")}
      </dd>
    </div>
  );
}
