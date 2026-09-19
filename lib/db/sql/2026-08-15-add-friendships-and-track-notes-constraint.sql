-- Two changes that both have to reach Postgres before (or with) the deploy
-- that ships them.
--
-- 1. `friendships` — new table behind the friends list. Nothing reads it
--    until the table exists, so creating it is the whole migration.
--
-- 2. `track_notes_uniq` — the unique constraint on (user_id, track_id) that
--    the schema has always declared. `PUT /api/track-notes/:trackId` used
--    `INSERT ... ON CONFLICT (user_id, track_id) DO UPDATE`, which Postgres
--    rejects outright with "there is no unique or exclusion constraint
--    matching the ON CONFLICT specification" when the constraint is absent —
--    every save of a corner note failed with a 500. The route no longer
--    depends on ON CONFLICT, but the constraint still belongs there to keep
--    a user from accumulating duplicate note rows for one track.
--
-- Safe to re-run: the table creation is IF NOT EXISTS, and the constraint is
-- added inside a DO block that checks for it first (Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS friendships (
  id            text PRIMARY KEY,
  requester_id  text NOT NULL,
  addressee_id  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamp NOT NULL DEFAULT now(),
  responded_at  timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_uniq
  ON friendships (requester_id, addressee_id);

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);

-- Collapse any duplicate track-note rows a missing constraint let through,
-- keeping the most recently updated row per (user, track), so the unique
-- index below can be created.
DELETE FROM track_notes t
USING track_notes newer
WHERE t.user_id = newer.user_id
  AND t.track_id = newer.track_id
  AND (newer.updated_at, newer.id) > (t.updated_at, t.id);

CREATE UNIQUE INDEX IF NOT EXISTS track_notes_uniq
  ON track_notes (user_id, track_id);
