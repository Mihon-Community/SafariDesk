"use client";

import Link from "next/link";
import { CalendarDays, MapPin, ReceiptText, Star, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Booking, FeedbackEntry } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/States";

/** Customer home: upcoming trips, itinerary and payments. */
export default function MyTrips() {
  const bookingsQuery = useQuery({
    queryKey: ["bookings", { scope: "customer" }],
    queryFn: () => api<Booking[]>("/api/bookings"),
  });
  const feedbackQuery = useQuery({
    queryKey: ["feedback"],
    queryFn: () => api<FeedbackEntry[]>("/api/feedback"),
  });

  if (bookingsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (bookingsQuery.isError) {
    return <ErrorState message="Could not load your trips" onRetry={() => void bookingsQuery.refetch()} />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (bookingsQuery.data ?? []).filter((b) => b.endDate >= today && b.status !== "CANCELLED");
  const rated = new Set((feedbackQuery.data ?? []).map((f) => f.bookingId));

  return (
    <>
      <PageHeader title="My trips" description="Upcoming safaris, itineraries and payments." />
      {upcoming.length === 0 ? (
        <EmptyState
          title="No trips yet"
          description="Your booked safaris will appear here."
          action={
            <Button asChild>
              <Link href="/">Explore parks</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {upcoming.map((booking) => (
            <li key={booking.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{booking.packageName ?? booking.parkName ?? "Safari"}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden /> {booking.parkName}
                      </p>
                    </div>
                    <Badge>{booking.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" aria-hidden />
                      {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <UsersRound className="h-3 w-3" aria-hidden /> {booking.pax} guests
                    </span>
                    <span className="flex items-center gap-1">
                      <ReceiptText className="h-3 w-3" aria-hidden />
                      {formatMoney(booking.total)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bookings/${booking.id}`}>Itinerary & payments</Link>
                    </Button>
                    {booking.status === "COMPLETED" && !rated.has(booking.id) && (
                      <Button asChild size="sm">
                        <Link href={`/feedback?booking=${booking.id}`}>
                          <Star className="h-3.5 w-3.5" aria-hidden /> Leave a review
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
