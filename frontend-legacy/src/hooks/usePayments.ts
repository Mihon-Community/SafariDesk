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
