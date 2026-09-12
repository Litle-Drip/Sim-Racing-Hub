-- Personal-best hygiene and car identity capture (2026-09).
--
-- Run this before or alongside the deploy that ships the matching schema
-- change — drizzle builds every SELECT with an explicit column list, so a
-- column that exists in the schema but not here breaks every read of the
-- table, not just the new feature. See lib/db/sql/README.md.

-- ── Personal bests ──────────────────────────────────────────────────────────
--
-- `is_pb` used to mean "was a record when it was set", which left several rows
-- per circuit flagged at once — a driver saw two ★ PB badges at Monza, one per
-- car. It now means "currently holds the PB for this circuit", one row per
-- (driver, circuit), and the historical meaning moves to `was_pb` so the "PBs
-- set" counters and progression charts keep working.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS was_pb BOOLEAN NOT NULL DEFAULT FALSE;

-- Both flags are recomputed from lap times by recalcPBsForUser on a driver's
-- next session write, but a driver who doesn't log anything for a month would
-- keep looking at the old badges until then, so both are backfilled here.
--
-- Lap times are stored as display strings ("1:21.500"), so ranking them means
-- parsing them in SQL. The regexes are the guard: a row whose best_lap matches
-- neither form is excluded from the ranking and has its flags cleared, rather
-- than reaching a cast that would abort the whole migration.

-- Nothing with an unusable lap time can hold or have held a record.
UPDATE sessions
SET is_pb = FALSE, was_pb = FALSE
WHERE (is_pb OR was_pb)
  AND best_lap !~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
  AND best_lap !~ '^[0-9]+(\.[0-9]+)?$';

-- is_pb: exactly the fastest session at each circuit. Ties go to the session
-- logged first, matching the earliest-wins rule the API applies.
--
-- Best effort on one point: this groups on the raw track_id where the API
-- groups on the canonical one, so a driver who logged the same circuit under
-- two aliases ("catalunya" and "barcelona") keeps a badge on each until their
-- next write settles it.
WITH parsed AS (
  SELECT
    id,
    user_id,
    track_id,
    date,
    created_at,
    CASE
      WHEN best_lap ~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
        THEN split_part(best_lap, ':', 1)::numeric * 60 + split_part(best_lap, ':', 2)::numeric
      WHEN best_lap ~ '^[0-9]+(\.[0-9]+)?$'
        THEN best_lap::numeric
    END AS lap_seconds
  FROM sessions
),
ranked AS (
  SELECT
    id,
    lap_seconds IS NOT NULL
      AND row_number() OVER (
            PARTITION BY user_id, track_id, (lap_seconds IS NULL)
            ORDER BY lap_seconds, date, created_at
          ) = 1 AS should_hold_pb
  FROM parsed
)
UPDATE sessions s
SET is_pb = r.should_hold_pb
FROM ranked r
WHERE s.id = r.id
  AND s.is_pb IS DISTINCT FROM r.should_hold_pb;

-- was_pb: beat everything logged before it at that circuit. A running minimum
-- over the rows that precede each session in chronological order, so the first
-- session at a circuit always counts.
WITH parsed AS (
  SELECT
    id,
    user_id,
    track_id,
    date,
    created_at,
    CASE
      WHEN best_lap ~ '^[0-9]+:[0-9]+(\.[0-9]+)?$'
        THEN split_part(best_lap, ':', 1)::numeric * 60 + split_part(best_lap, ':', 2)::numeric
      WHEN best_lap ~ '^[0-9]+(\.[0-9]+)?$'
        THEN best_lap::numeric
    END AS lap_seconds
  FROM sessions
),
timed AS (
  SELECT
    id,
    lap_seconds,
    min(lap_seconds) OVER (
      PARTITION BY user_id, track_id
      ORDER BY date, created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS best_before
  FROM parsed
  WHERE lap_seconds IS NOT NULL
)
UPDATE sessions s
SET was_pb = (t.best_before IS NULL OR t.lap_seconds < t.best_before)
FROM timed t
WHERE s.id = t.id
  AND s.was_pb IS DISTINCT FROM (t.best_before IS NULL OR t.lap_seconds < t.best_before);

-- ── Car and game identity ───────────────────────────────────────────────────
--
-- Raw capture context, kept alongside the resolved `car` and `game_version`
-- strings rather than instead of them. Sessions logged before this are simply
-- NULL here: the numbers they were resolved from were never stored, and there
-- is no way back — which is exactly why they are stored from now on.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_year INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS packet_format INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS content_era TEXT;

-- Driver-supplied names for cars the companion could not identify.
CREATE TABLE IF NOT EXISTS car_aliases (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  team_id    integer NOT NULL,
  label      text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- One name per team id per driver; the upsert route relies on this so a
-- repeated rename edits the existing row instead of stacking duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS car_aliases_uniq ON car_aliases (user_id, team_id);

-- Applying an alias, and listing which of a driver's sessions still carry an
-- unidentified car, both filter by user and team id.
CREATE INDEX IF NOT EXISTS sessions_user_team_idx ON sessions (user_id, team_id);
