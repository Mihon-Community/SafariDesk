import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { AuthService } from "../auth/service";
import { AuthError } from "../auth/service";
import { hasPermission, type Permission } from "../auth/permissions";
import { accessTokenFrom } from "../routes/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Awaited<ReturnType<AuthService["resolveAccess"]>>;
    }
  }
}

/** Attaches req.user when a valid access token is presented; 401 otherwise. */
export function requireAuth(service: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await service.resolveAccess(accessTokenFrom(req));
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Admin-only guard (invite). Returns the actor id or throws. */
export function requireAdmin(service: AuthService) {
  return async (req: Request): Promise<string> => {
    const user = await service.resolveAccess(accessTokenFrom(req));
    if (user.role !== "admin" && user.role !== "super_admin") {
      throw new AuthError(403, "FORBIDDEN", "Admin role required.");
    }
    return user.id;
  };
}

/**
 * Permission gate. Pair with requireAuth so req.user is populated; responds
 * 403 with the standard JSON error body when the role lacks the permission.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AuthError(401, "UNAUTHENTICATED", "Sign in required."));
      return;
    }
    if (!hasPermission(req.user.role, permission)) {
      next(new AuthError(403, "FORBIDDEN", `Missing permission ${permission}.`));
      return;
    }
    next();
  };
}
