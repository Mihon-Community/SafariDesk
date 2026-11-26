/**
 * Shared API contract for SafariDesk.
 * Mirrors the backend guide: JSON, JWT, error shape { error, code? }.
 * Money is integer KES everywhere. Phones are E.164 (+254...).
 */

export type BookingStatus =
  | "PENDING"
  | "DEPOSIT_PAID"
  | "CONFIRMED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export const BOOKING_STATUSES: BookingStatus[] = [
  "PENDING",
  "DEPOSIT_PAID",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

export type Residency = "citizen" | "resident" | "non_resident";
export const RESIDENCIES: Residency[] = ["citizen", "resident", "non_resident"];

export type AssignmentStatus = "WAITING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "WAITING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
];

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "MANUAL";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export const ALERT_SEVERITIES: AlertSeverity[] = ["INFO", "WARNING", "CRITICAL"];
export type BookingSource = "web" | "ussd" | "sms";

export interface Guest {
  id: number;
  name: string;
  phone: string;
  email?: string;
  residency: Residency;
  loyaltyPoints?: number;
  referralCode?: string | null;
}

export interface Park {
  id: number;
  name: string;
  emergencyContact?: string | null;
}

export interface Package {
  id: number;
  name: string;
  shortLabel: string;
  parkId: number;
  days: number;
  marginPct: number;
  active: boolean;
  parkName?: string;
}

export interface QuoteBreakdown {
  parkFees: number;
  conservancy: number;
  transport: number;
  seasonAdjustment: number;
  margin: number;
}

export interface Quote {
  total: number;
  depositDue: number;
  breakdown: QuoteBreakdown;
}

export interface QuoteInput {
  packageId: number;
  pax: number;
  residency: Residency;
  start: string; // ISO date yyyy-MM-dd
  depositPct?: number; // default 30 on the server
}

export interface CreateBookingInput {
  guestName: string;
  phone: string;
  packageId: number;
  startDate: string;
  pax: number;
  residency: Residency;
  depositPct: number;
}

export interface Booking {
  id: number;
  guestId: number;
  packageId: number | null;
  parkId: number | null;
  startDate: string;
  endDate: string;
  tripDays?: number;
  pax: number;
  total: number;
  depositDue: number;
  quoteStatus?: "REQUESTED" | "QUOTED";
  destinationName?: string;
  pickupLocation?: string;
  quoteSmsAccepted?: boolean;
  paymentInstructions?: string | null;
  quoteBreakdown: QuoteBreakdown | null;
  status: BookingStatus;
  source: BookingSource;
  createdAt: string;
  // joined fields supplied by the list/detail endpoints
  guest?: Guest;
  packageName?: string;
  parkName?: string;
}

export interface MessageEntry {
  id: number;
  direction: "in" | "out";
  phone?: string;
  body: string;
  channel: "sms" | "ussd" | "voice";
  createdAt: string;
}

/** GET /api/bookings/:id returns the booking with its related records. */
export interface BookingWithRelations extends Booking {
  payments: Payment[];
  assignment: Assignment | null;
  messages: MessageEntry[];
}

export interface Payment {
  id: number;
  bookingId: number | null;
  phone: string;
  providerRef: string | null;
  mpesaRef: string | null;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
}

export interface MarkPaidInput {
  reference: string;
}

export interface Driver {
  id: number;
  name: string;
  phone: string;
  dayRate: number;
  certExpiry: string | null;
  active: boolean;
  assignments?: Assignment[];
}

export interface Vehicle {
  id: number;
  plate: string;
  capacity: number;
  dayRate: number;
  insuranceExpiry: string | null;
  active: boolean;
  assignments?: Assignment[];
}

export interface AssignInput {
  driverId: number;
  vehicleId: number;
}

export interface Assignment {
  id: number;
  bookingId: number;
  driverId: number;
  vehicleId: number | null;
  status: AssignmentStatus;
  tripStart: string;
  tripEnd: string;
  smsSentAt: string | null;
  respondedAt: string | null;
  driver?: Driver;
  vehicle?: Vehicle | null;
  booking?: Booking;
}

/** 409 conflict body carries the clashing booking so the UI can name it. */
export interface ConflictBody {
  error: string;
  code: "CONFLICT";
  booking?: Booking;
  clash?: { driverId?: number; vehicleId?: number };
}

export interface ReconciliationRow {
  id: number;
  bookingId: number | null;
  phone: string;
  mpesaRef: string | null;
  providerRef: string | null;
  amount: number;
  status: PaymentStatus;
  depositDue: number | null;
  guestName: string | null;
  createdAt: string;
}

export interface Reconciliation {
  matched: ReconciliationRow[];
  unmatched: ReconciliationRow[];
  mismatched: ReconciliationRow[];
}

export interface MonthlyDemand {
  month: string; // YYYY-MM
  bookings: number;
  revenue?: number;
}

export interface DepartingTrip {
  id: number;
  guestName: string;
  packageName: string;
  startDate: string;
  pax: number;
  status: BookingStatus;
}

export interface AnalyticsSummary {
  byStatus: Partial<Record<BookingStatus, number>>;
  revenuePaid: number;
  depositsDue: number;
  departing7Days: DepartingTrip[];
  unallocated: number;
  monthly: MonthlyDemand[];
  activeGuests: number;
}

export interface AlertDelivery {
  id: number;
  alertId: number;
  guestId: number;
  guestName?: string;
  channel: "sms" | "voice";
  status: "SENT" | "DELIVERED" | "FAILED" | "PENDING";
  failureReason?: string | null;
}

export interface SafetyAlert {
  id: number;
  type: string;
  severity: AlertSeverity;
  message: string;
  parkId: number | null;
  parkName?: string | null;
  createdBy?: number | null;
  createdAt: string;
  deliveries?: AlertDelivery[];
}

export interface CreateAlertInput {
  type: string;
  severity: AlertSeverity;
  message: string;
  swahiliMessage?: string;
  parkId?: number | null;
}

export interface DraftAlertInput {
  description: string;
  type?: string;
  severity?: AlertSeverity;
  parkId?: number | null;
}

export interface DraftAlertResult {
  type: string;
  severity: AlertSeverity;
  english: string;
  swahili: string;
  recipientCount: number;
}

export interface FeedbackEntry {
  id: number;
  bookingId: number;
  rating: number | null;
  comment: string | null;
  sentiment: string | null;
  topics: string[] | null;
  createdAt: string;
  guestName?: string | null;
  packageName?: string | null;
}

/* ----------------------------- rate tables ----------------------------- */

export interface ParkFee {
  id: number;
  parkId: number;
  parkName?: string;
  residency: Residency;
  perPersonPerDay: number;
  conservancyPerPersonDay: number;
  effectiveFrom: string;
}

export interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  multiplier: number;
}

export interface RateEntity {
  drivers: Driver[];
  vehicles: Vehicle[];
  parks: Park[];
  packages: Package[];
  parkFees: ParkFee[];
  seasons: Season[];
}

export interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: "admin" | "staff" };
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}
