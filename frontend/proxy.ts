import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Phase 7). Runs before the page renders:
 * - unauthenticated visitors to operator routes go to /sign-in?next=…
 * - signed-in users hitting an auth page go back to their dashboard
 *
 * Cookie names mirror backend/src/routes/auth.ts (`sd_access`).
 */
const PROTECTED = [
  "/dashboard",
  "/bookings",
  "/dispatch",
  "/payments",
  "/alerts",
  "/rates",
  "/feedback",
  "/users",
  "/settings",
] as const;

const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("sd_access")?.value);

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAuthPage) {
    if (!hasSession) return NextResponse.next();
    const next = request.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/") ? next : "/dashboard";
    return NextResponse.redirect(new URL(target, request.url));
  }

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !hasSession) {
    const next = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/sign-in?next=${next}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets, images and API routes.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images/|mockServiceWorker.js).*)",
  ],
};
