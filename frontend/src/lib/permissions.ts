/**
 * Role → permission map, mirrored from backend/src/auth/permissions.ts.
 * backend/tests/permissions.sync.test.ts fails if the two drift apart.
 */
export const ROLES = [
  "super_admin",
  "admin",
  "operations",
  "dispatcher",
  "finance",
  "agent",
  "driver",
  "customer",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "bookings:read",
  "bookings:write",
  "dispatch:read",
  "dispatch:write",
  "drivers:read",
  "drivers:write",
  "vehicles:read",
  "vehicles:write",
  "payments:read",
  "payments:mark",
  "payments:refund",
  "rates:read",
  "rates:write",
  "feedback:read",
  "feedback:write",
  "alerts:read",
  "alerts:write",
  "reports:read",
  "users:read",
  "users:manage",
  "invites:send",
  "audit:read",
  "settings:manage",
  "concierge:use",
  "itinerary:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_OPERATIONAL: Permission[] = [
  "bookings:read",
  "bookings:write",
  "dispatch:read",
  "dispatch:write",
  "drivers:read",
  "drivers:write",
  "vehicles:read",
  "vehicles:write",
  "payments:read",
  "payments:mark",
  "payments:refund",
  "rates:read",
  "rates:write",
  "feedback:read",
  "feedback:write",
  "alerts:read",
  "alerts:write",
  "reports:read",
  "users:read",
  "users:manage",
  "invites:send",
  "concierge:use",
  "itinerary:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [...ALL_OPERATIONAL, "audit:read", "settings:manage"],
  admin: ALL_OPERATIONAL,
  operations: [
    "bookings:read",
    "bookings:write",
    "dispatch:read",
    "dispatch:write",
    "drivers:read",
    "drivers:write",
    "vehicles:read",
    "vehicles:write",
    "payments:read",
    "alerts:read",
    "alerts:write",
    "feedback:read",
    "reports:read",
    "itinerary:read",
  ],
  dispatcher: [
    "bookings:read",
    "dispatch:read",
    "dispatch:write",
    "drivers:read",
    "drivers:write",
    "vehicles:read",
    "payments:read",
    "alerts:read",
    "alerts:write",
    "itinerary:read",
  ],
  finance: [
    "bookings:read",
    "payments:read",
    "payments:mark",
    "payments:refund",
    "rates:read",
    "feedback:read",
    "reports:read",
  ],
  agent: [
    "bookings:read",
    "bookings:write",
    "rates:read",
    "feedback:read",
    "feedback:write",
    "concierge:use",
    "itinerary:read",
  ],
  driver: ["dispatch:read", "bookings:read", "itinerary:read", "drivers:read"],
  customer: [
    "bookings:read",
    "payments:read",
    "feedback:write",
    "concierge:use",
    "itinerary:read",
  ],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  role: Role | undefined | null,
  permission: Permission,
): boolean {
  if (!role) return false;
  return permissionsFor(role).includes(permission);
}
