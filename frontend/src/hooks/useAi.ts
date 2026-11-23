"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MonthlyDemand, Payment } from "@/lib/types";

export interface ForecastPoint {
  month: string;
  bookings: number;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

/**
 * Demand forecast from the Python AI service (`ai/services/forecast.py`).
 * Falls back to the MSW stand-in when the sidecar is not running.
 */
export function useForecast(monthly: MonthlyDemand[] | undefined) {
  return useQuery({
    queryKey: ["ai", "forecast", monthly],
    enabled: !!monthly && monthly.length > 0,
    queryFn: async () => {
      const res = await api<{ points: ForecastPoint[]; method: string }>("/api/ai/forecast", {
        method: "POST",
        body: {
          months: monthly?.map((m) => m.month),
          bookings: monthly?.map((m) => m.bookings),
        },
      });
      return res.points;
    },
  });
}

export interface AnomalyFlag {
  id: unknown;
  kind: string;
  reason: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

/** Rule-first payment checks (duplicate M-Pesa refs, amount conflicts). */
export function usePaymentAnomalies(payments: Payment[] | undefined) {
  return useQuery({
    queryKey: ["ai", "anomalies", payments],
    enabled: !!payments && payments.length > 0,
    queryFn: async () => {
      const res = await api<{ anomalies: AnomalyFlag[] }>("/api/ai/anomalies", {
        method: "POST",
        body: { kind: "payments", rows: payments ?? [] },
      });
      return res.anomalies;
    },
  });
}

export interface SentimentScore {
  sentiment: "positive" | "neutral" | "negative";
  score: number;
  topics: string[];
}

/** Per-feedback sentiment, aggregated by the caller into a trend chart. */
export function useSentimentScores(
  items: Array<{ id: number; text: string }> | undefined,
) {
  return useQuery({
    queryKey: ["ai", "sentiment", items?.map((i) => i.id)],
    enabled: !!items && items.length > 0,
    queryFn: () =>
      Promise.all(
        (items ?? []).map((item) =>
          api<SentimentScore>("/api/ai/sentiment", {
            method: "POST",
            body: { text: item.text },
          }).then((score) => ({ ...score, id: item.id })),
        ),
      ),
  });
}
