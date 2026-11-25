import { NextResponse, type NextRequest } from "next/server";
import { canOpenRoute, matchesRoutePrefix, ROUTE_PERMISSION } from "./lib/route-permissions";
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
const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

function roleHome(role: string | undefined): string {
  return (role && ROLE_HOME[role as keyof typeof ROLE_HOME]) || "/dashboard";
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("sd_access")?.value);
  const role = request.cookies.get("sd_role")?.value;

  const isAuthPage = AUTH_PAGES.some((p) => matchesRoutePrefix(p, pathname));
  if (isAuthPage) {
    if (!hasSession) return NextResponse.next();
    // A signed-in user hitting an auth page goes home, or to `next` only when
    // that route is actually theirs (no more "all roles land on /dashboard").
    const home = roleHome(role);
    const requested = request.nextUrl.searchParams.get("next");
    const target =
      requested && requested.startsWith("/") && requested.startsWith(home)
        ? requested
        : home;
    return NextResponse.redirect(new URL(target, request.url));
  }

  const needsAuth =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    ROUTE_PERMISSION.some(([prefix]) => matchesRoutePrefix(prefix, pathname));
  if (needsAuth && !hasSession) {
    const next = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/sign-in?next=${next}`, request.url));
  }

  if (hasSession && role) {
    if (!canOpenRoute(role as keyof typeof ROLE_HOME, pathname)) {
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
