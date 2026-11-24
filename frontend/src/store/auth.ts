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
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: SessionUser };
    return body.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Session state. Access/refresh tokens live in httpOnly cookies set by the API,
 * so nothing secret is written to localStorage.
 */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrated: false,
  hydrate: async () => {
    const user = await fetchCurrentUser();
    set({ user, hydrated: true });
  },
  setSession: (user, token = null) => set({ user, token, hydrated: true }),
  setSignedOut: () => set({ user: null, token: null }),
  logout: async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } catch {
      /* signing out is best-effort; local state clears either way */
    }
    set({ user: null, token: null });
    // The proxy reads this non-sensitive hint; clear it with the session.
    document.cookie = "sd_role=; Path=/; Max-Age=0";
  },
}));
