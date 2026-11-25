import { config } from "../config";
import { logger } from "../logger";
import type { AuthRepository } from "./repository";
import { id } from "./repository";
import { hashPassword } from "./passwords";
import type { Role } from "./types";

const DEV_DEMO_USERS: Array<{ role: Role; email: string; name: string }> = [
  { role: "admin", email: "demo-admin@safaridesk.app", name: "Demo Admin" },
  { role: "operations", email: "ops@safaridesk.app", name: "Demo Operations" },
  { role: "finance", email: "finance@safaridesk.app", name: "Demo Finance" },
  { role: "agent", email: "agent@safaridesk.app", name: "Demo Agent" },
  { role: "driver", email: "driver@safaridesk.app", name: "Demo Driver" },
  { role: "customer", email: "amina@example.com", name: "Amina Otieno" },
];

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

/** Seed local in-memory accounts used by the dev-only quick sign-in buttons. */
export async function bootstrapDemoAccounts(repo: AuthRepository): Promise<void> {
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD ?? "password123");
  let created = 0;

  for (const user of DEV_DEMO_USERS) {
    if (await repo.findUserByEmail(user.email)) continue;
    await repo.createUser({
      id: id("usr"),
      ...user,
      passwordHash,
      status: "active",
    });
    created += 1;
  }

  if (created > 0) logger.info({ count: created }, "bootstrapped development demo accounts");
}
