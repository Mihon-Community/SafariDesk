"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { abbreviate } from "@/lib/export";
import { formatMoney } from "@/lib/format";

/**
 * KPI card: icon, count-up value, delta badge (colour + text), sparkline and a
 * tooltip explaining the metric. Animation is skipped for reduced-motion users.
 */
export function KpiCard({
  title,
  hint,
  value,
  format = "number",
  delta,
  deltaLabel,
  spark,
  icon: Icon,
  href,
}: {
  title: string;
  hint?: string;
  value: number;
  format?: "number" | "money" | "compact";
  delta?: number;
  deltaLabel?: string;
  spark?: number[];
  icon: LucideIcon;
  href?: string;
}) {
  const [display, setDisplay] = useState(0);
  const reduced = usePrefersReducedMotion();
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, reduced]);

  const formatted =
    format === "money"
      ? formatMoney(display)
      : format === "compact"
        ? abbreviate(display)
        : display.toLocaleString();

  const up = delta !== undefined && delta >= 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{formatted}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3">
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              up
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
            }`}
          >
            {up ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
        {deltaLabel && <span className="text-[11px] text-muted-foreground">{deltaLabel}</span>}
        {spark && spark.length > 1 && (
          <Sparkline points={spark} className="ml-auto h-6 w-20" />
        )}
      </div>
      {hint && <span className="sr-only">{hint}</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)] transition-[transform,opacity,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title={hint ?? `${title}: ${formatted}`}
      >
        {body}
      </Link>
    );
  }
  return (
    <div
      className="h-full overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"
      title={hint ?? `${title}: ${formatted}`}
    >
      {body}
    </div>
  );
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - ((p - min) / span) * 90 - 5}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={coords} fill="none" stroke="var(--chart-1)" strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
