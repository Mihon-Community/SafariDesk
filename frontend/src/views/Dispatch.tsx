"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, UserCheck, CarFront } from "lucide-react";
import { toast } from "sonner";

import { useAssignDriver, useBookings, useResendAssignment } from "@/hooks/useBookings";
import { ApiError } from "@/lib/api";
import { useDrivers, useVehicles } from "@/hooks/useDrivers";
import type { Assignment, Booking, BookingStatus, Driver, Vehicle } from "@/lib/types";
import { formatDate, maskPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ConflictAlert } from "@/components/ConflictAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, EmptyState } from "@/components/States";

const ASSIGNMENT_CHIP: Record<string, string> = {
  WAITING: "bg-amber-100 text-amber-800 border-amber-200",
  ACCEPTED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DECLINED: "bg-red-100 text-red-700 border-red-200",
  CANCELLED: "bg-stone-100 text-stone-600 border-stone-200",
};

/** Bookings in these statuses still need (or should have) a driver. */
const NEEDS_DRIVER: BookingStatus[] = ["DEPOSIT_PAID", "CONFIRMED"];

export default function Dispatch() {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [conflict, setConflict] = useState<ApiError | null>(null);

  const bookingsQuery = useBookings({});
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();

  const assign = useAssignDriver();
  const resend = useResendAssignment();

  const allocatedBookingIds = useMemo(() => {
    const ids = new Set<number>();
    for (const d of driversQuery.data ?? []) {
      for (const a of d.assignments ?? []) {
        if (a.status === "WAITING" || a.status === "ACCEPTED") ids.add(a.bookingId);
      }
    }
    for (const v of vehiclesQuery.data ?? []) {
      for (const a of v.assignments ?? []) {
        if (a.status === "WAITING" || a.status === "ACCEPTED") ids.add(a.bookingId);
      }
    }
    return ids;
  }, [driversQuery.data, vehiclesQuery.data]);

  const unallocated = (bookingsQuery.data ?? []).filter(
    (b) => NEEDS_DRIVER.includes(b.status) && !allocatedBookingIds.has(b.id),
  );

  const loading = bookingsQuery.isLoading || driversQuery.isLoading || vehiclesQuery.isLoading;
  const error = bookingsQuery.error ?? driversQuery.error ?? vehiclesQuery.error;

  async function handleAssign(driverId: number, vehicleId: number) {
    if (!selectedBooking) return;
    try {
      await assign.mutateAsync({
        bookingId: selectedBooking.id,
        input: { driverId, vehicleId },
      });
      toast.success(`Driver assigned to booking #${selectedBooking.id}`, {
        description: "SMS sent — waiting for YES or NO.",
      });
      setConflict(null);
      setSelectedBooking(null);
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setConflict(err);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Assignment failed");
      }
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispatch"
        description="Assign drivers and vehicles. Overlapping dates are rejected by the server."
      />

      {loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {error && (
        <ErrorState
          message={error instanceof Error ? error.message : "Request failed"}
          onRetry={() => {
            bookingsQuery.refetch();
            driversQuery.refetch();
            vehiclesQuery.refetch();
          }}
        />
      )}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: unallocated trips */}
          <Card className="h-fit">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Unallocated bookings</CardTitle>
              <p className="text-xs text-muted-foreground">
                {unallocated.length} trip(s) need a driver.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-2">
              {unallocated.length === 0 && (
                <EmptyState
                  title="Everything is allocated"
                  description="Confirmed bookings all have a driver."
                />
              )}
              {unallocated.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border bg-card p-3 text-sm shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.guest?.name ?? `Guest #${b.guestId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.packageName ?? `#${b.packageId}`} · {b.pax} pax ·{" "}
                        {formatDate(b.startDate)} – {formatDate(b.endDate)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setSelectedBooking(b)}>
                      Assign
                    </Button>
                  </div>
                  <div className="mt-2">
                    <Badge variant="outline">{b.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Right: fleet with booked ranges */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Drivers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                {(driversQuery.data ?? []).map((d) => (
                  <FleetRow
                    key={d.id}
                    name={d.name}
                    meta={`${maskPhone(d.phone)} · KES ${d.dayRate.toLocaleString("en-KE")}/day`}
                    assignments={d.assignments ?? []}
                    onResend={(assignmentId) =>
                      resend.mutate(assignmentId, {
                        onSuccess: () => toast.success("Assignment SMS resent"),
                        onError: (e) =>
                          toast.error(e instanceof ApiError ? e.message : "Could not resend"),
                      })
                    }
                    resending={resend.isPending}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-2">
                <CarFront className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Vehicles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                {(vehiclesQuery.data ?? []).map((v) => (
                  <FleetRow
                    key={v.id}
                    name={v.plate}
                    meta={`${v.capacity} seats · KES ${v.dayRate.toLocaleString("en-KE")}/day`}
                    assignments={v.assignments ?? []}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AssignDialog
        booking={selectedBooking}
        onClose={() => {
          setSelectedBooking(null);
          setConflict(null);
        }}
        onAssign={handleAssign}
        submitting={assign.isPending}
        conflict={conflict}
        drivers={driversQuery.data ?? []}
        vehicles={vehiclesQuery.data ?? []}
      />
    </div>
  );
}

function FleetRow({
  name,
  meta,
  assignments,
  onResend,
  resending,
}: {
  name: string;
  meta: string;
  assignments: Assignment[];
  onResend?: (assignmentId: number) => void;
  resending?: boolean;
}) {
  const active = assignments.filter((a) => a.status === "WAITING" || a.status === "ACCEPTED");
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      {active.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Free — no active trips.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {active.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${ASSIGNMENT_CHIP[a.status]}`}
              >
                {a.status}
              </span>
              <Link href={`/bookings/${a.bookingId}`} className="font-medium hover:underline">
                #{a.bookingId}
              </Link>
              <span className="text-muted-foreground">
                {formatDate(a.tripStart)} – {formatDate(a.tripEnd)}
              </span>
              {a.status === "WAITING" && onResend && (
                <button
                  onClick={() => onResend(a.id)}
                  disabled={resending}
                  className="ml-auto text-primary hover:underline disabled:opacity-50"
                >
                  Resend SMS
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignDialog({
  booking,
  onClose,
  onAssign,
  submitting,
  conflict,
  drivers,
  vehicles,
}: {
  booking: Booking | null;
  onClose: () => void;
  onAssign: (driverId: number, vehicleId: number) => void;
  submitting: boolean;
  conflict: ApiError | null;
  drivers: Driver[];
  vehicles: Vehicle[];
}) {
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  // Reset selections each time a different booking is opened.
  const bookingKey = booking?.id ?? 0;

  return (
    <Dialog
      open={!!booking}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign driver — booking #{booking?.id}</DialogTitle>
          <DialogDescription>
            {booking &&
              `${booking.guest?.name ?? "Guest"} · ${booking.packageName ?? ""} · ${formatDate(
                booking.startDate,
              )} – ${formatDate(booking.endDate)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {conflict && <ConflictAlert error={conflict} onClose={() => {}} />}

          <div className="space-y-2">
            <Label htmlFor="driver">Driver</Label>
            <Select key={`d-${bookingKey}`} value={driverId} onValueChange={setDriverId}>
              <SelectTrigger id="driver" className="w-full">
                <SelectValue placeholder="Choose a driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter((d) => d.active !== false)
                  .map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle">Vehicle</Label>
            <Select key={`v-${bookingKey}`} value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="vehicle" className="w-full">
                <SelectValue placeholder="Choose a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles
                  .filter((v) => v.active !== false)
                  .map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.plate}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!driverId || !vehicleId || submitting}
            onClick={() => onAssign(Number(driverId), Number(vehicleId))}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Assign and send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
