"use client";

import { useEffect, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { loadStoredTheme } from "@/store/theme";

/**
 * Theming bootstrap (Phase 2):
 * - next-themes owns light/dark/system mode (.dark class on <html>).
 * - the colour palette lives in the zustand theme store ([data-theme] attribute),
 *   hydrated here once to avoid a flash of the wrong palette.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    loadStoredTheme();
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
