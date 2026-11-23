import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Reconciliation } from "../lib/types";

/** Reconciliation view: matched, unmatched, mismatched payments. */
export function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: () => api<Reconciliation>("/api/payments/reconciliation"),
  });
}

/** Raw payment records, used by the AI anomaly checks panel. */
export function usePaymentRecords() {
  return useQuery({
    queryKey: ["payment-records"],
    queryFn: () => api<import("../lib/types").Payment[]>("/api/payments"),
  });
}
