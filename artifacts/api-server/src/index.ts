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
  top_gear INTEGER,
  fuel_remaining_laps REAL,
  actual_tyre_compound TEXT,
  tyre_age_laps INTEGER,
  pit_stops INTEGER,
  fuel_capacity REAL,
  starting_fuel_kg REAL,
  engine_max_rpm INTEGER,
  engine_temperature INTEGER,
  vehicle_fia_flags INTEGER,
  tyre_pressure_live JSONB,
  floor_damage INTEGER,
  diffuser_damage INTEGER,
  sidepod_damage INTEGER,
  gear_box_damage INTEGER,
  engine_damage INTEGER,
  live_brake_bias INTEGER
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
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_remaining_laps REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_tyre_compound TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_age_laps INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pit_stops INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_capacity REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS starting_fuel_kg REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS engine_max_rpm INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS engine_temperature INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS vehicle_fia_flags INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_pressure_live JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS floor_damage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS diffuser_damage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sidepod_damage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gear_box_damage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS engine_damage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_brake_bias INTEGER;

-- Everything below had drifted out of this block. Columns added after
-- live_brake_bias went into lib/db/sql/ only, on the convention that the DDL
-- there gets run by hand at deploy time. That convention failed twice — on
-- 2026-08-13 and again on 2026-09-12 — and it fails the same way each time:
-- drizzle names every column explicitly in its SELECTs, so one column missing
-- from the database makes Postgres reject *every* query against that table,
-- reads included, and the whole app stops loading. Not the new feature. The
-- app.
--
-- So this block is the safety net again, and the rule is now: a column goes in
-- lib/db/sql/ for the record AND here so it applies itself on deploy. All of
-- it is idempotent and no-ops against a database that is already correct.

-- from 2026-08-13-add-lap-telemetry-columns.sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_damage JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS brakes_damage JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_blisters JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tyre_inner_temps JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS engine_wear JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ers_harvested_this_lap REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_mix INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS speed_trap_kph REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS flashbacks INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS collisions INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS safety_car_periods INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS red_flags INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_warnings INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS corner_cutting_warnings INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS best_lap_num INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS best_sector1_lap_num INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS best_sector2_lap_num INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS best_sector3_lap_num INTEGER;

-- from 2026-08-15-add-friendships-and-track-notes-constraint.sql
CREATE TABLE IF NOT EXISTS friendships (
  id            TEXT PRIMARY KEY,
  requester_id  TEXT NOT NULL,
  addressee_id  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_uniq ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);
CREATE UNIQUE INDEX IF NOT EXISTS track_notes_uniq ON track_notes (user_id, track_id);

-- rival_challenges had no CREATE anywhere — not here, not in lib/db/sql —
-- because it was only ever created by a hand-run "drizzle-kit push". Any
-- environment that never had that run by hand has no table, and the two
-- ALTERs below then fail. Creating it here first closes that hole; it is a
-- no-op wherever the table already exists.
CREATE TABLE IF NOT EXISTS rival_challenges (
  id                  TEXT PRIMARY KEY,
  creator_id          TEXT NOT NULL,
  opponent_id         TEXT NOT NULL,
  track_id            TEXT NOT NULL,
  car                 TEXT NOT NULL,
  lap_count           INTEGER NOT NULL DEFAULT 1,
  message             TEXT NOT NULL DEFAULT '',
  creator_session_id  TEXT NOT NULL,
  opponent_session_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMP
);
CREATE INDEX IF NOT EXISTS rival_challenges_creator_id_idx ON rival_challenges (creator_id);
CREATE INDEX IF NOT EXISTS rival_challenges_opponent_id_idx ON rival_challenges (opponent_id);

-- from 2026-08-15-add-rival-challenge-seen-result.sql
ALTER TABLE rival_challenges ADD COLUMN IF NOT EXISTS creator_seen_result BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rival_challenges ADD COLUMN IF NOT EXISTS opponent_seen_result BOOLEAN NOT NULL DEFAULT FALSE;

-- from 2026-08-16-add-setup-geometry-columns.sql
ALTER TABLE setups ADD COLUMN IF NOT EXISTS front_camber TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS rear_camber TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS front_toe TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS rear_toe TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS front_tyre_pressure TEXT NOT NULL DEFAULT '';
ALTER TABLE setups ADD COLUMN IF NOT EXISTS rear_tyre_pressure TEXT NOT NULL DEFAULT '';

-- from 2026-08-18-add-leagues.sql
CREATE TABLE IF NOT EXISTS leagues (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  owner_id     TEXT NOT NULL,
  join_code    TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS leagues_join_code_uniq ON leagues (join_code);
CREATE INDEX IF NOT EXISTS leagues_owner_idx ON leagues (owner_id);
CREATE TABLE IF NOT EXISTS league_members (
  id         TEXT PRIMARY KEY,
  league_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS league_members_uniq ON league_members (league_id, user_id);
CREATE INDEX IF NOT EXISTS league_members_league_idx ON league_members (league_id);
CREATE INDEX IF NOT EXISTS league_members_user_idx ON league_members (user_id);

-- from 2026-09-11-add-pb-history-car-identity.sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS was_pb BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_year INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS packet_format INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS content_era TEXT;
CREATE TABLE IF NOT EXISTS car_aliases (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  team_id    INTEGER NOT NULL,
  label      TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS car_aliases_uniq ON car_aliases (user_id, team_id);
CREATE INDEX IF NOT EXISTS sessions_user_team_idx ON sessions (user_id, team_id);
`;

// The personal-best backfill, kept apart from the DDL because it is the one
// piece here that does real work rather than no-op against a correct database.
// It rewrites both PB flags from lap times, which is what stops a driver
// staring at the old "every lap that was ever a record keeps its badge"
// behaviour until their next session upload happens to recalculate it.
//
// Cheap to repeat: both statements only write rows whose flag actually
// changes, so every boot after the first one writes nothing. Safe to delete
// once it has run everywhere.
const BACKFILL_SQL = `
UPDATE sessions
SET is_pb = FALSE, was_pb = FALSE
WHERE (is_pb OR was_pb)
  AND best_lap !~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
  AND best_lap !~ '^[0-9]+(\.[0-9]+)?$';
WITH parsed AS (
  SELECT id, user_id, track_id, date, created_at,
    CASE
      WHEN best_lap ~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
        THEN split_part(best_lap, ':', 1)::numeric * 60 + split_part(best_lap, ':', 2)::numeric
      WHEN best_lap ~ '^[0-9]+(\.[0-9]+)?$'
        THEN best_lap::numeric
    END AS lap_seconds
  FROM sessions
),
ranked AS (
  SELECT id,
    lap_seconds IS NOT NULL
      AND row_number() OVER (
            PARTITION BY user_id, track_id, (lap_seconds IS NULL)
            ORDER BY lap_seconds, date, created_at
          ) = 1 AS should_hold_pb
  FROM parsed
)
UPDATE sessions s SET is_pb = r.should_hold_pb
FROM ranked r
WHERE s.id = r.id AND s.is_pb IS DISTINCT FROM r.should_hold_pb;
WITH parsed AS (
  SELECT id, user_id, track_id, date, created_at,
    CASE
      WHEN best_lap ~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
        THEN split_part(best_lap, ':', 1)::numeric * 60 + split_part(best_lap, ':', 2)::numeric
      WHEN best_lap ~ '^[0-9]+(\.[0-9]+)?$'
        THEN best_lap::numeric
    END AS lap_seconds
  FROM sessions
),
timed AS (
  SELECT id, lap_seconds,
    min(lap_seconds) OVER (
      PARTITION BY user_id, track_id
      ORDER BY date, created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS best_before
  FROM parsed
  WHERE lap_seconds IS NOT NULL
)
UPDATE sessions s SET was_pb = (t.best_before IS NULL OR t.lap_seconds < t.best_before)
FROM timed t
WHERE s.id = t.id
  AND s.was_pb IS DISTINCT FROM (t.best_before IS NULL OR t.lap_seconds < t.best_before);
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

  await applyStatements(MIGRATE_SQL, "migration");
  await applyStatements(BACKFILL_SQL, "backfill");
}

// Statement at a time, deliberately.
//
// node-postgres sends a multi-statement string as one simple query, which
// Postgres runs in an implicit transaction — so a single failing statement
// rolls back every other statement in the batch, including the ones that
// already succeeded. Verified against Postgres 16: in a three-statement batch
// whose middle statement referenced a missing table, the first statement's
// column was not added either.
//
// That is the worst possible shape for a migration that is meant to be a
// safety net. One statement referring to something absent in one environment
// (a table created by `drizzle-kit push` rather than by a file here, say)
// would silently undo the whole block, and the old code caught the error and
// logged it, so the app would come up looking fine and serving 500s.
//
// Running them one by one means a statement that cannot apply costs only
// itself, and says so by name in the logs.
async function applyStatements(sql: string, label: string): Promise<void> {
  // Comments come out first, then the split. Doing it the other way round
  // means a semicolon inside a comment — ordinary punctuation in a sentence —
  // cuts the comment in half and feeds its tail to Postgres as a statement.
  // Splitting on semicolons is safe once the comments are gone: nothing in
  // these statements contains one inside a string literal or a dollar-quoted
  // body.
  const statements = sql
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map(stmt => stmt.trim())
    .filter(stmt => stmt !== "");

  let applied = 0;
  const failures: string[] = [];

  for (const statement of statements) {
    try {
      await pool.query(statement);
      applied++;
    } catch (err) {
      // First line only — enough to identify the statement without dumping a
      // whole CREATE TABLE body into the logs.
      const summary = statement.split("\n")[0]?.trim().slice(0, 120) ?? "";
      failures.push(summary);
      logger.error({ err, statement: summary }, `Failed to apply ${label} statement`);
    }
  }

  if (failures.length > 0) {
    logger.error(
      { applied, failed: failures.length, failures },
      `Database ${label} partially applied — the app may be serving a schema the code does not match`,
    );
  } else {
    logger.info({ applied }, `Database ${label} applied`);
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
