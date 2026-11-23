import type { BookingStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING: "bg-stone-100 text-stone-700 border-stone-200",
  DEPOSIT_PAID: "bg-sky-100 text-sky-800 border-sky-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ACTIVE: "bg-teal-100 text-teal-800 border-teal-200",
  COMPLETED: "bg-stone-800 text-stone-50 border-stone-700",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
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
