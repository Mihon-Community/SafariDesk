import { NextResponse, type NextRequest } from "next/server";
import type { Permission, Role } from "./lib/permissions";
import { hasPermission } from "./lib/permissions";

/**
 * Route protection. Runs before the page renders:
 * - unauthenticated visitors to operator routes go to /sign-in?next=…
 * - signed-in users hitting an auth page go back to their home
 * - role-aware UX guard: a signed-in user opening a route their role cannot use
 *   is redirected to that role's home (`sd_role` cookie set by the backend).
 *
 * This is a convenience only — every API route still enforces permissions and
 * remains the source of truth.
 */
const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

/** Route prefix → permission needed to open it. */
const ROUTE_PERMISSION: ReadonlyArray<readonly [string, Permission]> = [
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

/** Where each role lands after sign-in. */
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

function roleHome(role: string | undefined): string {
  return (role && ROLE_HOME[role as Role]) || "/dashboard";
}

function matchesPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("sd_access")?.value);
  const role = request.cookies.get("sd_role")?.value;

  const isAuthPage = AUTH_PAGES.some((p) => matchesPrefix(p, pathname));
  if (isAuthPage) {
    if (!hasSession) return NextResponse.next();
    const next = request.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/") ? next : roleHome(role);
    return NextResponse.redirect(new URL(target, request.url));
  }

  const needsAuth =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    ROUTE_PERMISSION.some(([prefix]) => matchesPrefix(prefix, pathname));
  if (needsAuth && !hasSession) {
    const next = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/sign-in?next=${next}`, request.url));
  }

  if (hasSession && role) {
    const rule = ROUTE_PERMISSION.find(([prefix]) => matchesPrefix(prefix, pathname));
    if (rule && !hasPermission(role as Role, rule[1])) {
      return NextResponse.redirect(new URL(roleHome(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets, images and API routes.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images/|mockServiceWorker.js).*)",
  ],
};
