import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";

import { config } from "../config";

export interface AccessClaims {
  sub: string;
  role: string;
  type: "access";
}

/** Short-lived access token. Stateless so `/auth/me` needs no DB hit. */
export function signAccessToken(userId: string, role: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ sub: userId, role, type: "access" }, config.jwtSecret, {
    expiresIn: config.accessTtlSeconds,
  });
  return { token, expiresAt: new Date(Date.now() + config.accessTtlSeconds * 1000) };
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    if (typeof claims !== "object" || claims === null) return null;
    const candidate = claims as Record<string, unknown>;
    if (candidate["type"] !== "access" || typeof candidate["sub"] !== "string") return null;
    return { sub: candidate["sub"], role: String(candidate["role"] ?? ""), type: "access" };
  } catch {
    return null;
  }
}

/** Refresh tokens are opaque; only their sha256 is persisted. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
