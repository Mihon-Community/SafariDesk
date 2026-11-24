import pino from "pino";

/**
 * Structured JSON logs. Auth events go through here; never pass passwords,
 * tokens or cookies to a log call — redact at the call site.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
    censor: "[redacted]",
  },
});
