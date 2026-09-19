-- Adds suspension geometry and tyre pressure columns to `setups`, so a saved
-- setup can hold everything the game's setup screen shows — and everything
-- the companion already captures in `sessions.setup_snapshot`.
--
-- Read the warning in 2026-08-13-add-lap-telemetry-columns.sql before
-- deploying: drizzle-orm builds every SELECT with an explicit column list,
-- never `SELECT *`. The moment the API server ships with these columns in
-- its schema, every query against `setups` — the setups list, the community
-- setups board, setup import — fails with "column does not exist" until they
-- are present. Run this BEFORE (or immediately after) deploying the server.
--
-- Safe to re-run: every statement is IF NOT EXISTS. Each column is NOT NULL
-- with a constant default, which Postgres 11+ stores as catalog metadata
-- rather than rewriting the table, so this is a fast lock and no backfill.

ALTER TABLE setups
  ADD COLUMN IF NOT EXISTS front_camber         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rear_camber          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS front_toe            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rear_toe             text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS front_tyre_pressure  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rear_tyre_pressure   text NOT NULL DEFAULT '';

-- Verification — should report 6.
SELECT count(*) AS added_columns
FROM information_schema.columns
WHERE table_name = 'setups'
  AND column_name IN (
    'front_camber', 'rear_camber', 'front_toe', 'rear_toe',
    'front_tyre_pressure', 'rear_tyre_pressure'
  );
