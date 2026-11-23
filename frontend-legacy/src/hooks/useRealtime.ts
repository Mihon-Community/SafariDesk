import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../store/auth";
import { connectSocket, SOCKET_EVENTS } from "../lib/socket";
import { formatMoney } from "../lib/format";
import type {
  AlertDeliveryPayload,
  AssignmentUpdatedPayload,
  PaymentReceivedPayload,
} from "../lib/socket";

/**
 * Realtime updates: invalidate TanStack Query caches on server events.
 * Call once inside the authenticated Layout.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);
    // Only warn if we were connected before: a dead dev backend should not spam toasts.
    let wasConnected = false;

    socket.on("connect", () => {
      wasConnected = true;
    });

    socket.on(SOCKET_EVENTS.paymentReceived, (p: PaymentReceivedPayload) => {
      toast.success(`Payment ${formatMoney(p.amount)} received`, {
        description: p.mpesaRef ? `M-Pesa ref ${p.mpesaRef}` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    });

    socket.on(SOCKET_EVENTS.assignmentUpdated, (a: AssignmentUpdatedPayload) => {
      toast(`Driver replied ${a.status}`, {
        description: a.driverName ? `${a.driverName} · booking #${a.bookingId}` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
    });

    socket.on(SOCKET_EVENTS.alertDelivery, (d: AlertDeliveryPayload) => {
      if (d.status === "FAILED") toast.error("Alert delivery failed");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    });

    socket.on(SOCKET_EVENTS.bookingCreated, () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    });

    socket.on(SOCKET_EVENTS.bookingUpdated, () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    });

    socket.on("connect_error", () => {
      if (wasConnected) toast.error("Live updates disconnected — retrying");
    });

    return () => {
      socket.disconnect();
    };
  }, [token, qc]);
}
