import type { Role } from "./permissions";

/** Where each role lands after sign-in (mirrors frontend/src/proxy.ts). */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/dashboard",
  admin: "/dashboard",
  operations: "/dispatch",
  dispatcher: "/dispatch",
  finance: "/payments",
  agent: "/bookings",
  driver: "/driver",
  customer: "/my-trips",
};

/** UX-only group shown above the sign-in form. The backend decides the real role. */
export type SignInGroup = "traveller" | "driver" | "staff" | "admin";

export const SIGN_IN_GROUPS: Array<{ id: SignInGroup; label: string; hint: string }> = [
  { id: "traveller", label: "Traveller", hint: "Your trips, itineraries and payments." },
  { id: "driver", label: "Driver", hint: "Today's assignments and trip status." },
  { id: "staff", label: "Staff", hint: "Bookings, dispatch, rates and feedback." },
  { id: "admin", label: "Admin", hint: "Users, settings and audit log." },
];

/** Roles offered at self-signup — never admin/super_admin. */
export const SIGNUP_ROLES: Array<{
  role: Role;
  title: string;
  blurb: string;
  needsApproval: boolean;
}> = [
  { role: "customer", title: "Traveller", blurb: "Book and manage your own safaris.", needsApproval: false },
  { role: "driver", title: "Driver", blurb: "Drive safari trips; needs admin approval.", needsApproval: true },
  { role: "agent", title: "Sales / front desk", blurb: "Create quotes and bookings; needs approval.", needsApproval: true },
  { role: "operations", title: "Operations / dispatch", blurb: "Allocate drivers and vehicles; needs approval.", needsApproval: true },
  { role: "finance", title: "Finance", blurb: "Payments, invoices and revenue; needs approval.", needsApproval: true },
];
