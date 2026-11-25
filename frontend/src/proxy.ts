import { NextResponse, type NextRequest } from "next/server";
import type { Permission, Role } from "./lib/permissions";
import { hasPermission } from "./lib/permissions";
import { ROLE_HOME } from "./lib/roles";

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
const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/accept-invite"] as const;

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

function roleHome(role: string | undefined): string {
  return (role && ROLE_HOME[role as Role]) || "/dashboard";
}

function matchesPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessCookie = request.cookies.get("sd_access")?.value;
  const role = request.cookies.get("sd_role")?.value;
  const mockMode = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const isAuthPage = AUTH_PAGES.some((p) => matchesPrefix(p, pathname));

  // A real backend session uses a JWT, while MSW sessions use a numeric mock
  // user id. When switching to mocks, expire old server cookies so the client
  // auth gate and the mock /me handler agree that the user is signed out.
  if (mockMode && accessCookie && !/^\d+$/.test(accessCookie)) {
    const next = pathname + request.nextUrl.search;
    const response = isAuthPage
      ? NextResponse.next()
      : NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, request.url));
    response.cookies.set("sd_access", "", { path: "/", maxAge: 0 });
    response.cookies.set("sd_refresh", "", { path: "/api/auth", maxAge: 0 });
    response.cookies.set("sd_role", "", { path: "/", maxAge: 0 });
    return response;
  }

  const hasSession = Boolean(accessCookie);

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
