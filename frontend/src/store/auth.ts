import { create } from "zustand";

export interface SessionUser {
  id: number;
  email: string;
  role: "admin" | "staff";
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
}

const TOKEN_KEY = "sd_token";
const USER_KEY = "sd_user";

function readStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

/**
 * Server data lives in TanStack Query only; Zustand holds just the auth
 * session and tiny UI state (sidebar), per the frontend guide.
 */
export const useAuth = create<AuthState>((set) => ({
  token: typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  setSession: (token, user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    set({ token, user });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    set({ token: null, user: null });
  },
}));
