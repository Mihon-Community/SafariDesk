"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ReceiptText,
  Star,
  Truck,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { useRealtime } from "@/hooks/useRealtime";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bookings", label: "Bookings", icon: CalendarRange },
  { to: "/bookings/new", label: "New booking", icon: PlusCircle },
  { to: "/dispatch", label: "Dispatch", icon: Truck },
  { to: "/payments", label: "Payments", icon: ReceiptText },
  { to: "/alerts", label: "Alerts", icon: BellRing },
  { to: "/rates", label: "Rates", icon: Star },
  { to: "/feedback", label: "Feedback", icon: Star },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active =
          to === "/dashboard" ? pathname === to : pathname.startsWith(to.split("/").slice(0, 2).join("/")) && !(to === "/bookings" && pathname.startsWith("/bookings/new"));
        return (
          <Link
            key={to}
            href={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Redirects unauthenticated users to /sign-in (Phase 7 replaces this with middleware + cookies). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!token) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [token, pathname, router]);

  if (!token) return null;
  return <>{children}</>;
}

/** Authenticated shell: sidebar on desktop, drawer + top bar on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const router = useRouter();

  // Live updates are active anywhere inside the authenticated shell.
  useRealtime();

  function handleLogout() {
    logout();
    router.replace("/sign-in");
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#143c2c] md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-[#143c2c]">
            S
          </div>
          <div>
            <p className="text-base font-semibold leading-none text-white">SafariDesk</p>
            <p className="mt-1 text-xs leading-none text-white/60">Operator dashboard</p>
          </div>
        </Link>
        <NavItems />
        <div className="mt-auto border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {initials(user?.email ?? "Admin")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.email ?? "Admin"}</p>
              <p className="text-xs capitalize text-white/60">{user?.role ?? "admin"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Sign out"
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <p className="text-sm font-semibold">SafariDesk</p>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#143c2c]">
            <div className="flex items-center justify-between px-5 py-5">
              <p className="text-base font-semibold text-white">SafariDesk</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                className="text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto border-t border-white/10 p-4">
              <p className="truncate text-sm text-white/80">{user?.email ?? "Admin"}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
