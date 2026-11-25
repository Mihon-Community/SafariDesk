import { Router, type RequestHandler } from "express";

import type { AuthRepository } from "../auth/repository";

/** /api/audit — super-admin-only read of the immutable audit trail. */
export function auditRouter(
  repo: AuthRepository,
  authGuard: RequestHandler,
  readGuard: RequestHandler,
) {
  const router = Router();

  router.get(
    "/",
    authGuard,
    readGuard,
    async (req, res, next) => {
      try {
        const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
        const entries = repo.listAudit ? await repo.listAudit(limit) : [];
        res.json({
          entries: entries.map((e) => ({
            ...e,
            createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
