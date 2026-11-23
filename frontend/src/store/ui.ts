import { create } from "zustand";

interface UiState {
  /** Desktop sidebar collapses to icons. Mobile uses the drawer instead. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
}

const KEY = "sd_sidebar_collapsed";

// Always start expanded during SSR/hydration; AppShell hydrates the persisted
// value after mount so server and client markup match.
export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // ignore storage failures
      }
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (value) =>
    set(() => {
      try {
        localStorage.setItem(KEY, value ? "1" : "0");
      } catch {
        // ignore storage failures
      }
      return { sidebarCollapsed: value };
    }),
}));

/** Restore the persisted sidebar state once on the client. */
export function loadStoredSidebar() {
  if (typeof window === "undefined") return;
  try {
    useUiStore.getState().setSidebarCollapsed(localStorage.getItem(KEY) === "1");
  } catch {
    // ignore storage failures
  }
}
