import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, trackNotesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { UpsertTrackNotesBody } from "@workspace/api-zod";

const router = Router();

router.get("/track-notes/:trackId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const trackId = req.params.trackId as string;

  try {
    const [row] = await db
      .select()
      .from(trackNotesTable)
      .where(
        and(
          eq(trackNotesTable.userId, userId),
          eq(trackNotesTable.trackId, trackId)
        )
      );

    if (!row) {
      res.status(404).json({ error: "Track notes not found" });
      return;
    }

    res.json({
      id: row.id,
      trackId: row.trackId,
      corners: row.corners,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get track notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/track-notes/:trackId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const trackId = req.params.trackId as string;
  const parsed = UpsertTrackNotesBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const data = parsed.data;

  try {
    // Deliberately not `ON CONFLICT (user_id, track_id) DO UPDATE`: that
    // needs a matching unique constraint to exist in the database, and when
    // it doesn't Postgres rejects the statement outright rather than
    // degrading to a plain insert — which is what made every note save fail
    // with a 500. Read-then-write works either way. The constraint is being
    // added separately (lib/db/sql/2026-08-15-…​.sql) so duplicates can't
    // accumulate; until then, updating the row we found keeps edits landing
    // on a single row anyway.
    const [existing] = await db
      .select({ id: trackNotesTable.id })
      .from(trackNotesTable)
      .where(and(eq(trackNotesTable.userId, userId), eq(trackNotesTable.trackId, trackId)));

    const [saved] = existing
      ? await db
          .update(trackNotesTable)
          .set({ corners: data.corners, updatedAt: new Date() })
          .where(eq(trackNotesTable.id, existing.id))
          .returning()
      : await db
          .insert(trackNotesTable)
          .values({
            id: data.id,
            userId,
            trackId,
            corners: data.corners,
          })
          .returning();

    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve track notes" });
      return;
    }
    res.json({
      id: saved.id,
      trackId: saved.trackId,
      corners: saved.corners,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert track notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
