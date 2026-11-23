"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";

import type { DailyPoint } from "@/hooks/useAnalytics";
import { abbreviate, downloadCSV } from "@/lib/export";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartFallback,
  ChartLegend,
  ChartTooltipContent,
} from "@/components/ui/chart";

type Range = "7d" | "30d" | "90d" | "ytd";

const RANGE_DAYS: Record<Range, (days: DailyPoint[]) => DailyPoint[]> = {
  "7d": (d) => d.slice(-7),
  "30d": (d) => d.slice(-30),
  "90d": (d) => d.slice(-90),
  ytd: (d) => d.filter((p) => p.date.startsWith(String(new Date().getFullYear()))),
};

/**
 * Revenue area chart with a range selector, previous-period comparison line,
 * CSV export and an accessible data-table fallback. Colours come from theme vars.
 */
export function RevenueRangeChart({ days }: { days: DailyPoint[] }) {
  const [range, setRange] = useState<Range>("30d");
  const [showPrev, setShowPrev] = useState(true);

  const data = useMemo(() => {
    const slice = RANGE_DAYS[range](days).map((p) => ({
      ...p,
      label: p.date.slice(5), // MM-DD keeps the axis tidy
    }));
    return slice;
  }, [days, range]);

  const totals = useMemo(() => {
    const revenue = data.reduce((sum, p) => sum + p.revenue, 0);
    const prevRevenue = data.reduce((sum, p) => sum + p.prevRevenue, 0);
    const bookings = data.reduce((sum, p) => sum + p.bookings, 0);
    const delta =
      prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
    return { revenue, bookings, delta };
  }, [data]);

  function exportCsv() {
    downloadCSV(
      `revenue-${range}.csv`,
      ["date", "bookings", "revenue_kes", "prev_bookings", "prev_revenue_kes"],
      data.map((p) => [p.date, p.bookings, p.revenue, p.prevBookings, p.prevRevenue]),
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Chart range"
          className="flex rounded-lg border p-0.5 text-xs"
        >
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.replace("d", "D").replace("YTD", "YTD")}
            </button>
          ))}
        </div>

        <ChartLegend
          items={[
            { key: "current", label: "This period", color: "var(--chart-1)" },
            ...(showPrev
              ? [{ key: "prev", label: "Previous period", color: "var(--muted-foreground)" }]
              : []),
          ]}
          className="hidden sm:flex"
          onToggle={(key) => {
            if (key === "prev") setShowPrev((v) => !v);
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={exportCsv}
          className="ml-auto gap-1.5 text-xs"
          aria-label="Export this chart as CSV"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        KES {abbreviate(totals.revenue)} collected · {totals.bookings.toLocaleString()} bookings ·{" "}
        <span className={totals.delta >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
          {totals.delta >= 0 ? "▲" : "▼"} {Math.abs(totals.delta)}%
        </span>{" "}
        vs previous period
      </p>

      <ChartContainer
        config={{ current: { label: "Revenue", color: "var(--chart-1)" } }}
        className="h-56 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 22 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={abbreviate}
            />
            <Tooltip
              content={
                <ChartTooltipContent
                  formatter={(v) => formatMoney(Number(v))}
                  labelFormatter={(l) => `Day ${l}`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--color-current)"
              fill="url(#revFill)"
              strokeWidth={2}
              animationDuration={400}
            />
            {showPrev && (
              <Line
                type="monotone"
                dataKey="prevRevenue"
                name="Previous"
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                animationDuration={400}
              />
            )}
            <Brush
              dataKey="label"
              height={18}
              travellerWidth={6}
              stroke="var(--border)"
              fill="var(--muted)"
              startIndex={Math.max(0, data.length - 30)}
              ariaLabel="Zoom the chart by dragging the brush handles"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartFallback
        caption={`Daily revenue, last ${data.length} days (${range})`}
        columns={["Date", "Bookings", "Revenue (KES)", "Previous revenue (KES)"]}
        rows={data.map((p) => [p.date, p.bookings, p.revenue, p.prevRevenue])}
      />
    </div>
  );
}
