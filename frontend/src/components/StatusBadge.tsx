import type { BookingStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING: "chip-neutral",
  DEPOSIT_PAID: "chip-info",
  CONFIRMED: "chip-success",
  ACTIVE: "chip-success",
  COMPLETED: "chip-done",
  CANCELLED: "chip-danger",
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Pending",
  DEPOSIT_PAID: "Deposit paid",
  CONFIRMED: "Confirmed",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** One status badge for every booking state. */
export function StatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
