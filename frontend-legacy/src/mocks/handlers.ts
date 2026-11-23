import { delay, http, HttpResponse } from "msw";

/**
 * MSW handlers mirroring the agreed API contract.
 * Used with VITE_USE_MOCKS=true until the Express backend is running.
 * Seed numbers follow the database guide's placeholder rates.
 */

/* ------------------------------- seed data ------------------------------ */

const DAY = 86_400_000;
function iso(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}
function stamp(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString();
}

interface Guest { id: number; name: string; phone: string; residency: "citizen" | "resident" | "non_resident"; loyaltyPoints: number; referralCode: string | null; }
interface Park { id: number; name: string; emergencyContact: string | null; }
interface FeeRow { id: number; parkId: number; residency: "citizen" | "resident" | "non_resident"; perPersonPerDay: number; conservancyPerPersonDay: number; effectiveFrom: string; }
interface SeasonRow { id: number; name: string; startDate: string; endDate: string; multiplier: number; }
interface PackageRow { id: number; name: string; shortLabel: string; parkId: number; days: number; marginPct: number; active: boolean; }
interface VehicleRow { id: number; plate: string; capacity: number; dayRate: number; insuranceExpiry: string | null; active: boolean; }
interface DriverRow { id: number; name: string; phone: string; dayRate: number; certExpiry: string | null; active: boolean; }
interface BookingRow { id: number; guestId: number; packageId: number; parkId: number; startDate: string; endDate: string; pax: number; total: number; depositDue: number; quoteBreakdown: any; status: string; source: "web" | "ussd" | "sms"; createdAt: string; }
interface AssignmentRow { id: number; bookingId: number; driverId: number; vehicleId: number | null; status: string; tripStart: string; tripEnd: string; smsSentAt: string | null; respondedAt: string | null; }
interface PaymentRow { id: number; bookingId: number | null; phone: string; providerRef: string | null; mpesaRef: string | null; amount: number; status: string; createdAt: string; }
interface AlertRow { id: number; type: string; severity: string; message: string; parkId: number | null; createdAt: string; }
interface DeliveryRow { id: number; alertId: number; guestId: number; channel: "sms" | "voice"; status: "SENT" | "DELIVERED" | "FAILED"; failureReason?: string | null; }
interface FeedbackRow { id: number; bookingId: number; rating: number | null; comment: string | null; sentiment: string | null; topics: string[] | null; createdAt: string; }

const db = {
  parks: [
    { id: 1, name: "Maasai Mara", emergencyContact: "+254700000001" },
    { id: 2, name: "Amboseli", emergencyContact: "+254700000002" },
    { id: 3, name: "Lake Nakuru", emergencyContact: "+254700000003" },
  ] as Park[],
  fees: [
    { id: 1, parkId: 1, residency: "citizen", perPersonPerDay: 2000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 2, parkId: 1, residency: "resident", perPersonPerDay: 4000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 3, parkId: 1, residency: "non_resident", perPersonPerDay: 10000, conservancyPerPersonDay: 3000, effectiveFrom: "2026-01-01" },
    { id: 4, parkId: 2, residency: "citizen", perPersonPerDay: 1000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 5, parkId: 2, residency: "resident", perPersonPerDay: 2000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 6, parkId: 2, residency: "non_resident", perPersonPerDay: 8000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 7, parkId: 3, residency: "citizen", perPersonPerDay: 860, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 8, parkId: 3, residency: "resident", perPersonPerDay: 1500, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
    { id: 9, parkId: 3, residency: "non_resident", perPersonPerDay: 6000, conservancyPerPersonDay: 0, effectiveFrom: "2026-01-01" },
  ] as FeeRow[],
  seasons: [
    { id: 1, name: "Low", startDate: "2026-04-01", endDate: "2026-06-30", multiplier: 0.85 },
    { id: 2, name: "High", startDate: "2026-07-01", endDate: "2026-10-31", multiplier: 1.2 },
    { id: 3, name: "Shoulder", startDate: "2026-11-01", endDate: "2026-12-14", multiplier: 1.0 },
    { id: 4, name: "Peak", startDate: "2026-12-15", endDate: "2027-01-10", multiplier: 1.35 },
  ] as SeasonRow[],
  packages: [
    { id: 1, name: "Maasai Mara 3 days", shortLabel: "Mara 3d", parkId: 1, days: 3, marginPct: 15, active: true },
    { id: 2, name: "Amboseli 2 days", shortLabel: "Amboseli 2d", parkId: 2, days: 2, marginPct: 15, active: true },
    { id: 3, name: "Lake Nakuru 1 day", shortLabel: "Nakuru 1d", parkId: 3, days: 1, marginPct: 15, active: true },
  ] as PackageRow[],
  vehicles: [
    { id: 1, plate: "KDA 101A", capacity: 6, dayRate: 12000, insuranceExpiry: "2027-03-01", active: true },
    { id: 2, plate: "KDB 202B", capacity: 7, dayRate: 13000, insuranceExpiry: "2027-05-01", active: true },
  ] as VehicleRow[],
  drivers: [
    { id: 1, name: "Demo Driver One", phone: "+254711000011", dayRate: 4000, certExpiry: "2027-02-01", active: true },
    { id: 2, name: "Demo Driver Two", phone: "+254711000012", dayRate: 4000, certExpiry: "2027-04-01", active: true },
  ] as DriverRow[],
  guests: [
    { id: 1, name: "Amina Otieno", phone: "+254712345001", residency: "citizen", loyaltyPoints: 120, referralCode: "AMINA2" },
    { id: 2, name: "Peter Kamau", phone: "+254712345002", residency: "resident", loyaltyPoints: 40, referralCode: null },
    { id: 3, name: "Sarah Mwangi", phone: "+254712345003", residency: "non_resident", loyaltyPoints: 0, referralCode: null },
    { id: 4, name: "Daniel Ochieng", phone: "+254712345004", residency: "citizen", loyaltyPoints: 200, referralCode: "DAN5" },
    { id: 5, name: "Lucy Njeri", phone: "+254712345005", residency: "resident", loyaltyPoints: 10, referralCode: null },
  ] as Guest[],
  bookings: [] as BookingRow[],
  assignments: [] as AssignmentRow[],
  payments: [] as PaymentRow[],
  alerts: [] as AlertRow[],
  deliveries: [] as DeliveryRow[],
  feedback: [
    { id: 1, bookingId: 4, rating: 5, comment: "Great drive, saw the big five!", sentiment: "positive", topics: ["wildlife", "driver"], createdAt: stamp(-3) },
    { id: 2, bookingId: 5, rating: 4, comment: "Lovely trip, car was a bit warm.", sentiment: "positive", topics: ["vehicle"], createdAt: stamp(-1) },
  ] as FeedbackRow[],
};

let nextBookingId = 1;
let nextPaymentId = 1;
let nextAssignmentId = 1;
let nextAlertId = 1;

/* --------------------------- quote engine (mirror) ----------------------- */

function feeFor(parkId: number, residency: string, start: string) {
  const rows = db.fees.filter((f) => f.parkId === parkId && f.residency === residency && f.effectiveFrom <= start);
  rows.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return rows[0] ?? { perPersonPerDay: 0, conservancyPerPersonDay: 0 };
}

function seasonFor(start: string) {
  return db.seasons.find((s) => start >= s.startDate && start <= s.endDate)?.multiplier ?? 1;
}

export function computeQuote(i: {
  parkFeePerPersonDay: number;
  days: number;
  pax: number;
  vehicleDayRate: number;
  driverDayRate: number;
  seasonMultiplier: number;
  marginPct: number;
  depositPct: number;
  conservancyPerPersonDay?: number;
}) {
  const parkFees = i.parkFeePerPersonDay * i.pax * i.days;
  const conservancy = (i.conservancyPerPersonDay ?? 0) * i.pax * i.days;
  const transport = (i.vehicleDayRate + i.driverDayRate) * i.days;
  const base = parkFees + conservancy + transport;
  const seasonal = Math.round(base * i.seasonMultiplier);
  const margin = Math.round((seasonal * i.marginPct) / 100);
  const total = seasonal + margin;
  return { total, depositDue: Math.round((total * i.depositPct) / 100), breakdown: { parkFees, conservancy, transport, seasonAdjustment: seasonal - base, margin } };
}

function quoteBooking(packageId: number, pax: number, residency: string, start: string, depositPct = 30) {
  const pkg = db.packages.find((p) => p.id === packageId);
  if (!pkg) throw new Error("Unknown package");
  const fee = feeFor(pkg.parkId, residency, start);
  const vehicle = db.vehicles.find((v) => v.active) ?? db.vehicles[0];
  const driver = db.drivers.find((d) => d.active) ?? db.drivers[0];
  return computeQuote({
    parkFeePerPersonDay: fee.perPersonPerDay,
    days: pkg.days,
    pax,
    vehicleDayRate: vehicle.dayRate,
    driverDayRate: driver.dayRate,
    seasonMultiplier: seasonFor(start),
    marginPct: pkg.marginPct,
    depositPct,
    conservancyPerPersonDay: fee.conservancyPerPersonDay,
  });
}

/* ------------------------------ seed bookings ---------------------------- */

function seedBooking(guestId: number, packageId: number, startOffset: number, pax: number, residency: Guest["residency"], status: string, source: "web" | "ussd" | "sms") {
  const pkg = db.packages.find((p) => p.id === packageId)!;
  const q = quoteBooking(packageId, pax, residency, iso(startOffset));
  const end = new Date(Date.now() + (startOffset + pkg.days - 1) * DAY).toISOString().slice(0, 10);
  const booking: BookingRow = {
    id: nextBookingId++,
    guestId,
    packageId,
    parkId: pkg.parkId,
    startDate: iso(startOffset),
    endDate: end,
    pax,
    total: q.total,
    depositDue: q.depositDue,
    quoteBreakdown: q.breakdown,
    status,
    source,
    createdAt: stamp(-10 + startOffset),
  };
  db.bookings.push(booking);
  return booking;
}

// Deterministic demo set: pending, paid, confirmed (departing soon), active, completed, cancelled.
seedBooking(1, 1, 12, 2, "citizen", "PENDING", "web");
seedBooking(2, 2, 20, 4, "resident", "DEPOSIT_PAID", "ussd");
const confirmed = seedBooking(3, 1, 5, 2, "non_resident", "CONFIRMED", "web"); // departs within 7 days
const active = seedBooking(4, 3, 1, 3, "citizen", "ACTIVE", "sms"); // currently on trip
const completed = seedBooking(5, 2, -15, 2, "resident", "COMPLETED", "web");
seedBooking(1, 3, 30, 1, "citizen", "CANCELLED", "web");
// Unallocated confirmed trip whose dates clash with booking #2's driver: assigning
// Demo Driver One here must return HTTP 409, so the conflict UI is demonstrable.
seedBooking(4, 2, 20, 2, "citizen", "CONFIRMED", "web");

/* ------------------------------ seed money ------------------------------- */

const guest = (id: number) => db.guests.find((g) => g.id === id)!;
const booking = (id: number) => db.bookings.find((b) => b.id === id)!;

// Matched payment for booking #2 (deposit paid).
db.payments.push({
  id: nextPaymentId++,
  bookingId: 2,
  phone: guest(2).phone,
  providerRef: "SD-2-1732200000000",
  mpesaRef: "QNH123ABC",
  amount: booking(2).depositDue,
  status: "SUCCESS",
  createdAt: stamp(-6),
});

// Matched payment for the completed booking.
db.payments.push({
  id: nextPaymentId++,
  bookingId: completed.id,
  phone: guest(5).phone,
  providerRef: `SD-${completed.id}-1732100000000`,
  mpesaRef: "QNH456DEF",
  amount: completed.depositDue,
  status: "SUCCESS",
  createdAt: stamp(-25),
});

// Mismatched payment: wrong amount against the active booking's deposit.
db.payments.push({
  id: nextPaymentId++,
  bookingId: active.id,
  phone: guest(4).phone,
  providerRef: `SD-${active.id}-1732000000000`,
  mpesaRef: "QNH789GHI",
  amount: Math.max(active.depositDue - 500, 100),
  status: "SUCCESS",
  createdAt: stamp(-2),
});

// Unmatched money: no booking attached.
db.payments.push({
  id: nextPaymentId++,
  bookingId: null,
  phone: "+254712999888",
  providerRef: "SD-UNKNOWN-1731900000000",
  mpesaRef: "QNH000ZZZ",
  amount: 12500,
  status: "SUCCESS",
  createdAt: stamp(-1),
});

/* ---------------------------- seed assignments --------------------------- */

function addAssignment(bookingId: number, driverId: number, vehicleId: number | null, status: string) {
  const b = booking(bookingId);
  db.assignments.push({
    id: nextAssignmentId++,
    bookingId,
    driverId,
    vehicleId,
    status,
    tripStart: b.startDate,
    tripEnd: b.endDate,
    smsSentAt: stamp(-2),
    respondedAt: status === "WAITING" ? null : stamp(-1),
  });
}

addAssignment(active.id, 2, 2, "ACCEPTED");
// Booking #2 (DEPOSIT_PAID) has a WAITING assignment to show the amber chip + Resend SMS.
addAssignment(2, 1, null, "WAITING");

/* ------------------------------- serializers ----------------------------- */

function withGuest(g: Guest) {
  return { ...g, loyaltyPoints: g.loyaltyPoints, referralCode: g.referralCode };
}

function serializeBooking(b: BookingRow) {
  const pkg = db.packages.find((p) => p.id === b.packageId);
  const park = db.parks.find((p) => p.id === b.parkId);
  return {
    ...b,
    guest: withGuest(guest(b.guestId)),
    packageName: pkg?.name,
    parkName: park?.name,
  };
}

function serializeAssignment(a: AssignmentRow) {
  return {
    ...a,
    driver: db.drivers.find((d) => d.id === a.driverId) ?? null,
    vehicle: db.vehicles.find((v) => v.id === a.vehicleId) ?? null,
    booking: serializeBooking(booking(a.bookingId)),
  };
}

function serializeDriver(d: DriverRow) {
  return { ...d, assignments: db.assignments.map(serializeAssignment).filter((a) => a.driverId === d.id) };
}

function serializeVehicle(v: VehicleRow) {
  return { ...v, assignments: db.assignments.map(serializeAssignment).filter((a) => a.vehicleId === v.id) };
}

function reconcile() {
  const rows = db.payments.map((p) => {
    const b = p.bookingId != null ? booking(p.bookingId) : null;
    return {
      id: p.id,
      bookingId: p.bookingId,
      phone: p.phone,
      mpesaRef: p.mpesaRef,
      providerRef: p.providerRef,
      amount: p.amount,
      status: p.status,
      depositDue: b?.depositDue ?? null,
      guestName: b ? guest(b.guestId).name : null,
      createdAt: p.createdAt,
    };
  });

  const matched = rows.filter(
    (r) => r.status === "SUCCESS" && r.bookingId != null && r.amount === r.depositDue,
  );
  const mismatched = rows.filter(
    (r) => r.status === "SUCCESS" && r.bookingId != null && r.amount !== r.depositDue,
  );
  const unmatched = rows.filter(
    (r) =>
      (r.status === "SUCCESS" && r.bookingId == null) ||
      (r.status === "SUCCESS" && r.bookingId != null && !r.depositDue && r.amount > 0),
  );

  // Bookings marked paid with no SUCCESS/MANUAL payment row.
  const paidNoRow = db.bookings
    .filter((b) => ["DEPOSIT_PAID", "CONFIRMED"].includes(b.status))
    .filter((b) => !db.payments.some((p) => p.bookingId === b.id && ["SUCCESS", "MANUAL"].includes(p.status)))
    .map((b) => ({
      id: 0,
      bookingId: b.id,
      phone: guest(b.guestId).phone,
      mpesaRef: null,
      providerRef: null,
      amount: 0,
      status: "MISSING",
      depositDue: b.depositDue,
      guestName: guest(b.guestId).name,
      createdAt: b.createdAt,
    }));

  return { matched, mismatched, unmatched: [...unmatched, ...paidNoRow] };
}

function summary() {
  const byStatus: Record<string, number> = {};
  for (const b of db.bookings) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

  const revenuePaid = db.payments
    .filter((p) => ["SUCCESS", "MANUAL"].includes(p.status))
    .reduce((sum, p) => sum + p.amount, 0);

  const depositsDue = db.bookings
    .filter((b) => b.status === "PENDING")
    .reduce((sum, b) => sum + b.depositDue, 0);

  const in7 = db.bookings.filter((b) => {
    const start = new Date(b.startDate).getTime();
    const now = Date.now();
    return (
      start >= now &&
      start <= now + 7 * DAY &&
      ["DEPOSIT_PAID", "CONFIRMED"].includes(b.status)
    );
  });

  const allocated = new Set(
    db.assignments
      .filter((a) => ["WAITING", "ACCEPTED"].includes(a.status))
      .map((a) => a.bookingId),
  );
  const unallocated = db.bookings.filter(
    (b) => ["DEPOSIT_PAID", "CONFIRMED"].includes(b.status) && !allocated.has(b.id),
  ).length;

  // Monthly demand: spread seeded bookings over the last few months.
  const monthKeys: string[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthlyMap = new Map<string, { month: string; bookings: number; revenue: number }>();
  for (const key of monthKeys) monthlyMap.set(key, { month: key, bookings: 0, revenue: 0 });

  db.bookings.forEach((b, i) => {
    const key = monthKeys[Math.min(Math.floor(i / 1.5), monthKeys.length - 1)];
    monthlyMap.get(key)!.bookings += 1;
  });
  db.payments
    .filter((p) => p.status === "SUCCESS")
    .forEach((p, i) => {
      const key = monthKeys[Math.min(i, monthKeys.length - 1)];
      monthlyMap.get(key)!.revenue += p.amount;
    });
  const monthly = [...monthlyMap.values()];

  const activeGuests = new Set(
    db.bookings.filter((b) => b.status === "ACTIVE").map((b) => b.guestId),
  ).size;

  return {
    byStatus,
    revenuePaid,
    depositsDue,
    departing7Days: in7.map((b) => ({
      id: b.id,
      guestName: guest(b.guestId).name,
      packageName: db.packages.find((p) => p.id === b.packageId)?.name ?? "",
      startDate: b.startDate,
      pax: b.pax,
      status: b.status,
    })),
    unallocated,
    monthly,
    activeGuests: Math.max(activeGuests, db.guests.length - 1),
  };
}

/* -------------------------------- handlers ------------------------------- */

const LATENCY = 120;

function json(data: unknown, init?: ResponseInit) {
  // The contract shapes are plain JSON values; MSW's JsonBodyType is stricter than `unknown`.
  return HttpResponse.json(data as never, init);
}

export const handlers = [
  /* auth */
  http.post("/api/auth/login", async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password || body.password.length < 8) {
      return json({ error: "Invalid email or password", code: "BAD_CREDENTIALS" }, { status: 401 });
    }
    return json({
      token: "mock-jwt-token",
      user: { id: 1, email: body.email, role: "admin" },
    });
  }),

  /* analytics */
  http.get("/api/analytics/summary", async () => {
    await delay(LATENCY);
    return json(summary());
  }),

  /* feedback */
  http.get("/api/feedback", async () => {
    await delay(LATENCY);
    return json(
      db.feedback.map((f) => ({
        ...f,
        guestName: guest(booking(f.bookingId).guestId).name,
        packageName: db.packages.find((p) => p.id === booking(f.bookingId).packageId)?.name ?? null,
      })),
    );
  }),

  /* bookings */
  http.get("/api/bookings", async ({ request }) => {
    await delay(LATENCY);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    let rows = db.bookings.map(serializeBooking);
    if (status) rows = rows.filter((b) => b.status === status);
    if (q) {
      rows = rows.filter((b) =>
        [b.guest?.name, b.guest?.phone, b.packageName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return json(rows);
  }),

  http.post("/api/bookings", async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as {
      guestName: string;
      phone: string;
      packageId: number;
      startDate: string;
      pax: number;
      residency: Guest["residency"];
      depositPct?: number;
    };
    if (!body.guestName || !body.phone || !body.packageId || !body.startDate || !body.pax) {
      return json({ error: "Missing booking fields", code: "VALIDATION" }, { status: 400 });
    }
    let g = db.guests.find((x) => x.phone === body.phone);
    if (!g) {
      g = {
        id: Math.max(...db.guests.map((x) => x.id)) + 1,
        name: body.guestName,
        phone: body.phone,
        residency: body.residency ?? "citizen",
        loyaltyPoints: 0,
        referralCode: null,
      };
      db.guests.push(g);
    }
    const q = quoteBooking(body.packageId, body.pax, g.residency, body.startDate, body.depositPct ?? 30);
    const pkg = db.packages.find((p) => p.id === body.packageId)!;
    const bookingRow: BookingRow = {
      id: nextBookingId++,
      guestId: g.id,
      packageId: pkg.id,
      parkId: pkg.parkId,
      startDate: body.startDate,
      endDate: new Date(new Date(body.startDate).getTime() + (pkg.days - 1) * DAY).toISOString().slice(0, 10),
      pax: body.pax,
      total: q.total,
      depositDue: q.depositDue,
      quoteBreakdown: q.breakdown,
      status: "PENDING",
      source: "web",
      createdAt: new Date().toISOString(),
    };
    db.bookings.push(bookingRow);
    return json(serializeBooking(bookingRow), { status: 201 });
  }),

  http.get("/api/bookings/:id", async ({ params }) => {
    await delay(LATENCY);
    const b = db.bookings.find((x) => x.id === Number(params.id));
    if (!b) return json({ error: "Booking not found" }, { status: 404 });
    const messages = [
      { id: 1, direction: "out", body: "Your SafariDesk quote is ready.", channel: "sms", createdAt: stamp(-5) },
      { id: 2, direction: "in", body: "Asante! Please confirm.", channel: "sms", createdAt: stamp(-4) },
    ];
    return json({
      ...serializeBooking(b),
      payments: db.payments.filter((p) => p.bookingId === b.id),
      assignment: db.assignments.map(serializeAssignment).find((a) => a.bookingId === b.id) ?? null,
      messages,
    });
  }),

  http.patch("/api/bookings/:id", async ({ params, request }) => {
    await delay(LATENCY);
    const b = db.bookings.find((x) => x.id === Number(params.id));
    if (!b) return json({ error: "Booking not found" }, { status: 404 });
    const body = (await request.json()) as { status?: string };
    const allowed = ["PENDING", "DEPOSIT_PAID", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];
    if (body.status && allowed.includes(body.status)) b.status = body.status;
    return json(serializeBooking(b));
  }),

  http.post("/api/bookings/:id/pay", async ({ params }) => {
    await delay(LATENCY);
    const b = db.bookings.find((x) => x.id === Number(params.id));
    if (!b) return json({ error: "Booking not found" }, { status: 404 });
    db.payments.push({
      id: nextPaymentId++,
      bookingId: b.id,
      phone: guest(b.guestId).phone,
      providerRef: `SD-${b.id}-${Date.now()}`,
      mpesaRef: null,
      amount: b.depositDue,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
    return json({ ok: true, reference: `SD-${b.id}-${Date.now()}` });
  }),

  http.post("/api/bookings/:id/mark-paid", async ({ params, request }) => {
    await delay(LATENCY);
    const b = db.bookings.find((x) => x.id === Number(params.id));
    if (!b) return json({ error: "Booking not found" }, { status: 404 });
    const body = (await request.json()) as { reference?: string };
    if (!body.reference) return json({ error: "Reference required" }, { status: 400 });
    db.payments.push({
      id: nextPaymentId++,
      bookingId: b.id,
      phone: guest(b.guestId).phone,
      providerRef: null,
      mpesaRef: body.reference,
      amount: b.depositDue,
      status: "MANUAL",
      createdAt: new Date().toISOString(),
    });
    b.status = "DEPOSIT_PAID";
    return json(serializeBooking(b));
  }),

  http.post("/api/bookings/:id/assign", async ({ params, request }) => {
    await delay(LATENCY);
    const b = db.bookings.find((x) => x.id === Number(params.id));
    if (!b) return json({ error: "Booking not found" }, { status: 404 });
    const body = (await request.json()) as { driverId: number; vehicleId: number };

    // Mirror the database exclusion constraint: same driver/vehicle overlapping dates.
    const clash = db.assignments.find(
      (a) =>
        ["WAITING", "ACCEPTED"].includes(a.status) &&
        (a.driverId === body.driverId || a.vehicleId === body.vehicleId) &&
        a.tripStart <= b.endDate &&
        a.tripEnd >= b.startDate,
    );
    if (clash) {
      return json(
        {
          error: "Driver or vehicle already booked on these dates",
          code: "CONFLICT",
          booking: serializeBooking(booking(clash.bookingId)),
        },
        { status: 409 },
      );
    }

    const assignment: AssignmentRow = {
      id: nextAssignmentId++,
      bookingId: b.id,
      driverId: body.driverId,
      vehicleId: body.vehicleId,
      status: "WAITING",
      tripStart: b.startDate,
      tripEnd: b.endDate,
      smsSentAt: new Date().toISOString(),
      respondedAt: null,
    };
    db.assignments.push(assignment);
    return json({ id: assignment.id, status: "WAITING" }, { status: 201 });
  }),

  http.post("/api/assignments/:id/resend", async ({ params }) => {
    await delay(LATENCY);
    const a = db.assignments.find((x) => x.id === Number(params.id));
    if (!a) return json({ error: "Assignment not found" }, { status: 404 });
    a.smsSentAt = new Date().toISOString();
    return json({ ok: true, assignmentId: a.id });
  }),

  /* quotes */
  http.post("/api/quotes", async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as {
      packageId: number;
      pax: number;
      residency: Guest["residency"];
      start: string;
      depositPct?: number;
    };
    try {
      const q = quoteBooking(body.packageId, body.pax, body.residency, body.start, body.depositPct ?? 30);
      return json(q);
    } catch {
      return json({ error: "Could not compute quote", code: "QUOTE" }, { status: 400 });
    }
  }),

  /* fleet */
  http.get("/api/drivers", async () => {
    await delay(LATENCY);
    return json(db.drivers.map(serializeDriver));
  }),
  http.get("/api/vehicles", async () => {
    await delay(LATENCY);
    return json(db.vehicles.map(serializeVehicle));
  }),

  /* payments */
  http.get("/api/payments/reconciliation", async () => {
    await delay(LATENCY);
    return json(reconcile());
  }),

  /* AI draft */
  http.post("/api/ai/draft-alert", async ({ request }) => {
    await delay(LATENCY * 3);
    const body = (await request.json()) as { description: string; severity?: string; type?: string };
    if (!body.description?.trim()) {
      return json({ error: "Describe what happened first" }, { status: 400 });
    }
    const severity = body.severity ?? "WARNING";
    const park = body.type ?? "Safety";
    return json({
      type: park,
      severity,
      english: `[${severity}] ${park}: ${body.description.trim()} Please follow crew instructions and stay calm.`,
      swahili: `[${severity}] ${park}: ${body.description.trim()} Tafadhali fuata maagizo ya wafanyakazi na usipate wasiwasi.`,
      recipientCount: summary().activeGuests,
    });
  }),

  /* alerts */
  http.post("/api/alerts", async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as { type: string; severity: string; message: string; parkId?: number | null };
    if (!body.message?.trim()) return json({ error: "Message required" }, { status: 400 });

    const alert: AlertRow = {
      id: nextAlertId++,
      type: body.type || "Safety",
      severity: body.severity || "INFO",
      message: body.message,
      parkId: body.parkId ?? null,
      createdAt: new Date().toISOString(),
    };
    db.alerts.unshift(alert);

    const targets = [...new Set(db.bookings.filter((b) => b.status === "ACTIVE").map((b) => b.guestId))];
    for (const guestId of targets) {
      db.deliveries.push({
        id: db.deliveries.length + 1,
        alertId: alert.id,
        guestId,
        channel: "sms",
        status: "DELIVERED",
      });
    }

    return json({ ...alert, deliveries: db.deliveries.filter((d) => d.alertId === alert.id) }, { status: 201 });
  }),

  http.get("/api/alerts", async () => {
    await delay(LATENCY);
    return json(
      db.alerts.map((a) => ({
        ...a,
        parkName: db.parks.find((p) => p.id === a.parkId)?.name ?? null,
        deliveries: db.deliveries
          .filter((d) => d.alertId === a.id)
          .map((d) => ({ ...d, guestName: guest(d.guestId).name })),
      })),
    );
  }),

  /* rates */
  http.get("/api/rates", async () => {
    await delay(LATENCY);
    return json({
      parks: db.parks,
      packages: db.packages,
      parkFees: db.fees.map((f) => ({
        ...f,
        parkName: db.parks.find((p) => p.id === f.parkId)?.name,
      })),
      seasons: db.seasons,
      vehicles: db.vehicles,
      drivers: db.drivers,
    });
  }),

  ...(["packages", "parks"] as const).map((entity) =>
    http.get(`/api/rates/${entity}`, async () => {
      await delay(LATENCY);
      return json(entity === "packages" ? db.packages : db.parks);
    }),
  ),

  http.patch("/api/rates/:entity/:id", async ({ params, request }) => {
    await delay(LATENCY);
    const { entity, id } = params as { entity: string; id: string };
    const body = (await request.json()) as Record<string, unknown>;

    const tables: Record<string, any[]> = {
      parkFees: db.fees,
      seasons: db.seasons,
      vehicles: db.vehicles,
      drivers: db.drivers,
      packages: db.packages,
      parks: db.parks,
    };
    const table = tables[entity];
    if (!table) return json({ error: "Unknown rate entity" }, { status: 404 });
    const row = table.find((r) => r.id === Number(id));
    if (!row) return json({ error: "Not found" }, { status: 404 });

    for (const [key, value] of Object.entries(body)) {
      if (key === "startDate" || key === "endDate") {
        row[key] = String(value).slice(0, 10);
      } else {
        row[key] = value;
      }
    }
    return json(row);
  }),
];
