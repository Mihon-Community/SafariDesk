import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

function tokenMatches(expected: string, candidate: string): boolean {
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const digestMatches = timingSafeEqual(expectedDigest, candidateDigest);
  return digestMatches && Buffer.byteLength(expected, "utf8") === Buffer.byteLength(candidate, "utf8");
}

function candidateToken(req: Request, allowHeaders: boolean): string | null {
  const query = req.query["token"];
  // A present query token takes precedence. A bad query token is never rescued
  // by a valid proxy header or Authorization value.
  if (query !== undefined) return typeof query === "string" ? query : null;
  if (!allowHeaders) return null;

  const proxyToken = req.get("x-webhook-token");
  if (proxyToken !== undefined) return proxyToken;
  const authorization = req.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
  return match?.[1] ?? null;
}

/** AT callbacks authenticate with a query token; selected API hooks also accept
 * the ngrok-injected header or a bearer token. */
export function requireWebhookSecret(expected: string, allowHeaders = false): RequestHandler {
  return (req, res, next) => {
    if (Buffer.byteLength(expected, "utf8") < 32) {
      if (req.path === "/ussd") sendUssdEnd(res, "USSD is not configured yet.", 503);
      else res.status(503).json({ error: "Callback authentication is not configured.", code: "WEBHOOK_NOT_CONFIGURED" });
      return;
    }
    const candidate = candidateToken(req, allowHeaders);
    if (candidate === null || !tokenMatches(expected, candidate)) {
      if (req.path === "/ussd") sendUssdEnd(res, "Invalid callback authentication.", 401);
      else res.status(401).json({ error: "Unauthorized callback.", code: "WEBHOOK_UNAUTHORIZED" });
      return;
    }
    next();
  };
}

/** Use an AT-compatible END response for errors after USSD authentication. */
export function sendUssdEnd(res: Response, message: string, status = 200): void {
  res.status(status).type("text/plain; charset=utf-8").send(`END ${message}`);
}
