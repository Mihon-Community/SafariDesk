import { format, isValid, parseISO } from "date-fns";

/** KES formatting: thousands separators, no decimals (money is stored as integer KES). */
export function formatMoney(kes: number | null | undefined): string {
  if (kes == null || Number.isNaN(Number(kes))) return "KES —";
  return `KES ${Number(kes).toLocaleString("en-KE")}`;
}

/** 2026-12-20 -> "20 Dec 2026" */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseISO(iso.slice(0, 10)) : iso;
  return isValid(d) ? format(d, "d MMM yyyy") : "—";
}

/** 2026-12-20T14:03:00Z -> "20 Dec 2026, 14:03" */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "d MMM yyyy, HH:mm") : "—";
}

/**
 * Mask a phone for lists so only the last three digits stay visible:
 * +254712345678 -> "+254 •••••• 678". The subscriber number is hidden, the
 * country prefix stays readable (matches the server-side mask rule).
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const prefix = digits.startsWith("254") ? "+254 " : "";
  const rest = digits.startsWith("254") ? digits.slice(3) : digits;
  return `${prefix}${"•".repeat(Math.max(rest.length - 3, 0))} ${digits.slice(-3)}`;
}

/**
 * Normalise user input to E.164 (+254...).
 * Accepts "0712345678", "0112345678", "254712345678", "+254712345678",
 * "712345678" and anything already in +254 form.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  else if (digits.startsWith("7") || digits.startsWith("1")) digits = `254${digits}`;
  return `+${digits}`;
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function addDaysISO(days: number): string {
  return format(new Date(Date.now() + days * 86_400_000), "yyyy-MM-dd");
}

export function daysBetween(startISO: string, endISO: string): number {
  const start = parseISO(startISO.slice(0, 10)).getTime();
  const end = parseISO(endISO.slice(0, 10)).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
