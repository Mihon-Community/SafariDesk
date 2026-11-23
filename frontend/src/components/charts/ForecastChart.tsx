"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthlyDemand } from "@/lib/types";
import { abbreviate } from "@/lib/export";
import { ChartContainer, ChartFallback, ChartTooltipContent } from "@/components/ui/chart";
import { useForecast } from "@/hooks/useAi";

/**
 * Monthly demand with the AI forecast band: history solid, forecast dashed,
 * shaded confidence interval between lower and upper.
 */
export function ForecastChart({ monthly }: { monthly: MonthlyDemand[] }) {
  const points = useForecast(monthly);

  const data = useMemo(
    () =>
      (points.data ?? []).map((p) => ({
        month: p.month,
        bookings: p.bookings || undefined,
        forecast: p.forecast ?? undefined,
        lower: p.lower ?? undefined,
        band:
          p.upper != null && p.lower != null ? Math.max(0, p.upper - p.lower) : undefined,
      })),
    [points.data],
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border px-2 py-0.5">AI · {points.data ? points.data[0].month.slice(0, 4) : ""} forecast</span>
        {points.isLoading && <span>Fetching forecast…</span>}
      </div>

      <ChartContainer
        config={{ actual: { label: "Actual", color: "var(--chart-1)" }, forecast: { label: "Forecast", color: "var(--chart-3)" } }}
        className="h-56 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltipContent formatter={(v) => `${abbreviate(Number(v))} bookings`} />} />
            {/* shaded confidence interval: invisible base + visible band */}
            <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" legendType="none" />
            <Area
              dataKey="band"
              stackId="band"
              name="Confidence interval"
              stroke="none"
              fill="var(--chart-3)"
              fillOpacity={0.18}
            />
            <Line
              type="monotone"
              dataKey="bookings"
              name="Actual"
              stroke="var(--color-actual)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              animationDuration={400}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Forecast"
              stroke="var(--color-forecast)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              animationDuration={400}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartFallback
        caption="Monthly demand and AI forecast"
        columns={["Month", "Bookings", "Forecast", "Low", "High"]}
        rows={data.map((d) => [d.month, d.bookings ?? "—", d.forecast ?? "—", d.lower ?? "—", d.band == null ? "—" : (Number(d.lower ?? 0) + Number(d.band)).toFixed(0)])}
      />
    </div>
  );
}
