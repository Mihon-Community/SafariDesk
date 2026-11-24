import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { AuthError } from "../auth/service";
import { UsersService } from "../auth/users";
import { contextFrom } from "./auth";

const updateSchema = z.object({
  role: z.enum(["super_admin", "admin", "operations", "dispatcher", "finance", "agent", "driver", "customer"]).optional(),
  status: z.enum(["active", "invited", "disabled"]).optional(),
});

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    handler(req, res).catch(next);
  };
}

/** /api/users — admin management table backing the Phase 8 UI. */
export function usersRouter(
  service: UsersService,
  authGuard: RequestHandler,
  readGuard: RequestHandler,
  manageGuard: RequestHandler,
) {
  const router = Router();

  router.get(
    "/",
    authGuard,
    readGuard,
    wrap(async (_req, res) => {
      res.json({ users: await service.list() });
    }),
  );

  router.patch(
    "/:id",
    authGuard,
    manageGuard,
    wrap(async (req, res) => {
      if (!req.user) throw new AuthError(401, "UNAUTHENTICATED", "Sign in required.");
      const body = updateSchema.parse(req.body);
      if (!body.role && !body.status) {
        throw new AuthError(400, "NOTHING_TO_UPDATE", "Provide a role or status.");
      }
      const user = await service.update(req.user.id, String(req.params["id"]), body, contextFrom(req));
      res.json({ user });
    }),
  );

  router.post(
    "/:id/password-reset",
    authGuard,
    manageGuard,
    wrap(async (req, res) => {
      if (!req.user) throw new AuthError(401, "UNAUTHENTICATED", "Sign in required.");
      const result = await service.requestPasswordReset(req.user.id, String(req.params["id"]), contextFrom(req));
      res.json(result);
    }),
  );

  return router;
}
