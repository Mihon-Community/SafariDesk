"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Booking } from "@/lib/types";
import type { DriverUtilisation, ParkCount } from "@/hooks/useAnalytics";
import { abbreviate } from "@/lib/export";
import { formatDate } from "@/lib/format";
import {
  ChartContainer,
  ChartFallback,
  ChartLegend,
  ChartTooltipContent,
} from "@/components/ui/chart";

/* ------------------------------ status donut ------------------------------ */

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "var(--status-neutral-bg)" },
  DEPOSIT_PAID: { label: "Deposit paid", color: "var(--status-info-bg)" },
  CONFIRMED: { label: "Confirmed", color: "var(--status-success-bg)" },
  ACTIVE: { label: "Active", color: "var(--brand)" },
  COMPLETED: { label: "Completed", color: "var(--chart-2)" },
  CANCELLED: { label: "Cancelled", color: "var(--status-danger-bg)" },
};

export function StatusDonut({ data }: { data: Partial<Record<string, number>> }) {
  const slices = useMemo(
    () =>
      Object.entries(data)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([status, value]) => ({
          status,
          name: STATUS_META[status]?.label ?? status,
          value: value ?? 0,
          color: STATUS_META[status]?.color ?? "var(--muted)",
        })),
    [data],
  );
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div>
      <div className="relative h-52 w-full">
        <ChartContainer config={{}} className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltipContent formatter={(v) => `${v} bookings`} />} />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                strokeWidth={1}
                stroke="var(--card)"
                animationDuration={400}
              >
                {slices.map((s) => (
                  <Cell key={s.status} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold">{total}</p>
            <p className="text-[11px] text-muted-foreground">bookings</p>
          </div>
        </div>
      </div>
      <ChartLegend
        items={slices.map((s) => ({ key: s.status, label: `${s.name} · ${s.value}`, color: s.color }))}
        className="mt-1 justify-center"
      />
      <ChartFallback
        caption="Bookings by status"
        columns={["Status", "Bookings"]}
        rows={slices.map((s) => [s.name, s.value])}
      />
    </div>
  );
}

/* ----------------------------- bookings by park ---------------------------- */

export function ParkBarChart({ parks }: { parks: ParkCount[] }) {
  const max = Math.max(...parks.map((p) => p.bookings), 1);
  return (
    <div>
      <ChartContainer
        config={{ bookings: { label: "Bookings", color: "var(--chart-1)" } }}
        className="h-52 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={parks} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="park"
              width={88}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={<ChartTooltipContent formatter={(v) => `${v} bookings`} />}
            />
            <Bar dataKey="bookings" name="Bookings" fill="var(--color-bookings)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
      <ChartFallback
        caption="Bookings by park"
        columns={["Park", "Bookings", "Share"]}
        rows={parks.map((p) => [p.park, p.bookings, `${Math.round((p.bookings / max) * 100)}%`])}
      />
    </div>
  );
}

/* --------------------------- driver utilisation ---------------------------- */

export function DriverUtilisation({ drivers }: { drivers: DriverUtilisation[] }) {
  const active = drivers.filter((d) => d.active).length;
  const average = drivers.length
    ? Math.round(drivers.reduce((sum, d) => sum + d.utilisation, 0) / drivers.length)
    : 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <p className="text-2xl font-semibold">{average}%</p>
        <p className="text-xs text-muted-foreground">
          fleet utilisation · {active}/{drivers.length} drivers on assignment
        </p>
      </div>
      <ul className="space-y-2">
        {drivers.map((d) => (
          <li key={d.id} className="flex items-center gap-3 text-sm">
            <span className="w-28 truncate">{d.name}</span>
            <Radial value={d.utilisation} />
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {d.assigned} trip{d.assigned === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {drivers.length === 0 && (
          <li className="py-2 text-center text-sm text-muted-foreground">No drivers yet.</li>
        )}
      </ul>
      <ChartFallback
        caption="Driver utilisation"
        columns={["Driver", "Assigned trips", "Utilisation %"]}
        rows={drivers.map((d) => [d.name, d.assigned, `${d.utilisation}%`])}
      />
    </div>
  );
}

function Radial({ value }: { value: number }) {
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, value) / 100) * circumference;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" role="img" aria-label={`${value}%`}>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--muted)" strokeWidth={3} />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

/* --------------------------- payments by method ---------------------------- */

export function PaymentMethodBars({
  methods,
  rows,
}: {
  methods: string[];
  rows: Array<Record<string, string | number>>;
}) {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
  const data = methods.map((m) => {
    const row: Record<string, string | number> = { method: m };
    for (const r of rows) row[String(r.status)] = Number(r[m] ?? 0);
    return row;
  });
  const statuses = rows.map((r) => String(r.status));

  return (
    <div>
      <ChartContainer config={{}} className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="method" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={abbreviate} />
            <Tooltip content={<ChartTooltipContent formatter={(v) => abbreviate(Number(v))} />} />
            {statuses.map((status, i) => (
              <Bar
                key={status}
                dataKey={status}
                name={status}
                stackId="a"
                fill={palette[i % palette.length]}
                radius={i === statuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
      <ChartLegend
        items={statuses.map((s, i) => ({ key: s, label: s, color: palette[i % palette.length] }))}
        className="mt-1 justify-center"
      />
      <ChartFallback
        caption="Payments by method"
        columns={["Method", ...statuses]}
        rows={data.map((row) => [row.method, ...statuses.map((s) => String(row[s] ?? 0))])}
      />
    </div>
  );
}

/* --------------------------- occupancy calendar ---------------------------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAPACITY = 24; // seats across the fleet per day

/** Next 8 weeks of expected occupancy, derived from confirmed/active bookings. */
export function OccupancyHeatmap({ bookings }: { bookings: Booking[] }) {
  const { cells, peak } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday

    const loads = new Map<string, number>();
    for (const b of bookings) {
      if (!["DEPOSIT_PAID", "CONFIRMED", "ACTIVE"].includes(b.status)) continue;
      const begin = new Date(`${b.startDate}T00:00:00`);
      const end = new Date(`${b.endDate}T00:00:00`);
      for (let t = begin.getTime(); t <= end.getTime(); t += 86_400_000) {
        const key = new Date(t).toISOString().slice(0, 10);
        loads.set(key, (loads.get(key) ?? 0) + b.pax);
      }
    }

    const out: Array<{ date: string; load: number; pct: number }> = [];
    let maxPct = 0;
    for (let i = 0; i < 56; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const pct = Math.min(100, Math.round(((loads.get(key) ?? 0) / CAPACITY) * 100));
      maxPct = Math.max(maxPct, pct);
      out.push({ date: key, load: loads.get(key) ?? 0, pct });
    }
    return { cells: out, peak: maxPct };
  }, [bookings]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1" role="img" aria-label={`Occupancy heatmap: peak ${peak}% of seats`}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-center text-[10px] text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${formatDate(cell.date)} — ${cell.pct}% full (${cell.load} pax)`}
            className="aspect-square rounded-[4px] border"
            style={{
              background: `color-mix(in oklab, var(--chart-1) ${Math.round(cell.pct * 0.9)}%, var(--muted) 0%)`,
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Next 8 weeks · peak {peak}% of {CAPACITY} seats · {formatDate(cells[0].date)} –{" "}
        {formatDate(cells[cells.length - 1].date)}
      </p>
    </div>
  );
}
