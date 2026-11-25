"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/store/auth";
import { ROLE_HOME } from "@/lib/roles";

/**
 * Client companion to `proxy.ts`: sends already-signed-in users away from auth
 * pages — to their role's home, not a hardcoded dashboard. The server-side
 * proxy remains the authoritative guard.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    router.replace(ROLE_HOME[user.role] ?? "/dashboard");
  }, [user, router]);

  if (user) return null;
  return <>{children}</>;
}
