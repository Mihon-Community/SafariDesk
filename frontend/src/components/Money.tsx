import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/** Single money formatter for the whole dashboard: KES with separators. */
export function Money({
  value,
  className,
  plain = false,
}: {
  value: number | null | undefined;
  className?: string;
  /** render just the number, e.g. inside tables where the column header says KES */
  plain?: boolean;
}) {
  if (plain) {
    return (
      <span className={cn("tabular-nums", className)}>
        {value == null || Number.isNaN(Number(value))
          ? "—"
          : Number(value).toLocaleString("en-KE")}
      </span>
    );
  }
  return <span className={cn("tabular-nums", className)}>{formatMoney(value)}</span>;
}
