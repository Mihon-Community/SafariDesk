/**
 * Deterministic pseudo-randomness so chart mocks look real but stay stable
 * between reloads (no "chart changes every refresh" during demos).
 */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const DAY = 24 * 60 * 60 * 1000;

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  bookings: number;
  revenue: number;
  prevBookings: number;
  prevRevenue: number;
  forecast?: number | null;
  lower?: number | null;
  upper?: number | null;
}

/** Daily bookings/revenue for the last `days` days plus the prior-period baseline. */
export function dailySeries(days = 90): DailyPoint[] {
  const rand = seeded(20260901);
  const out: DailyPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // season curve peaking around Aug-Oct (high season) and Dec (peak)
  const season = (offset: number) =>
    0.55 + 0.35 * Math.sin((((offset + 250) % 365) / 365) * Math.PI * 2) + 0.15;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const offset = Math.floor(d.getTime() / DAY);
    const weekday = d.getDay();
    const weekendBoost = weekday === 5 || weekday === 6 ? 1.35 : 1;
    const noise = 0.7 + rand() * 0.6;

    const bookings = Math.max(0, Math.round(season(offset) * weekendBoost * noise * 3));
    const revenue = bookings * (2800 + Math.round(rand() * 2600));

    // previous period: same day-of-year shifted back ~365 days
    const prevOffset = offset - 365;
    const prevRand = 0.65 + rand() * 0.5;
    const prevBookings = Math.max(0, Math.round(season(prevOffset) * weekendBoost * prevRand * 3));
    const prevRevenue = prevBookings * (2700 + Math.round(rand() * 2500));

    out.push({
      date: d.toISOString().slice(0, 10),
      bookings,
      revenue,
      prevBookings,
      prevRevenue,
    });
  }
  return out;
}
