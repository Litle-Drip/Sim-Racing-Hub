-- Adds the two "has this side seen the result?" flags behind the
-- "you won / you lost" notification on a completed rival challenge.
--
-- Run this BEFORE (or alongside) the deploy that ships them. drizzle-orm
-- names every column explicitly in its SELECTs, so the moment the server
-- carries these in its schema, every query against rival_challenges — the
-- reads included — fails until the columns exist.
--
-- Safe to re-run: both are IF NOT EXISTS. NOT NULL DEFAULT false on an
-- existing table is a catalog-only change in modern Postgres (no rewrite),
-- and false is the right value for challenges completed before this
-- shipped only for ones still worth surfacing — so the backfill below marks
-- everything already completed as seen, rather than greeting every driver
-- with a pile of notifications for results they saw weeks ago.

ALTER TABLE rival_challenges
  ADD COLUMN IF NOT EXISTS creator_seen_result boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opponent_seen_result boolean NOT NULL DEFAULT false;

UPDATE rival_challenges
SET creator_seen_result = true, opponent_seen_result = true
WHERE status = 'completed';
