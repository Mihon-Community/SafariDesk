import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { Pool } from "pg";

import { config } from "./config";
import { logger } from "./logger";
import { MemoryRepository } from "./auth/memoryStore";
import { PgRepository } from "./auth/pgStore";
import type { AuthRepository } from "./auth/repository";
import { AuthService } from "./auth/service";
import { bootstrapAdmin } from "./auth/bootstrap";
import { authRouter } from "./routes/auth";
import { requireAdmin, requireAuth, requirePermission } from "./middleware/auth";
import { errorMiddleware, notFound } from "./middleware/error";
import { UsersService } from "./auth/users";
import { usersRouter } from "./routes/users";

export function createApp(
  repo: AuthRepository = new MemoryRepository(),
  service?: AuthService,
): { app: Express; service: AuthService } {
  const authService = service ?? new AuthService(repo);
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

  return { app, service: authService };
}

/**
 * Start the server. Uses Postgres when DATABASE_URL is set, otherwise the
 * in-memory store (dev/tests). The demo admin is bootstrapped unless disabled.
 */
export async function start(): Promise<void> {
  const repo = config.databaseUrl
    ? new PgRepository(new Pool({ connectionString: config.databaseUrl }))
    : new MemoryRepository();
  const { app } = createApp(repo);
  if (config.nodeEnv !== "production") await bootstrapAdmin(repo);

  app.listen(config.port, () => {
    logger.info(
      { port: config.port, store: config.databaseUrl ? "postgres" : "memory" },
      `SafariDesk API listening on :${config.port} (${config.databaseUrl ? "PgRepository" : "MemoryRepository"})`,
    );
    if (!config.databaseUrl) {
      logger.info("DATABASE_URL not set — using the in-memory auth store (data resets on restart).");
    }
  });
}
