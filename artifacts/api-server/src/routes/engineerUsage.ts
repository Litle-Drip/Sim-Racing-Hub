import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, engineerUsageTable, type DbEngineerUsage } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { UnlockEngineerUsageBody } from "@workspace/api-zod";

const router = Router();

// Free tier: 3 lifetime AI Race Engineer messages before the shared
// unlock password is required.
const FREE_MESSAGE_LIMIT = 3;

// Basic in-memory lockout against brute-forcing the shared unlock password.
// Per-process only (fine for a single Render instance); resets on deploy.
const UNLOCK_MAX_ATTEMPTS = 5;
const UNLOCK_LOCKOUT_MS = 15 * 60 * 1000;
const unlockAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

function isLockedOut(userId: string): boolean {
  const entry = unlockAttempts.get(userId);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > UNLOCK_LOCKOUT_MS) {
    unlockAttempts.delete(userId);
    return false;
  }
  return entry.count >= UNLOCK_MAX_ATTEMPTS;
}

function recordFailedAttempt(userId: string): void {
  const entry = unlockAttempts.get(userId);
  if (!entry || Date.now() - entry.firstAttemptAt > UNLOCK_LOCKOUT_MS) {
    unlockAttempts.set(userId, { count: 1, firstAttemptAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual requires equal-length buffers; pad so length itself
  // doesn't leak via an early return, then also compare true lengths.
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

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

  if (isLockedOut(userId)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const expected = process.env.ENGINEER_UNLOCK_PASSWORD;
  if (!expected || !safeCompare(parsed.data.password, expected)) {
    recordFailedAttempt(userId);
    res.status(403).json({ error: "Incorrect password" });
    return;
  }
  unlockAttempts.delete(userId);

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
