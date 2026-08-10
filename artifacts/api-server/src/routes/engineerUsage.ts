import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, engineerUsageTable, type DbEngineerUsage } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { UnlockEngineerUsageBody } from "@workspace/api-zod";

const router = Router();

// Free tier: 3 lifetime AI Race Engineer messages before the shared
// unlock password is required.
const FREE_MESSAGE_LIMIT = 3;

function serialize(usage: DbEngineerUsage | undefined) {
  const count = usage?.messageCount ?? 0;
  const unlocked = usage?.unlocked ?? false;
  return {
    count,
    limit: FREE_MESSAGE_LIMIT,
    unlocked,
    allowed: unlocked || count < FREE_MESSAGE_LIMIT,
  };
}

router.get("/engineer-usage", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const [usage] = await db.select().from(engineerUsageTable).where(eq(engineerUsageTable.userId, userId));
    res.json(serialize(usage));
  } catch (err) {
    req.log.error({ err }, "Failed to get engineer usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/engineer-usage/check-and-increment", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    await db
      .insert(engineerUsageTable)
      .values({ userId, messageCount: 0, unlocked: false })
      .onConflictDoNothing({ target: engineerUsageTable.userId });

    // Only increments (and only reports allowed) when the user is unlocked
    // or still under the free-tier limit — done in one statement so
    // concurrent requests can't both slip through under the cap.
    const [updated] = await db
      .update(engineerUsageTable)
      .set({ messageCount: sql`${engineerUsageTable.messageCount} + 1`, updatedAt: new Date() })
      .where(
        sql`${engineerUsageTable.userId} = ${userId} AND (${engineerUsageTable.unlocked} OR ${engineerUsageTable.messageCount} < ${FREE_MESSAGE_LIMIT})`,
      )
      .returning();

    if (updated) {
      res.json(serialize(updated));
      return;
    }

    const [current] = await db.select().from(engineerUsageTable).where(eq(engineerUsageTable.userId, userId));
    res.json(serialize(current));
  } catch (err) {
    req.log.error({ err }, "Failed to check/increment engineer usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/engineer-usage/unlock", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = UnlockEngineerUsageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const expected = process.env.ENGINEER_UNLOCK_PASSWORD;
  if (!expected || parsed.data.password !== expected) {
    res.status(403).json({ error: "Incorrect password" });
    return;
  }

  try {
    await db
      .insert(engineerUsageTable)
      .values({ userId, messageCount: 0, unlocked: true })
      .onConflictDoUpdate({ target: engineerUsageTable.userId, set: { unlocked: true, updatedAt: new Date() } });

    const [updated] = await db.select().from(engineerUsageTable).where(eq(engineerUsageTable.userId, userId));
    res.json(serialize(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to unlock engineer usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
