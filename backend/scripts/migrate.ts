/**
 * Applies backend/migrations/*.sql in filename order and records them in
 * schema_migrations so re-runs are no-ops.
 *
 *   npm run migrate                 # uses DATABASE_URL
 *   DATABASE_URL=... npm run migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { config } from "../src/config";
import { logger } from "../src/logger";

async function main() {
  if (!config.databaseUrl) {
    logger.error("DATABASE_URL is required for npm run migrate");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const dir = path.resolve(__dirname, "..", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
    const done = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) {
        logger.info({ file }, "migration already applied");
        continue;
      }
      const sql = readFileSync(path.join(dir, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        logger.info({ file }, "migration applied");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error({ err }, "migrate failed");
  process.exit(1);
});
