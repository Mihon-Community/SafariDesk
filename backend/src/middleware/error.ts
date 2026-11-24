import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AuthError } from "../auth/service";
import { logger } from "../logger";

/** Uniform JSON error body: { error, code? }. */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", code: "VALIDATION", details: err.issues });
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  logger.error({ err, path: req.path }, "unhandled error");
  res.status(500).json({ error: "Internal server error", code: "INTERNAL" });
}

/** 404 for unmatched API routes. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}
