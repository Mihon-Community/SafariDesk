"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface DailyPoint {
  date: string;
  bookings: number;
  revenue: number;
  prevBookings: number;
  prevRevenue: number;
}

export interface ParkCount {
  park: string;
  bookings: number;
}

export interface DriverUtilisation {
  id: number;
  name: string;
  active: boolean;
  assigned: number;
  utilisation: number;
}

/** Daily demand series used by the revenue range chart. */
export function useDailySeries() {
  return useQuery({
    queryKey: ["analytics", "daily"],
    queryFn: () => api<{ days: DailyPoint[] }>("/api/analytics/daily").then((r) => r.days),
  });
}

export function useBookingsByPark() {
  return useQuery({
    queryKey: ["analytics", "by-park"],
    queryFn: () =>
      api<{ parks: ParkCount[] }>("/api/analytics/by-park").then((r) => r.parks),
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["analytics", "payment-methods"],
    queryFn: () =>
      api<{ methods: string[]; rows: Array<Record<string, string | number>> }>(
        "/api/analytics/payment-methods",
      ),
  });
}

export function useDriverUtilisation() {
  return useQuery({
    queryKey: ["analytics", "driver-utilisation"],
    queryFn: () =>
      api<{ drivers: DriverUtilisation[] }>("/api/analytics/driver-utilisation").then(
        (r) => r.drivers,
      ),
  });
}
