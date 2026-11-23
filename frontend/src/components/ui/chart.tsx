"use client";

import type { ReactNode } from "react";

/**
 * Minimal shadcn-style chart primitives.
 *
 * Colours are injected as `--color-<name>` CSS variables inside the container so
 * any theme (`--chart-1 … --chart-5`, status colours) re-themes the chart without
 * touching the chart code. Every chart gets an accessible `<table>` fallback and an
 * `aria-label` summary rendered by <ChartFallback />.
 */

export type ChartConfig = Record<string, { label: string; color: string }>;

export function ChartContainer({
  id,
  className,
  children,
  config,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  config: ChartConfig;
}) {
  return (
    <div
      data-chart={id}
      className={className}
      // Expose theme colours to Recharts strokes/fills via var(--color-x).
      style={
        Object.fromEntries(
          Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color]),
        ) as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** Recharts tooltip whose chrome comes from theme tokens. */
export function ChartTooltipContent(props: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; stroke?: string }>;
  label?: string | number;
  formatter?: (value: number | string) => string;
  labelFormatter?: (label: string | number) => string;
}) {
  const { active, payload, label, formatter, labelFormatter } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && (
        <p className="mb-1 font-medium text-foreground">{labelFormatter ? labelFormatter(label) : label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center gap-2 text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color ?? entry.stroke }}
            />
            {entry.name}
            <span className="ml-auto pl-4 font-semibold text-foreground">
              {formatter ? formatter(entry.value ?? 0) : entry.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Plain legend chips; parent owns click-to-hide state. */
export function ChartLegend({
  items,
  hidden = [],
  onToggle,
  className,
}: {
  items: Array<{ key: string; label: string; color: string }>;
  hidden?: string[];
  onToggle?: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {items.map((item) => {
        const off = hidden.includes(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle?.(item.key)}
            aria-pressed={!off}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity ${
              off ? "opacity-40" : ""
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Accessible text/table alternative for a chart. */
export function ChartFallback({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="mt-3 rounded-lg border text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        Data table: {caption}
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="border-b px-2 py-1 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
