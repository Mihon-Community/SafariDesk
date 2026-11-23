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

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function api<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const token = useAuth.getState().token;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: "Network error — is the server reachable?" });
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 401 && !path.startsWith("/api/auth")) {
    useAuth.getState().logout();
  }
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
