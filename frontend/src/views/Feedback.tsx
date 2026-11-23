"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import type { AnalyticsSummary, Booking, FeedbackEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/Money";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, EmptyState } from "@/components/States";

export default function Feedback() {
  const feedbackQuery = useQuery({
    queryKey: ["feedback"],
    queryFn: () => api<FeedbackEntry[]>("/api/feedback"),
  });
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<AnalyticsSummary>("/api/analytics/summary"),
  });
  const bookingsQuery = useQuery({
    queryKey: ["bookings", {}],
    queryFn: () => api<Booking[]>("/api/bookings"),
  });

  /** Conservancy fees are a quote line; aggregate per park for the revenue-share report. */
  const conservancyByPark = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of bookingsQuery.data ?? []) {
      const amount = b.quoteBreakdown?.conservancy ?? 0;
      if (!amount) continue;
      const name = b.parkName ?? `Park #${b.parkId}`;
      totals.set(name, (totals.get(name) ?? 0) + amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [bookingsQuery.data]);

  const loading = feedbackQuery.isLoading || summaryQuery.isLoading || bookingsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feedback and demand"
        description="Guest ratings, seasonal demand and the conservancy revenue-share report."
      />

      {loading && <Skeleton className="h-72 w-full" />}

      {!loading && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Demand chart */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Monthly bookings</CardTitle>
                <p className="text-xs text-muted-foreground">Indicative demand view.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaryQuery.data?.monthly ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="bookings" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Conservancy report */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Conservancy fees collected</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Sum of the conservancy line across quotes, by park.
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {conservancyByPark.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No conservancy lines yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {conservancyByPark.map(([park, total]) => (
                      <li key={park} className="flex items-center justify-between py-2 text-sm">
                        <span>{park}</span>
                        <Money value={total} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Feedback list */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Guest feedback</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {feedbackQuery.isError && (
                <div className="p-4">
                  <ErrorState
                    message={
                      feedbackQuery.error instanceof Error ? feedbackQuery.error.message : "Failed"
                    }
                    onRetry={() => feedbackQuery.refetch()}
                  />
                </div>
              )}
              {feedbackQuery.data && feedbackQuery.data.length === 0 && (
                <div className="p-4">
                  <EmptyState
                    title="No feedback yet"
                    description="Ratings arrive by SMS after a completed trip."
                  />
                </div>
              )}
              {feedbackQuery.data && feedbackQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead>Booking</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedbackQuery.data.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-xs">{formatDateTime(f.createdAt)}</TableCell>
                        <TableCell>{f.guestName ?? "—"}</TableCell>
                        <TableCell>
                          {f.rating != null ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-600">
                              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                              <span className="font-medium">{f.rating}</span>
                              <span className="text-muted-foreground">/5</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs" title={f.comment ?? undefined}>
                          {f.comment ?? "—"}
                        </TableCell>
                        <TableCell>
                          {f.sentiment ? <Badge variant="secondary">{f.sentiment}</Badge> : "—"}
                        </TableCell>
                        <TableCell>
                          <Link href={`/bookings/${f.bookingId}`} className="font-medium text-primary hover:underline">
                            #{f.bookingId}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
