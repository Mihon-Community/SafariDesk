import { useAuth } from "../store/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(body?.error ?? body?.message ?? `Request failed (${status})`);
    this.name = "ApiError";
  }

  get code(): string | undefined {
    return this.body?.code;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** Single in-flight refresh shared across concurrent 401s. */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Fetch wrapper for the JSON API. Cookies carry the session (httpOnly on the
 * server); an Authorization header is also sent when a client-side token is
 * present. A 401 triggers one silent
 * refresh before the request is retried exactly once.
 */
export async function api<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const token = useAuth.getState().token;

  const doFetch = () =>
    fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, { error: "Network error — is the server reachable?" });
  }

  if (res.status === 401 && !path.startsWith("/api/auth")) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      useAuth.getState().setSignedOut();
      throw new ApiError(401, { error: "Your session has ended.", code: "SESSION_ENDED" });
    }
    try {
      res = await doFetch();
    } catch {
      throw new ApiError(0, { error: "Network error — is the server reachable?" });
    }
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Build a /api/bookings query string from filters. */
export function bookingsQuery(filters: {
  status?: string;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
