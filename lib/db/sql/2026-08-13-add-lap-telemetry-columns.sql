-- Adds the session-level telemetry columns introduced with the expanded F1
-- 25/26 lap capture (PR #117).
--
-- This repo drives schema with `drizzle-kit push` rather than migration
-- files, so this script is the hand-written equivalent of that push for
-- these columns specifically — useful when you'd rather not have drizzle
-- diff the entire schema against production.
--
-- Why it matters: drizzle-orm builds every SELECT with an explicit column
-- list, never `SELECT *`. The moment the API server ships with these
-- columns in its schema, every query against `sessions` — reads included,
-- not just companion uploads — fails with "column does not exist" until
-- they are present. Run this BEFORE (or immediately after) deploying the
-- server, or the whole app stops loading.
--
-- Safe to re-run: every statement is IF NOT EXISTS. Every column is
-- nullable with no default, so Postgres adds them as a catalog-only change
-- — no table rewrite, no backfill, no extended lock.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tyre_damage             jsonb,
  ADD COLUMN IF NOT EXISTS brakes_damage           jsonb,
  ADD COLUMN IF NOT EXISTS tyre_blisters           jsonb,
  ADD COLUMN IF NOT EXISTS tyre_inner_temps        jsonb,
  ADD COLUMN IF NOT EXISTS engine_wear             jsonb,
  ADD COLUMN IF NOT EXISTS ers_harvested_this_lap  real,
  ADD COLUMN IF NOT EXISTS fuel_mix                integer,
  ADD COLUMN IF NOT EXISTS speed_trap_kph          real,
  ADD COLUMN IF NOT EXISTS flashbacks              integer,
  ADD COLUMN IF NOT EXISTS collisions              integer,
  ADD COLUMN IF NOT EXISTS safety_car_periods      integer,
  ADD COLUMN IF NOT EXISTS red_flags               integer,
  ADD COLUMN IF NOT EXISTS total_warnings          integer,
  ADD COLUMN IF NOT EXISTS corner_cutting_warnings integer,
  ADD COLUMN IF NOT EXISTS best_lap_num            integer,
  ADD COLUMN IF NOT EXISTS best_sector1_lap_num    integer,
  ADD COLUMN IF NOT EXISTS best_sector2_lap_num    integer,
  ADD COLUMN IF NOT EXISTS best_sector3_lap_num    integer;

-- Verification — every row should report 18.
SELECT count(*) AS added_columns
FROM information_schema.columns
WHERE table_name = 'sessions'
  AND column_name IN (
    'tyre_damage', 'brakes_damage', 'tyre_blisters', 'tyre_inner_temps',
    'engine_wear', 'ers_harvested_this_lap', 'fuel_mix', 'speed_trap_kph',
    'flashbacks', 'collisions', 'safety_car_periods', 'red_flags',
    'total_warnings', 'corner_cutting_warnings', 'best_lap_num',
    'best_sector1_lap_num', 'best_sector2_lap_num', 'best_sector3_lap_num'
  );
