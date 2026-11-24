"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";

/**
 * Full-screen interstitial shown after sign-out ("Signed out — see you on the
 * next safari"). Auto-redirects to `/` after 3 seconds.
 */
export function SignedOutScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.assign("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="space-y-5 text-center">
        <div
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] text-2xl font-bold text-white"
          aria-hidden
        >
          S
        </div>
        <div>
          <p className="text-lg font-semibold">Signed out</p>
          <p className="mt-1 text-sm text-muted-foreground">
            See you on the next safari. Redirecting…
          </p>
        </div>
        <Link href="/sign-in" className="text-sm font-medium text-primary hover:underline">
          Sign in again
        </Link>
      </div>
    </motion.div>
  );
}
