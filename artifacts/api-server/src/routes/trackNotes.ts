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
    const [existing] = await db
      .select()
      .from(trackNotesTable)
      .where(
        and(
          eq(trackNotesTable.userId, userId),
          eq(trackNotesTable.trackId, trackId)
        )
      );

    if (existing) {
      await db
        .update(trackNotesTable)
        .set({ corners: data.corners, updatedAt: new Date() })
        .where(
          and(
            eq(trackNotesTable.userId, userId),
            eq(trackNotesTable.trackId, trackId)
          )
        );
    } else {
      await db.insert(trackNotesTable).values({
        id: data.id as string,
        userId,
        trackId,
        corners: data.corners,
      });
    }

    const [saved] = await db
      .select()
      .from(trackNotesTable)
      .where(
        and(
          eq(trackNotesTable.userId, userId),
          eq(trackNotesTable.trackId, trackId)
        )
      );

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
