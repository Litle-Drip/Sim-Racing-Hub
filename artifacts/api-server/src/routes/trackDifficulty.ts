import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, trackDifficultyTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { UpsertTrackDifficultyBody } from "@workspace/api-zod";

const router = Router();

router.get("/track-difficulty", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(trackDifficultyTable)
      .where(eq(trackDifficultyTable.userId, userId));

    res.json(rows.map(r => ({ trackId: r.trackId, rating: r.rating })));
  } catch (err) {
    req.log.error({ err }, "Failed to get track difficulty ratings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/track-difficulty/:trackId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const trackId = req.params.trackId as string;
  const parsed = UpsertTrackDifficultyBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { rating } = parsed.data;

  try {
    if (rating === 0) {
      await db
        .delete(trackDifficultyTable)
        .where(
          and(
            eq(trackDifficultyTable.userId, userId),
            eq(trackDifficultyTable.trackId, trackId)
          )
        );
      res.json({ trackId, rating: 0 });
      return;
    }

    const [existing] = await db
      .select()
      .from(trackDifficultyTable)
      .where(
        and(
          eq(trackDifficultyTable.userId, userId),
          eq(trackDifficultyTable.trackId, trackId)
        )
      );

    if (existing) {
      await db
        .update(trackDifficultyTable)
        .set({ rating, updatedAt: new Date() })
        .where(
          and(
            eq(trackDifficultyTable.userId, userId),
            eq(trackDifficultyTable.trackId, trackId)
          )
        );
    } else {
      await db.insert(trackDifficultyTable).values({
        id: crypto.randomUUID(),
        userId,
        trackId,
        rating,
      });
    }

    res.json({ trackId, rating });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert track difficulty");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
