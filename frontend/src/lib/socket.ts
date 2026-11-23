import { io, type Socket } from "socket.io-client";

/**
 * Socket.IO events must match the backend guide:
 * booking:created, booking:updated, payment:received, assignment:updated, alert:delivery.
 */
export const SOCKET_EVENTS = {
  bookingCreated: "booking:created",
  bookingUpdated: "booking:updated",
  paymentReceived: "payment:received",
  assignmentUpdated: "assignment:updated",
  alertDelivery: "alert:delivery",
} as const;

export interface PaymentReceivedPayload {
  bookingId: number;
  amount: number;
  mpesaRef?: string;
}

export interface AssignmentUpdatedPayload {
  assignmentId: number;
  bookingId: number;
  status: "WAITING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  driverName?: string;
}

export interface AlertDeliveryPayload {
  alertId: number;
  deliveryId: number;
  status: "SENT" | "DELIVERED" | "FAILED";
}

export function connectSocket(token: string): Socket {
  return io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "", {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
