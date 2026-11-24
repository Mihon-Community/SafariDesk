"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/store/auth";

/**
 * Client companion to `proxy.ts`: sends already-signed-in users away from auth
 * pages. The server-side proxy is the authoritative guard.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  if (user) return null;
  return <>{children}</>;
}
