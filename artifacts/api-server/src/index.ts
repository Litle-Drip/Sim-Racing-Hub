import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  track_id TEXT NOT NULL,
  car TEXT NOT NULL,
  type TEXT NOT NULL,
  best_lap TEXT NOT NULL DEFAULT '',
  avg_lap TEXT NOT NULL DEFAULT '',
  worst_lap TEXT NOT NULL DEFAULT '',
  s1 TEXT NOT NULL DEFAULT '',
  s2 TEXT NOT NULL DEFAULT '',
  s3 TEXT NOT NULL DEFAULT '',
  tires TEXT NOT NULL DEFAULT '',
  fuel_load REAL NOT NULL DEFAULT 0,
  conditions TEXT NOT NULL DEFAULT '',
  assists TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  penalty TEXT NOT NULL DEFAULT '',
  game_version TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  input_device TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at TIMESTAMP,
  public_note TEXT,
  laps JSONB,
  position TEXT NOT NULL DEFAULT '',
  is_pb BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  track_temperature INTEGER,
  air_temperature INTEGER,
  total_laps INTEGER,
  pit_speed_limit INTEGER,
  safety_car_status INTEGER,
  fuel_in_tank REAL,
  ers_deploy_mode INTEGER,
  ers_energy_stored REAL,
  ers_deployed_this_lap REAL,
  tyre_wear JSONB,
  wing_damage JSONB,
  tyre_surface_temps JSONB,
  brake_temps JSONB,
  setup_snapshot JSONB,
  tyre_stints JSONB,
  lap_history JSONB,
  ai_difficulty INTEGER,
  top_speed_kph REAL,
  avg_throttle_pct REAL,
  avg_brake_pct REAL,
  drs_activations INTEGER,
  max_rpm INTEGER,
  top_gear INTEGER
);

CREATE TABLE IF NOT EXISTS setups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  car TEXT NOT NULL,
  track_id TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  front_wing TEXT NOT NULL DEFAULT '',
  rear_wing TEXT NOT NULL DEFAULT '',
  front_arb TEXT NOT NULL DEFAULT '',
  rear_arb TEXT NOT NULL DEFAULT '',
  front_ride_height TEXT NOT NULL DEFAULT '',
  rear_ride_height TEXT NOT NULL DEFAULT '',
  front_springs TEXT NOT NULL DEFAULT '',
  rear_springs TEXT NOT NULL DEFAULT '',
  brake_bias TEXT NOT NULL DEFAULT '',
  brake_pressure TEXT NOT NULL DEFAULT '',
  on_throttle TEXT NOT NULL DEFAULT '',
  off_throttle TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  game_version TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setup_ratings (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL,
  rater_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT setup_ratings_uniq UNIQUE (setup_id, rater_id)
);

CREATE TABLE IF NOT EXISTS track_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  corners JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_difficulty (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT track_difficulty_uniq UNIQUE (user_id, track_id)
);

CREATE TABLE IF NOT EXISTS hardware_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  peripheral_type TEXT NOT NULL DEFAULT 'Wheel Base',
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  game TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  ffb_strength TEXT NOT NULL DEFAULT '',
  max_force TEXT NOT NULL DEFAULT '',
  damper TEXT NOT NULL DEFAULT '',
  friction TEXT NOT NULL DEFAULT '',
  linearity TEXT NOT NULL DEFAULT '',
  steering_range TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const MIGRATE_SQL = `
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_version TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS input_device TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS game_version TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS public_note TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS time_of_day TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS laps JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_pb BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS track_temperature INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS air_temperature INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_laps INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pit_speed_limit INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS safety_car_status INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_in_tank REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ers_deploy_mode INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ers_energy_stored REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ers_deployed_this_lap REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_wear JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wing_damage JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_surface_temps JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS brake_temps JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS setup_snapshot JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_stints JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lap_history JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_difficulty INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS top_speed_kph REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS avg_throttle_pct REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS avg_brake_pct REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drs_activations INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_rpm INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS top_gear INTEGER;
`;

async function ensureDatabase(): Promise<void> {
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
    await pool.query(CREATE_TABLES_SQL);
    logger.info("Database tables verified / created");
  } catch (err) {
    logger.error({ err }, "Failed to create database tables");
    throw err;
  }

  try {
    await pool.query(MIGRATE_SQL);
    logger.info("Database migration applied");
  } catch (err) {
    logger.error({ err }, "Failed to apply migration");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureDatabase()
  .catch(() => { /* already logged */ })
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  });
