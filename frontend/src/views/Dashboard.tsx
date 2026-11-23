"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  Truck,
  ArrowRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalyticsSummary, BookingStatus } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { CardsSkeleton, ErrorState } from "@/components/States";

const STATUS_ORDER: BookingStatus[] = [
  "PENDING",
  "DEPOSIT_PAID",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<AnalyticsSummary>("/api/analytics/summary"),
  });

  const data = summary.data;
  const totalBookings = useMemo(
    () => Object.values(data?.byStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0),
    [data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Bookings, revenue and dispatch at a glance."
      />

      {summary.isLoading && <CardsSkeleton />}

      {summary.isError && (
        <ErrorState
          message={summary.error instanceof Error ? summary.error.message : "Request failed"}
          onRetry={() => summary.refetch()}
        />
      )}

      {data && (
        <>
          {/* Stat cards — each links to the filtered list it summarises */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link href="/bookings">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Total bookings
                  </CardTitle>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-2xl font-semibold">{totalBookings}</p>
                  <p className="mt-1 text-xs text-muted-foreground">All statuses</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/payments">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Revenue collected
                  </CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-2xl font-semibold">
                    <Money value={data.revenuePaid} plain />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMoney(data.depositsDue)} deposit due
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/bookings?status=CONFIRMED">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Departing in 7 days
                  </CardTitle>
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-2xl font-semibold">{data.departing7Days.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Confirmed trips</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/dispatch">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Unallocated trips
                  </CardTitle>
                  <Truck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-2xl font-semibold">{data.unallocated}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Need a driver</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Status counts */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Bookings by status</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((status) => (
                  <Link key={status} href={`/bookings?status=${status}`}>
                    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs hover:border-primary/50">
                      <StatusBadge status={status} />
                      <span className="font-semibold">{data.byStatus[status] ?? 0}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Monthly bookings</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Seasonal demand view — indicative only.
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd0" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="bookings" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Monthly revenue</CardTitle>
                <p className="text-xs text-muted-foreground">Collected deposits, KES.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfd0" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) => [formatMoney(Number(value)), "Revenue"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Departures */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="text-sm">Departing in the next 7 days</CardTitle>
              <Link
                href="/bookings?status=CONFIRMED"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {data.departing7Days.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No confirmed departures in the next 7 days.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.departing7Days.map((trip) => (
                    <li key={trip.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{trip.guestName}</p>
                        <p className="text-xs text-muted-foreground">
                          {trip.packageName} · {trip.pax} pax · starts {formatDate(trip.startDate)}
                        </p>
                      </div>
                      <Link href={`/bookings/${trip.id}`} className="shrink-0">
                        <StatusBadge status={trip.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
