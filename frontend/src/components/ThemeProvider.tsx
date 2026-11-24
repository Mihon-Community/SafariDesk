"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { loadStoredTheme } from "@/store/theme";

/**
 * Theming bootstrap (Phase 2):
 * - next-themes owns light/dark/system mode (.dark class on <html>).
 * - the colour palette lives in the zustand theme store ([data-theme] attribute),
 *   hydrated here once to avoid a flash of the wrong palette.
 *
 * Phase 6 adds a short crossfade: when the mode/palette actually changes,
 * `.theme-crossfade` is added for ~250ms so background/border colours interpolate
 * instead of snapping (skipped under prefers-reduced-motion). The observer only
 * reacts to *value* changes, so the class it adds itself cannot retrigger it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    loadStoredTheme();

    const root = document.documentElement;
    let lastClass = root.className;
    let lastTheme = root.getAttribute("data-theme");

    const startCrossfade = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      root.classList.add("theme-crossfade");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        root.classList.remove("theme-crossfade");
        lastClass = root.className; // absorb our own mutation
      }, 260);
    };

    const observer = new MutationObserver(() => {
      const nextClass = root.className;
      const nextTheme = root.getAttribute("data-theme");
      if (nextClass === lastClass && nextTheme === lastTheme) return;
      lastClass = nextClass;
      lastTheme = nextTheme;
      startCrossfade();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => {
      observer.disconnect();
      if (timer.current) window.clearTimeout(timer.current);
    };
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
