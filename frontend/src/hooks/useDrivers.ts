import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Driver, Vehicle } from "../lib/types";

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: () => api<Driver[]>("/api/drivers"),
  });
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<Vehicle[]>("/api/vehicles"),
  });
}
