import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const REQUIRED_TABLES = [
  "sessions",
  "setups",
  "setup_ratings",
  "track_notes",
  "hardware_settings",
];

async function checkDatabase(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    logger.info("Database connection OK");
  } catch (err) {
    logger.error(
      { err },
      "Cannot connect to the database. Verify DATABASE_URL is correct and the database is reachable.",
    );
    throw err;
  }

  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const existing = new Set(rows.map((r) => r.tablename));
    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
    if (missing.length > 0) {
      logger.error(
        { missing },
        "Missing database tables. Run: pnpm --filter @workspace/db run push",
      );
    } else {
      logger.info("All required database tables exist");
    }
  } catch (err) {
    logger.warn({ err }, "Could not verify database tables");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

checkDatabase()
  .catch(() => {
    /* already logged */
  })
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  });
