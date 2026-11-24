"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Phone, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/States";
import { useAuth } from "@/store/auth";

const NEXT_STATUS: Record<string, { label: string; to: string }> = {
  CONFIRMED: { label: "Start trip", to: "ACTIVE" },
  ACTIVE: { label: "Complete trip", to: "COMPLETED" },
};

/** Mobile-first driver home: today's assignments and trip-status buttons. */
export default function DriverHome() {
  const user = useAuth((s) => s.user);
  const query = useQuery({
    queryKey: ["bookings", { scope: "driver" }],
    queryFn: () => api<Booking[]>("/api/bookings"),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message="Could not load your assignments" onRetry={() => void query.refetch()} />;
  }

  const bookings = (query.data ?? []).filter((b) => ["CONFIRMED", "ACTIVE"].includes(b.status));
  const todays = bookings.filter((b) => b.startDate <= new Date().toISOString().slice(0, 10));

  return (
    <>
      <PageHeader title={`Today, ${(user?.name ?? "driver").split(" ")[0]}`} description="Your trips and their status." />
      {todays.length === 0 ? (
        <EmptyState title="No trips scheduled today" description="Assignments appear here once dispatch allocates them." />
      ) : (
        <ul className="space-y-3">
          {todays.map((booking) => {
            const next = NEXT_STATUS[booking.status];
            return (
              <li key={booking.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{booking.guest?.name ?? "Guest"}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" aria-hidden /> {booking.parkName}
                        </p>
                      </div>
                      <Badge>{booking.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" aria-hidden /> {formatDate(booking.startDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersRound className="h-3 w-3" aria-hidden /> {booking.pax} guests
                      </span>
                      {booking.guest?.phone && (
                        <a href={`tel:${booking.guest.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3 w-3" aria-hidden /> Contact
                        </a>
                      )}
                    </div>
                    {next && (
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <Link href={`/bookings/${booking.id}?action=${next.to}`}>{next.label}</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
