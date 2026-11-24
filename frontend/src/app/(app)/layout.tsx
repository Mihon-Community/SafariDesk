import { AppShell, RequireAuth } from "@/components/AppShell";
import { RouteTransition } from "@/components/motion/RouteTransition";

/**
 * Authenticated routes always render per request: their data comes from the
 * API (or MSW in mock mode) on the client, so they must never be prerendered
 * at build time.
 */
export const dynamic = "force-dynamic";

export default function AppGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAuth>
      <AppShell>
        {/* Page-level fade/slide; the shell itself stays mounted. */}
        <RouteTransition>{children}</RouteTransition>
      </AppShell>
    </RequireAuth>
  );
}
