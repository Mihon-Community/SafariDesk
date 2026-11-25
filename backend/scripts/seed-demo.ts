/**
 * Seeds one demo user per role (dev only). Idempotent: upserts by email.
 *
 *   npm run seed:demo
 *   DEMO_PASSWORD=... npm run seed:demo
 */
import { Pool } from "pg";

import { config } from "../src/config";
import { logger } from "../src/logger";
import { hashPassword } from "../src/auth/passwords";
import { id } from "../src/auth/repository";
import { ROLES, type Role } from "../src/auth/types";

const DEMO: Array<{ role: Role; email: string; name: string }> = [
  { role: "admin", email: "demo-admin@safaridesk.app", name: "Demo Admin" },
  { role: "operations", email: "ops@safaridesk.app", name: "Demo Operations" },
  { role: "finance", email: "finance@safaridesk.app", name: "Demo Finance" },
  { role: "agent", email: "agent@safaridesk.app", name: "Demo Agent" },
  { role: "driver", email: "driver@safaridesk.app", name: "Demo Driver" },
  { role: "customer", email: "amina@example.com", name: "Amina Otieno" },
];

async function main() {
  if (config.isProd) {
    logger.error("Refusing to seed demo users in production");
    process.exit(1);
  }
  if (!config.databaseUrl) {
    logger.error("DATABASE_URL is required for npm run seed:demo");
    process.exit(1);
  }
  const password = process.env.DEMO_PASSWORD ?? "password123";
  const hash = await hashPassword(password);
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    for (const account of DEMO) {
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
        [id("usr"), account.name, account.email, hash, account.role],
      );
      logger.info({ email: account.email, role: account.role }, "demo user seeded");
    }
    logger.info({ roles: ROLES.length, password }, "demo seed complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
