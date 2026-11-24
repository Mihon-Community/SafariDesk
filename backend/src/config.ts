import "dotenv/config";

/** Environment-driven config. Defaults work locally with nothing set. */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  /** Postgres DSN. When unset the API falls back to the in-memory store (dev/tests). */
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-insecure-secret-change-me",
  accessTtlSeconds: Number(process.env.ACCESS_TTL_SECONDS ?? 15 * 60),
  refreshTtlSeconds: Number(process.env.REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 30),
  inviteTtlDays: Number(process.env.INVITE_TTL_DAYS ?? 7),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  /** Failed sign-ins before a temporary lockout. */
  maxFailedAttempts: Number(process.env.MAX_FAILED_ATTEMPTS ?? 5),
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES ?? 15),
  isProd: process.env.NODE_ENV === "production",
} as const;
