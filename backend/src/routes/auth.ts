import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import type { AuthService } from "../auth/service";
import { AuthError, toPublicUser } from "../auth/service";
import type { Role } from "../auth/types";
import { ROLES } from "../auth/types";
import { logger } from "../logger";

export const ACCESS_COOKIE = "sd_access";
export const REFRESH_COOKIE = "sd_refresh";
/** Non-sensitive role hint for the frontend proxy (UX guard only). */
export const ROLE_COOKIE = "sd_role";

const credentials = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "true",
};

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setRoleCookie(res: Response, role: Role) {
  res.cookie(ROLE_COOKIE, role, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: Number(process.env.REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60) * 1000,
  });
}

export function contextFrom(req: Request) {
  const ua = req.header("user-agent") ?? null;
  const ip = req.ip ?? null;
  return { ip, userAgent: ua };
}

/** Extract the presented access token: httpOnly cookie first, header second. */
export function accessTokenFrom(req: Request): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[ACCESS_COOKIE]) return cookies[ACCESS_COOKIE];
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

export function refreshTokenFrom(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[REFRESH_COOKIE];
}

export function cookieOptions(req: Request, maxAgeSeconds?: number) {
  const base = { ...credentials, maxAge: maxAgeSeconds ? maxAgeSeconds * 1000 : undefined };
  return base;
}

const signUpSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.email().max(160),
  password: z.string().min(8).max(128),
});

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

const forgotSchema = z.object({ email: z.email() });

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(ROLES as unknown as [Role, ...Role[]]),
});

const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

/** Wrap an async handler so thrown AuthErrors reach the error middleware. */
function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    handler(req, res).catch(next);
  };
}

export function authRouter(service: AuthService, adminGuard: (req: Request) => Promise<string>) {
  const router = Router();

  router.post(
    "/sign-up",
    wrap(async (req, res) => {
      const body = signUpSchema.parse(req.body);
      const user = await service.signUp(body, contextFrom(req));
      res.status(201).json({ user });
    }),
  );

  router.post(
    "/sign-in",
    wrap(async (req, res) => {
      const body = signInSchema.parse(req.body);
      const result = await service.signIn(body, contextFrom(req));
      const refreshMaxAge = Number(process.env.REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60);
      res.cookie(ACCESS_COOKIE, result.accessToken, cookieOptions(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, {
        ...cookieOptions(req),
        path: "/api/auth",
        maxAge: refreshMaxAge * 1000,
      });
      setRoleCookie(res, result.user.role);
      res.json({ user: result.user, expiresAt: result.expiresAt.toISOString() });
    }),
  );

  router.post(
    "/refresh",
    wrap(async (req, res) => {
      const refresh = refreshTokenFrom(req);
      if (!refresh) throw new AuthError(401, "INVALID_REFRESH", "Sign in again.");
      const result = await service.refresh(refresh, contextFrom(req));
      const refreshMaxAge = Number(process.env.REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60);
      res.cookie(ACCESS_COOKIE, result.accessToken, cookieOptions(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, {
        ...cookieOptions(req),
        path: "/api/auth",
        maxAge: refreshMaxAge * 1000,
      });
      setRoleCookie(res, result.user.role);
      res.json({ user: result.user, expiresAt: result.expiresAt.toISOString() });
    }),
  );

  router.post(
    "/sign-out",
    wrap(async (req, res) => {
      const refresh = refreshTokenFrom(req);
      const access = accessTokenFrom(req);
      let userId = "anonymous";
      if (access) {
        try {
          const current = await service.resolveAccess(access);
          userId = current.id;
        } catch {
          /* signing out an expired session is still a success */
        }
      }
      await service.signOut(refresh, userId, contextFrom(req));
      res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(req), maxAge: undefined });
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(req), path: "/api/auth", maxAge: undefined });
      res.clearCookie(ROLE_COOKIE, { path: "/", maxAge: undefined });
      res.json({ ok: true });
    }),
  );

  router.get(
    "/me",
    wrap(async (req, res) => {
      const current = await service.resolveAccess(accessTokenFrom(req));
      res.json({ user: current });
    }),
  );

  router.post(
    "/forgot-password",
    wrap(async (req, res) => {
      const body = forgotSchema.parse(req.body);
      const result = await service.forgotPassword(body.email, contextFrom(req));
      res.json(result);
    }),
  );

  router.post(
    "/reset-password",
    wrap(async (req, res) => {
      const body = resetSchema.parse(req.body);
      await service.resetPassword(body.token, body.password, contextFrom(req));
      res.json({ ok: true });
    }),
  );

  router.post(
    "/invite",
    wrap(async (req, res) => {
      const actorId = await adminGuard(req);
      const body = inviteSchema.parse(req.body);
      const result = await service.invite(actorId, body.email, body.role, contextFrom(req));
      res.status(201).json(result);
    }),
  );

  router.post(
    "/accept-invite",
    wrap(async (req, res) => {
      const body = acceptInviteSchema.parse(req.body);
      const user = await service.acceptInvite(body.token, { name: body.name, password: body.password }, contextFrom(req));
      res.status(201).json({ user });
    }),
  );

  return router;
}
