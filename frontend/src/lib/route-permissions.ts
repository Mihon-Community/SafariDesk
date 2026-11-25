import { hasPermission, type Permission, type Role } from "./permissions";

/** Route prefix → permission needed to open it. Shared by the proxy and the client. */
export const ROUTE_PERMISSION: ReadonlyArray<readonly [string, Permission]> = [
  ["/dashboard", "reports:read"],
  ["/bookings", "bookings:read"],
  ["/dispatch", "dispatch:read"],
  ["/payments", "payments:read"],
  ["/alerts", "alerts:read"],
  ["/rates", "rates:read"],
  ["/feedback", "feedback:read"],
  ["/users", "users:read"],
  ["/driver", "dispatch:read"],
  ["/my-trips", "concierge:use"],
];

export function matchesRoutePrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function permissionForRoute(pathname: string): Permission | undefined {
  return ROUTE_PERMISSION.find(([prefix]) => matchesRoutePrefix(prefix, pathname))?.[1];
}

/** UX-only route check. The backend remains the source of truth for data access. */
export function canOpenRoute(role: Role | undefined | null, pathname: string): boolean {
  const permission = permissionForRoute(pathname);
  return !permission || hasPermission(role, permission);
}
