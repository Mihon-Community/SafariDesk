import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { config } from "./config";
import { logger } from "./logger";
import { MemoryRepository } from "./auth/memoryStore";
import { AuthService } from "./auth/service";
import { bootstrapAdmin } from "./auth/bootstrap";
import { authRouter } from "./routes/auth";
import { requireAdmin } from "./middleware/auth";
import { errorMiddleware, notFound } from "./middleware/error";

export function createApp(
  repo = new MemoryRepository(),
  service?: AuthService,
): { app: Express; service: AuthService } {
  const authService = service ?? new AuthService(repo);
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
  // Everything after auth is a placeholder until the resource routers land.
  app.use("/api", notFound);
  app.use(errorMiddleware);

  return { app, service: authService };
}

/** Start the server and seed the demo admin (memory store only). */
export async function start(): Promise<void> {
  const repo = new MemoryRepository();
  const { app } = createApp(repo);
  await bootstrapAdmin(repo);

  app.listen(config.port, () => {
    logger.info({ port: config.port }, `SafariDesk API listening on :${config.port}`);
    if (!config.databaseUrl) {
      logger.info("DATABASE_URL not set — using the in-memory auth store (data resets on restart).");
    }
  });
}
