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

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalyticsSummary } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { CardsSkeleton, ErrorState } from "@/components/States";
import { KpiCard } from "@/components/KpiCard";
import { RevenueRangeChart } from "@/components/charts/RevenueRangeChart";
import { ForecastChart } from "@/components/charts/ForecastChart";
import {
  DriverUtilisation,
  OccupancyHeatmap,
  ParkBarChart,
  PaymentMethodBars,
  StatusDonut,
} from "@/components/charts/DashboardCharts";
import {
  useBookingsByPark,
  useDailySeries,
  useDriverUtilisation,
  usePaymentMethods,
} from "@/hooks/useAnalytics";
import { useBookings } from "@/hooks/useBookings";

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<AnalyticsSummary>("/api/analytics/summary"),
  });
  const daily = useDailySeries();
  const byPark = useBookingsByPark();
  const methods = usePaymentMethods();
  const drivers = useDriverUtilisation();
  const bookings = useBookings({});

  const data = summary.data;

  /** Last 30 days vs the 30 before that, used for the KPI delta badges. */
  const deltas = useMemo(() => {
    const days = daily.data ?? [];
    const recent = days.slice(-30);
    const previous = days.slice(-60, -30);
    const sum = (rows: typeof days, key: "bookings" | "revenue") =>
      rows.reduce((total, p) => total + (key === "bookings" ? p.bookings : p.revenue), 0);
    const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);
    return {
      bookings: change(sum(recent, "bookings"), sum(previous, "bookings")),
      revenue: change(sum(recent, "revenue"), sum(previous, "revenue")),
    };
  }, [daily.data]);

  const spark = useMemo(() => {
    const days = daily.data ?? [];
    return {
      bookings: days.slice(-14).map((d) => d.bookings),
      revenue: days.slice(-14).map((d) => d.revenue),
    };
  }, [daily.data]);

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
          {/* KPI cards — value, delta, sparkline, tooltip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-6">
            <KpiCard
              title="Total bookings"
              hint="All bookings across every status."
              value={totalBookings}
              icon={ClipboardList}
              href="/bookings"
              delta={deltas.bookings}
              deltaLabel="vs prior 30 days"
              spark={spark.bookings}
            />
            <KpiCard
              title="Revenue collected"
              hint="Deposits received, excluding balances due."
              value={data.revenuePaid}
              format="money"
              icon={CircleDollarSign}
              href="/payments"
              delta={deltas.revenue}
              deltaLabel="vs prior 30 days"
              spark={spark.revenue}
            />
            <KpiCard
              title="Departing in 7 days"
              hint="Confirmed trips starting this week."
              value={data.departing7Days.length}
              icon={CalendarRange}
              href="/bookings?status=CONFIRMED"
              deltaLabel="confirmed trips"
            />
            <KpiCard
              title="Unallocated trips"
              hint="Trips with no driver assigned yet."
              value={data.unallocated}
              icon={Truck}
              href="/dispatch"
              deltaLabel="need a driver"
            />
          </div>

          {/* Revenue + status */}
          <div className="grid gap-4 lg:grid-cols-2 3xl:grid-cols-3">
            <Card className="3xl:col-span-2">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Revenue</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Daily deposits with previous-period comparison. Drag the brush to zoom.
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {daily.isLoading ? (
                  <div
                    className="h-56 animate-pulse rounded-lg bg-muted"
                    aria-label="Loading revenue chart"
                  />
                ) : (
                  <RevenueRangeChart days={daily.data ?? []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Bookings by status</CardTitle>
                <p className="text-xs text-muted-foreground">Centre shows the total.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <StatusDonut data={data.byStatus} />
              </CardContent>
            </Card>
          </div>

          {/* Demand forecast + park mix + occupancy */}
          <div className="grid gap-4 lg:grid-cols-2 3xl:grid-cols-3">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Demand forecast</CardTitle>
                <p className="text-xs text-muted-foreground">
                  From the Python AI service — shaded band is the confidence interval.
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <ForecastChart monthly={data.monthly} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Bookings by park</CardTitle>
                <p className="text-xs text-muted-foreground">Where guests are going.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {byPark.isLoading ? (
                  <div
                    className="h-56 animate-pulse rounded-lg bg-muted"
                    aria-label="Loading park chart"
                  />
                ) : (
                  <ParkBarChart parks={byPark.data ?? []} />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 3xl:col-span-1">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Occupancy</CardTitle>
                <p className="text-xs text-muted-foreground">Seats taken, next 8 weeks.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <OccupancyHeatmap bookings={bookings.data ?? []} />
              </CardContent>
            </Card>
          </div>

          {/* Payments + drivers + departures */}
          <div className="grid gap-4 lg:grid-cols-2 3xl:grid-cols-3">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Payments by method</CardTitle>
                <p className="text-xs text-muted-foreground">Collected vs pending, KES.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {methods.isLoading ? (
                  <div
                    className="h-56 animate-pulse rounded-lg bg-muted"
                    aria-label="Loading payment chart"
                  />
                ) : (
                  <PaymentMethodBars
                    methods={methods.data?.methods ?? []}
                    rows={methods.data?.rows ?? []}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Driver utilisation</CardTitle>
                <p className="text-xs text-muted-foreground">Assignments per driver.</p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {drivers.isLoading ? (
                  <div
                    className="h-56 animate-pulse rounded-lg bg-muted"
                    aria-label="Loading driver chart"
                  />
                ) : (
                  <DriverUtilisation drivers={drivers.data ?? []} />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 3xl:col-span-1">
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
          </div>

          <p className="text-xs text-muted-foreground">
            Deposit balance outstanding: <Money value={data.depositsDue} plain /> (
            {formatMoney(data.depositsDue)}).
          </p>
        </>
      )}
    </div>
  );
}
