import { config } from "../config";
import { logger } from "../logger";
import type { AuthRepository } from "./repository";
import { id } from "./repository";
import { hashPassword } from "./passwords";

/**
 * Seeds the first admin from ADMIN_EMAIL / ADMIN_PASSWORD so a fresh install is
 * usable immediately. Skips silently when the values are unset or the account
 * already exists (idempotent).
 */
export async function bootstrapAdmin(repo: AuthRepository): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    logger.info(
      "ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin bootstrap. Public sign-up still works.",
    );
    return;
  }
  if (await repo.findUserByEmail(email)) return;

  await repo.createUser({
    id: id("usr"),
    name: process.env.ADMIN_NAME ?? "SafariDesk Admin",
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: "admin",
    status: "active",
  });
  logger.info({ email }, "bootstrapped admin user");
  void config;
}
