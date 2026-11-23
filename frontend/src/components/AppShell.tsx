"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  CalendarRange,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ReceiptText,
  Search,
  Star,
  Truck,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import type { SafetyAlert } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { useUiStore, loadStoredSidebar } from "@/store/ui";
import { useRealtime } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { ThemeMenu } from "@/components/ThemeMenu";
import { CommandPalette, COMMAND_OPEN_EVENT } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

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

/** Phones get the five most-used routes as a bottom tab bar. */
const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/bookings", label: "Bookings", icon: CalendarRange },
  { to: "/bookings/new", label: "New", icon: PlusCircle },
  { to: "/dispatch", label: "Dispatch", icon: Truck },
  { to: "/alerts", label: "Alerts", icon: BellRing },
];

function isActive(pathname: string, to: string) {
  const section = `/${to.split("/")[1]}`;
  return (
    pathname === to ||
    (pathname.startsWith(section) && !(to === "/bookings" && pathname.startsWith("/bookings/new")))
  );
}

function NavItems({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = isActive(pathname, to);
        return (
          <Link
            key={to}
            href={to}
            onClick={onNavigate}
            title={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-brand-foreground/15 text-brand-foreground"
                : "text-brand-foreground/70 hover:bg-brand-foreground/10 hover:text-brand-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

function NotificationsMenu() {
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<SafetyAlert[]>("/api/alerts"),
  });
  const alerts = query.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card shadow-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Notifications (${alerts.length})`}
        >
          <BellRing className="h-4 w-4" />
          {alerts.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {alerts.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Safety alerts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {query.isLoading && <p className="px-2 py-4 text-sm text-muted-foreground">Loading…</p>}
        {alerts.length === 0 && query.isSuccess && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No alerts sent yet.</p>
        )}
        {alerts.slice(0, 6).map((a) => (
          <div key={a.id} className="px-2 py-1.5 text-sm">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  a.severity === "CRITICAL"
                    ? "destructive"
                    : a.severity === "WARNING"
                      ? "warning"
                      : "secondary"
                }
              >
                {a.severity}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.message}</p>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ email, role }: { email: string; role: string }) {
  const logout = useAuth((s) => s.logout);
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          {initials(email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{email}</span>
          <span className="block text-xs capitalize text-muted-foreground">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/users">Users &amp; roles</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            logout();
            router.replace("/sign-in");
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Redirects unauthenticated users to /sign-in (Phase 7 replaces this with middleware + cookies). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const hydrate = useAuth((s) => s.hydrate);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !token) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, token, pathname, router]);

  if (!hydrated || !token) return null;
  return <>{children}</>;
}

/** Authenticated shell: collapsible sidebar, top bar, bottom tabs on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();

  // Live updates are active anywhere inside the authenticated shell.
  useRealtime();

  // Restore the persisted sidebar preference after mount (avoids a hydration mismatch).
  useEffect(() => {
    loadStoredSidebar();
  }, []);

  function handleLogout() {
    logout();
    router.replace("/sign-in");
  }

  function openSearch() {
    window.dispatchEvent(new Event(COMMAND_OPEN_EVENT));
  }

  return (
    <div className="min-h-dvh bg-background pb-16 md:pb-0">
      {/* Desktop sidebar (collapses to icons) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-brand transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-5 py-5"
          title="SafariDesk dashboard"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground">
            S
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-none text-brand-foreground">
                SafariDesk
              </p>
              <p className="mt-1 text-xs leading-none text-brand-foreground/60">Operator dashboard</p>
            </div>
          )}
        </Link>
        <NavItems collapsed={collapsed} />
        <div className="mt-auto border-t border-brand-foreground/10 p-3">
          {collapsed ? (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-md text-brand-foreground/70 hover:bg-brand-foreground/10 hover:text-brand-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-foreground/15 text-xs font-semibold text-brand-foreground">
                {initials(user?.email ?? "Admin")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-brand-foreground">{user?.email ?? "Admin"}</p>
                <p className="text-xs capitalize text-brand-foreground/60">{user?.role ?? "admin"}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Sign out"
                className="text-brand-foreground/70 hover:bg-brand-foreground/10 hover:text-brand-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card px-3 py-2.5 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="touch-target"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <p className="text-sm font-semibold">SafariDesk</p>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={openSearch}
            aria-label="Search pages"
            className="touch-target inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-secondary"
          >
            <Search className="h-5 w-5" />
          </button>
          <NotificationsMenu />
          <ThemeMenu />
        </div>
      </header>

      {/* Mobile drawer: tap the backdrop or swipe right to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStart !== null && e.changedTouches[0].clientX - touchStart > 60) {
              setMobileOpen(false);
            }
            setTouchStart(null);
          }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-brand">
            <div className="flex items-center justify-between px-5 py-5">
              <p className="text-base font-semibold text-brand-foreground">SafariDesk</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                className="text-brand-foreground/70 hover:bg-brand-foreground/10 hover:text-brand-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavItems collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto space-y-3 border-t border-brand-foreground/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-brand-foreground/80">{user?.email ?? "Admin"}</p>
                <ThemeMenu />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-brand-foreground/30 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className={cn("transition-[padding] duration-200", collapsed ? "md:pl-16" : "md:pl-64")}>
        <div
          className={cn(
            "page-shell px-4 py-4 sm:px-6 sm:py-6 lg:py-8",
            pathname === "/dashboard" && "page-shell-dashboard",
          )}
        >
          {/* Desktop top bar */}
          <div className="mb-6 hidden items-center gap-2 md:flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </Button>
            <button
              onClick={openSearch}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-secondary sm:max-w-sm"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Search pages…</span>
              <kbd className="ml-auto hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] sm:inline">
                ⌘K
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <NotificationsMenu />
              <ThemeMenu />
              <UserMenu email={user?.email ?? "Admin"} role={user?.role ?? "admin"} />
            </div>
          </div>

          {children}
        </div>
      </main>

      {/* Bottom tab bar (phones) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = isActive(pathname, to);
            return (
              <Link
                key={to}
                href={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 py-1.5 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette />
    </div>
  );
}
