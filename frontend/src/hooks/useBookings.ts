import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, bookingsQuery } from "../lib/api";
import type {
  AssignInput,
  Booking,
  CreateBookingInput,
  MarkPaidInput,
} from "../lib/types";

/** Bookings list with status filter and search. Keyed by the filter object. */
export function useBookings(filters: { status?: string; q?: string }) {
  return useQuery({
    queryKey: ["bookings", filters],
    queryFn: () => api<Booking[]>(`/api/bookings${bookingsQuery(filters)}`),
    placeholderData: (prev) => prev,
    // Server is the source of truth (socket events also invalidate): keep lists fresh.
    staleTime: 10_000,
    refetchOnMount: "always",
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["bookings", id],
    queryFn: () => api<Booking>(`/api/bookings/${id}`),
    enabled: !!id,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      api<Booking>("/api/bookings", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

/** Status changes go through the server's single setStatus path. */
export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: Booking["status"];
    }) =>
      api<Booking>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

/** Triggers the M-Pesa STK push. Never assume payment succeeded here. */
export function usePayBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: number) =>
      api<{ ok: true; reference: string }>(`/api/bookings/${bookingId}/pay`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

/** Admin fallback when the Paystack webhook cannot reach the server. */
export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: number; input: MarkPaidInput }) =>
      api<Booking>(`/api/bookings/${bookingId}/mark-paid`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

/**
 * Assignment posts to POST /api/bookings/:id/assign.
 * HTTP 409 surfaces as ApiError with the clashing booking in `body`.
 */
export function useAssignDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      input,
    }: {
      bookingId: number;
      input: AssignInput;
    }) =>
      api<{ id: number; status: string }>(
        `/api/bookings/${bookingId}/assign`,
        { method: "POST", body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

/** Resends the assignment SMS for a WAITING allocation. */
export function useResendAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: number) =>
      api<{ ok: true; assignmentId: number }>(
        `/api/assignments/${assignmentId}/resend`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}
