import "dotenv/config";
import { isKenyanE164Phone } from "./lib/phone";

const allowedAtPhones = (process.env.AT_ALLOWED_PHONES ?? "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);

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
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  /** Failed sign-ins before a temporary lockout. */
  maxFailedAttempts: Number(process.env.MAX_FAILED_ATTEMPTS ?? 5),
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES ?? 15),
  at: {
    username: process.env.AT_USERNAME?.trim() ?? "",
    apiKey: process.env.AT_API_KEY?.trim() ?? "",
    senderId: process.env.AT_SENDER_ID?.trim() ?? "",
    testPhone: process.env.AT_TEST_PHONE?.trim() ?? "",
    ussdServiceCode: process.env.AT_USSD_SERVICE_CODE?.trim() ?? "",
    allowedPhones: allowedAtPhones,
    webhookToken: process.env.WEBHOOK_TOKEN?.trim() ?? "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() ?? "",
    publicAppUrl: process.env.PUBLIC_APP_URL?.trim() ?? "",
  },
  isProd: process.env.NODE_ENV === "production",
} as const;

/** Validate telecom settings at startup without ever including secret values. */
export function validateRuntimeConfig(): void {
  const errors: string[] = [];
  const { at } = config;

  if (Boolean(at.username) !== Boolean(at.apiKey)) {
    errors.push("AT_USERNAME and AT_API_KEY must either both be set or both be empty.");
  }
  if (at.apiKey && !at.webhookToken) {
    errors.push("WEBHOOK_TOKEN is required when Africa's Talking is enabled.");
  }
  if (at.username.length > 100) errors.push("AT_USERNAME is too long.");
  if (at.apiKey.length > 512) errors.push("AT_API_KEY is too long.");
  if (at.senderId.length > 32) errors.push("AT_SENDER_ID is too long.");
  if (at.webhookToken && Buffer.byteLength(at.webhookToken, "utf8") < 32) {
    errors.push("WEBHOOK_TOKEN must contain at least 32 bytes.");
  }
  if (at.publicBaseUrl) {
    try {
      const url = new URL(at.publicBaseUrl);
      if (
        url.protocol !== "https:" ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      ) {
        errors.push("PUBLIC_BASE_URL must be an HTTPS origin with no path, query, or credentials.");
      }
    } catch {
      errors.push("PUBLIC_BASE_URL must be a valid HTTPS origin.");
    }
  }
  if (at.publicAppUrl) {
    try {
      const url = new URL(at.publicAppUrl);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
        errors.push("PUBLIC_APP_URL must use HTTPS (HTTP is allowed for localhost development).");
      }
    } catch {
      errors.push("PUBLIC_APP_URL must be a valid URL.");
    }
  }
  if (at.testPhone && !isKenyanE164Phone(at.testPhone)) {
    errors.push("AT_TEST_PHONE must be a Kenyan E.164 number such as +2547XXXXXXXX.");
  }
  if (at.allowedPhones.some((phone) => !isKenyanE164Phone(phone))) {
    errors.push("Every AT_ALLOWED_PHONES entry must be a Kenyan E.164 number.");
  }
  if (at.ussdServiceCode && !/^\*[0-9*]{1,30}#$/.test(at.ussdServiceCode)) {
    errors.push("AT_USSD_SERVICE_CODE must look like *123#.");
  }
  if (errors.length) throw new Error(`Invalid communications configuration: ${errors.join(" ")}`);
}
