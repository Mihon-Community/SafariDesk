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
  const callbackPath = ["/ussd", "/webhook/incoming", "/api/webhooks/africastalking/sms-status"].includes(req.path);
  const parserError = err && typeof err === "object"
    ? (err as { type?: unknown; status?: unknown })
    : undefined;
  if (callbackPath) {
    // Body parser errors can carry the raw callback body. Do not serialize them.
    const status = typeof parserError?.status === "number" ? parserError.status : 500;
    logger.warn({ path: req.path, result: status === 413 ? "body_too_large" : "callback_rejected" }, "Africa's Talking callback failed");
    if (req.path === "/ussd") {
      res.status(status).type("text/plain; charset=utf-8").send(`END ${status === 413 ? "Request too large." : "Invalid request. Dial again to restart."}`);
      return;
    }
    if (status === 413) {
      res.status(413).json({ error: "Callback body too large.", code: "CALLBACK_TOO_LARGE" });
      return;
    }
    if (status === 400) {
      res.status(400).json({ error: "Malformed callback.", code: "INVALID_CALLBACK" });
      return;
    }
    res.status(500).json({ error: "Callback could not be processed.", code: "CALLBACK_ERROR" });
    return;
  }
  logger.error({ err, path: req.path }, "unhandled error");
  res.status(500).json({ error: "Internal server error", code: "INTERNAL" });
}

/** 404 for unmatched API routes. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}
