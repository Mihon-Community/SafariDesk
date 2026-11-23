"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/store/auth";

/** Sends already-signed-in users away from auth pages (Phase 7: middleware). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace("/dashboard");
  }, [token, router]);

  if (token) return null;
  return <>{children}</>;
}
