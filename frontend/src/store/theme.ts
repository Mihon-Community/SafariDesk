import { create } from "zustand";

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  storedTheme,
  type ThemeId,
} from "@/lib/themes";

interface ThemeState {
  /** Colour palette ([data-theme]); mode (light/dark/system) is next-themes' job. */
  theme: ThemeId;
  setTheme: (next: ThemeId) => void;
}

/** Persists the palette to localStorage and applies it to <html data-theme>. */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (next) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // private mode etc. — still switch for this session
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
    set({ theme: next });
  },
}));

/** Hydrate the persisted palette once on the client. */
export function loadStoredTheme() {
  const stored = storedTheme();
  if (isThemeId(stored)) useThemeStore.getState().setTheme(stored);
}
