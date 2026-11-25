import { create } from "zustand";

/** Mirrors backend/src/auth/types.ts. */
export const ROLES = [
  "super_admin",
  "admin",
  "operations",
  "finance",
  "agent",
  "driver",
  "customer",
] as const;
export type AuthRole = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  name?: string;
  email: string;
  role: AuthRole;
  status: "active" | "invited" | "disabled";
  lastLoginAt?: string | null;
}

interface AuthState {
  /** Server session (httpOnly cookie). Present only when signed in. */
  user: SessionUser | null;
  /**
   * Client-side bearer token. Optional and never persisted to localStorage —
   * the real backend uses cookies; MSW dev mocks may set this instead.
   */
  token: string | null;
  /** False until the stored session has been checked; keeps SSR and first render identical. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (user: SessionUser, token?: string | null) => void;
  setSignedOut: () => void;
  logout: () => Promise<void>;
}

async function fetchCurrentUser(): Promise<SessionUser | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch("/api/auth/me", { credentials: "include", signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: SessionUser };
    return body.user ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

let pendingHydration: Promise<void> | null = null;
let sessionVersion = 0;

/**
 * Session state. Access/refresh tokens live in httpOnly cookies set by the API,
 * so nothing secret is written to localStorage.
 */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrated: false,
  hydrate: () => {
    if (pendingHydration) return pendingHydration;
    const version = sessionVersion;
    pendingHydration = fetchCurrentUser()
      .then((user) => {
        // A late `/me` response must not overwrite a session changed in flight.
        if (version === sessionVersion) set({ user, hydrated: true });
      })
      .finally(() => {
        pendingHydration = null;
      });
    return pendingHydration;
  },
  setSession: (user, token = null) => {
    sessionVersion += 1;
    set({ user, token, hydrated: true });
  },
  setSignedOut: () => {
    sessionVersion += 1;
    set({ user: null, token: null, hydrated: true });
  },
  logout: async () => {
    sessionVersion += 1;
    set({ user: null, token: null, hydrated: true });
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } catch {
      /* signing out is best-effort; local state clears either way */
    }
    // The proxy reads this non-sensitive hint; clear it with the session.
    document.cookie = "sd_role=; Path=/; Max-Age=0";
  },
}));
