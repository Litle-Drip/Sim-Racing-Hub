import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import {
  CreateSessionBody,
  GetSessionsResponse,
} from "@workspace/api-zod";

const router = Router();

function lapToSeconds(lap: string): number {
  if (!lap || !lap.includes(":")) {
    const n = parseFloat(lap);
    return isNaN(n) ? Infinity : n;
  }
  const parts = lap.split(":");
  const mins = parseFloat(parts[0]);
  const secs = parseFloat(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return Infinity;
  return mins * 60 + secs;
}

function isFasterLap(a: string, b: string): boolean {
  if (!a || a.trim() === "") return false;
  if (!b || b.trim() === "") return true;
  return lapToSeconds(a) < lapToSeconds(b);
}

async function recalcPBsForUser(userId: string) {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const pbMap: Record<string, string> = {};

  const updates: { id: string; isPB: boolean }[] = sorted.map((s) => {
    const key = `${s.trackId}__${s.car.toLowerCase().trim()}`;
    const currentPB = pbMap[key];
    const isNewPB = isFasterLap(s.bestLap, currentPB);
    if (isNewPB && s.bestLap && s.bestLap.trim() !== "") {
      pbMap[key] = s.bestLap;
    }
    return { id: s.id, isPB: isNewPB };
  });

  for (const { id, isPB } of updates) {
    await db
      .update(sessionsTable)
      .set({ isPB })
      .where(and(eq(sessionsTable.id, id as string), eq(sessionsTable.userId, userId)));
  }
}

router.get("/sessions", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId));

    const sessions = rows.map((r) => ({
      id: r.id,
      date: r.date,
      trackId: r.trackId,
      car: r.car,
      type: r.type,
      bestLap: r.bestLap,
      avgLap: r.avgLap,
      worstLap: r.worstLap,
      s1: r.s1,
      s2: r.s2,
      s3: r.s3,
      tires: r.tires,
      fuelLoad: r.fuelLoad,
      conditions: r.conditions,
      assists: r.assists,
      rating: r.rating,
      notes: r.notes,
      isPB: r.isPB,
    }));

    res.json(GetSessionsResponse.parse(sessions));
  } catch (err) {
    req.log.error({ err }, "Failed to get sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const data = parsed.data;
  try {
    await db.insert(sessionsTable).values({
      id: data.id,
      userId,
      date: data.date,
      trackId: data.trackId,
      car: data.car,
      type: data.type,
      bestLap: data.bestLap,
      avgLap: data.avgLap,
      worstLap: data.worstLap,
      s1: data.s1,
      s2: data.s2,
      s3: data.s3,
      tires: data.tires,
      fuelLoad: data.fuelLoad,
      conditions: data.conditions,
      assists: data.assists,
      rating: data.rating,
      notes: data.notes,
      isPB: false,
    });

    await recalcPBsForUser(userId);

    const [saved] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, data.id as string), eq(sessionsTable.userId, userId)));

    res.status(201).json({
      id: saved.id,
      date: saved.date,
      trackId: saved.trackId,
      car: saved.car,
      type: saved.type,
      bestLap: saved.bestLap,
      avgLap: saved.avgLap,
      worstLap: saved.worstLap,
      s1: saved.s1,
      s2: saved.s2,
      s3: saved.s3,
      tires: saved.tires,
      fuelLoad: saved.fuelLoad,
      conditions: saved.conditions,
      assists: saved.assists,
      rating: saved.rating,
      notes: saved.notes,
      isPB: saved.isPB,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sessions/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [existing] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await db
      .delete(sessionsTable)
      .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId)));

    await recalcPBsForUser(userId);

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete session");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
