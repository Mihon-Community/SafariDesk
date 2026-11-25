import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { Pool } from "pg";

import { config, validateRuntimeConfig } from "./config";
import { logger } from "./logger";
import { MemoryRepository } from "./auth/memoryStore";
import { PgRepository } from "./auth/pgStore";
import type { AuthRepository } from "./auth/repository";
import { AuthService } from "./auth/service";
import { bootstrapAdmin, bootstrapDemoAccounts } from "./auth/bootstrap";
import { authRouter } from "./routes/auth";
import { requireAdmin, requireAuth, requirePermission } from "./middleware/auth";
import { errorMiddleware, notFound } from "./middleware/error";
import { UsersService } from "./auth/users";
import { usersRouter } from "./routes/users";
import { africaTalkingWebhookRouter } from "./routes/webhooks";
import { AtSmsGateway, AuthSmsDelivery, type AtSettings } from "./services/at";
import { AtSmsReplyQueue, type SmsReplyQueue } from "./services/atQueue";
import { MemoryAtStore, PgAtStore, type AtStore } from "./services/atStore";

export interface AppIntegrationOptions {
  atStore?: AtStore;
  atSettings?: AtSettings;
  smsReplyQueue?: SmsReplyQueue;
  atWebhookNow?: () => Date;
  atSessionTtlMs?: number;
}

export function createApp(
  repo: AuthRepository = new MemoryRepository(),
  service?: AuthService,
  integrations: AppIntegrationOptions = {},
): { app: Express; service: AuthService; atStore: AtStore; smsGateway: AtSmsGateway } {
  const atStore = integrations.atStore ?? new MemoryAtStore();
  const atSettings = integrations.atSettings ?? config.at;
  const smsGateway = new AtSmsGateway(atSettings, atStore);
  const smsReplyQueue = integrations.smsReplyQueue ?? new AtSmsReplyQueue(smsGateway);
  const delivery = new AuthSmsDelivery(smsGateway, atSettings.publicAppUrl);
  const authService = service ?? new AuthService(repo, (event) => delivery.deliver(event));
  const usersService = new UsersService(repo, (event) => authService.notify(event));
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and configured origins only; credentials require a named origin.
        if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
        else callback(new Error(`Origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(
    africaTalkingWebhookRouter({
      webhookToken: atSettings.webhookToken,
      ussdServiceCode: atSettings.ussdServiceCode,
      allowedPhones: atSettings.allowedPhones,
      publicAppUrl: atSettings.publicAppUrl,
      store: atStore,
      replyQueue: smsReplyQueue,
      rateLimitPerMinute: Number(process.env.AT_WEBHOOK_RATE_LIMIT ?? 120),
      ...(integrations.atWebhookNow ? { now: integrations.atWebhookNow } : {}),
      ...(integrations.atSessionTtlMs ? { sessionTtlMs: integrations.atSessionTtlMs } : {}),
    }),
  );

  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "safaridesk-api" }));

  // Auth endpoints get their own limiter; tests raise the ceiling via env.
  const authLimit = Number(process.env.AUTH_RATE_LIMIT ?? 30);
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60_000,
      limit: authLimit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" },
    }),
  );

  app.use("/api/auth", authRouter(authService, requireAdmin(authService)));

  // User management: auth + per-route permission gates (Phase 8 RBAC).
  app.use(
    "/api/users",
    usersRouter(
      usersService,
      requireAuth(authService),
      requirePermission("users:read"),
      requirePermission("users:manage"),
    ),
  );
  // Everything after auth is a placeholder until the resource routers land.
  app.use("/api", notFound);
  app.use(errorMiddleware);

  return { app, service: authService, atStore, smsGateway };
}

/**
 * Start the server. Uses Postgres when DATABASE_URL is set, otherwise the
 * in-memory store (dev/tests). The demo admin is bootstrapped unless disabled.
 */
export async function start(): Promise<void> {
  validateRuntimeConfig();
  const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;
  const repo = pool ? new PgRepository(pool) : new MemoryRepository();
  const atStore = pool ? new PgAtStore(pool) : new MemoryAtStore();
  const { app } = createApp(repo, undefined, { atStore });
  if (config.nodeEnv !== "production") {
    await bootstrapAdmin(repo);
    if (!pool) await bootstrapDemoAccounts(repo);
  }

  app.listen(config.port, () => {
    logger.info(
      { port: config.port, store: config.databaseUrl ? "postgres" : "memory" },
      `SafariDesk API listening on :${config.port} (${config.databaseUrl ? "PgRepository" : "MemoryRepository"})`,
    );
    if (!config.databaseUrl) {
      logger.info("DATABASE_URL not set — using the in-memory auth store (data resets on restart).");
      if (config.at.webhookToken) {
        logger.warn("DATABASE_URL not set — Africa's Talking callback deduplication and USSD sessions will reset on restart.");
      }
    }
  });
}
