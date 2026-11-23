"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BellRing,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  ReceiptText,
  Search,
  Settings,
  Star,
  Truck,
  Users,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";

const ROUTES = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/bookings", icon: CalendarRange },
  { label: "New booking", href: "/bookings/new", icon: PlusCircle },
  { label: "Dispatch", href: "/dispatch", icon: Truck },
  { label: "Payments", href: "/payments", icon: ReceiptText },
  { label: "Safety alerts", href: "/alerts", icon: BellRing },
  { label: "Rates", href: "/rates", icon: Star },
  { label: "Feedback", href: "/feedback", icon: Star },
  { label: "Users & roles", href: "/users", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const COMMAND_OPEN_EVENT = "sd:open-command-palette";

/** ⌘K / Ctrl-K command palette for navigation. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const logout = useAuth((s) => s.logout);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(COMMAND_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(
    () => ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]",
        open ? "" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      {open && (
        <>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
            <Command shouldFilter={false} className="flex flex-col">
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search pages…"
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                  Esc
                </kbd>
              </div>
              <Command.List className="max-h-72 overflow-y-auto p-1.5">
                {results.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No pages match “{query}”.
                  </p>
                )}
                {results.map((r) => (
                  <Command.Item
                    key={r.href}
                    value={r.label}
                    onSelect={() => {
                      setOpen(false);
                      setQuery("");
                      router.push(r.href);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-secondary"
                  >
                    <r.icon className="h-4 w-4 text-muted-foreground" />
                    {r.label}
                  </Command.Item>
                ))}
                <Command.Item
                  value="Sign out"
                  onSelect={() => {
                    setOpen(false);
                    logout();
                    router.replace("/sign-in");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive data-[selected=true]:bg-secondary"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </Command.Item>
              </Command.List>
            </Command>
          </div>
        </>
      )}
    </div>
  );
}
