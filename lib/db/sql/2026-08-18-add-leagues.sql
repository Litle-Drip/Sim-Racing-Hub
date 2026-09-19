-- Leagues and league membership — the tables behind the league admin views
-- (leaderboard and practice-activity board). Both are new tables, so
-- creating them is the whole migration; nothing reads them until they exist.
--
-- Run this before or alongside the deploy that ships the schema change.
-- Safe to re-run: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS leagues (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  owner_id     text NOT NULL,
  join_code    text NOT NULL,
  created_at   timestamp NOT NULL DEFAULT now()
);

-- A join code has to resolve to exactly one league — POST /leagues/join
-- looks a league up by code alone.
CREATE UNIQUE INDEX IF NOT EXISTS leagues_join_code_uniq ON leagues (join_code);
CREATE INDEX IF NOT EXISTS leagues_owner_idx ON leagues (owner_id);

CREATE TABLE IF NOT EXISTS league_members (
  id         text PRIMARY KEY,
  league_id  text NOT NULL,
  user_id    text NOT NULL,
  role       text NOT NULL DEFAULT 'member',
  joined_at  timestamp NOT NULL DEFAULT now()
);

-- One membership row per driver per league; the join route relies on this
-- to keep a repeated join from stacking up duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS league_members_uniq ON league_members (league_id, user_id);
CREATE INDEX IF NOT EXISTS league_members_league_idx ON league_members (league_id);
CREATE INDEX IF NOT EXISTS league_members_user_idx ON league_members (user_id);
