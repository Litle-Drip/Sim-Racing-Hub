import { Router } from "express";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db, sessionsTable, apiKeysTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

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

function secondsToLap(s: number): string {
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(3).padStart(6, "0")}`;
}

function isFasterLap(a: string, b: string): boolean {
  if (!a || a.trim() === "") return false;
  if (!b || b.trim() === "") return true;
  return lapToSeconds(a) < lapToSeconds(b);
}

type LapRecord = { lap: number; time: string; s1: string; s2: string; s3: string; tires: string; penalty: string };

function computeLapSummary(laps: LapRecord[]): { bestLap: string; avgLap: string; worstLap: string } {
  const valid = laps.filter(l => l.time && l.time.trim() !== "");
  if (valid.length === 0) return { bestLap: "", avgLap: "", worstLap: "" };
  const times = valid.map(l => lapToSeconds(l.time));
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    bestLap: secondsToLap(best),
    avgLap: secondsToLap(avg),
    worstLap: secondsToLap(worst),
  };
}

async function recalcPBsForUser(userId: string) {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const pbMap: Record<string, string> = {};

  const updates: { id: string; isPB: boolean }[] = sorted.map((s) => {
    const key = s.trackId;
    const currentPB = pbMap[key];
    const isNewPB = isFasterLap(s.bestLap, currentPB ?? "");
    if (isNewPB && s.bestLap && s.bestLap.trim() !== "") {
      pbMap[key] = s.bestLap;
    }
    return { id: s.id, isPB: isNewPB };
  });

  for (const { id, isPB } of updates) {
    await db
      .update(sessionsTable)
      .set({ isPB })
      .where(eq(sessionsTable.id, id as string));
  }
}

interface ApiKeyRequest extends Request {
  companionUserId: string;
}

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    res.status(401).json({ error: "Empty API key" });
    return;
  }

  const keyHash = hashKey(rawKey);
  const [row] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, keyHash))
    .limit(1);

  if (!row) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  (req as ApiKeyRequest).companionUserId = row.userId;
  next();
}

router.get("/companion/apikey", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const [row] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.userId, userId))
      .limit(1);

    if (!row) {
      res.json({ hasKey: false, createdAt: null });
      return;
    }
    res.json({ hasKey: true, createdAt: row.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "GET /companion/apikey failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/companion/apikey", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const rawKey = randomBytes(32).toString("hex");
    const keyHash = hashKey(rawKey);
    const id = randomBytes(16).toString("hex");

    await db
      .insert(apiKeysTable)
      .values({ id, userId, keyHash })
      .onConflictDoUpdate({
        target: apiKeysTable.userId,
        set: { keyHash, id },
      });

    res.json({ key: rawKey });
  } catch (err) {
    req.log.error({ err }, "POST /companion/apikey failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/companion/apikey", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    await db.delete(apiKeysTable).where(eq(apiKeysTable.userId, userId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "DELETE /companion/apikey failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/companion/session", requireApiKey, async (req: Request, res: Response) => {
  try {
    const userId = (req as ApiKeyRequest).companionUserId;
    const body = req.body as {
      id: string;
      date: string;
      trackId: string;
      car: string;
      type: string;
      laps?: LapRecord[];
      bestLap?: string;
      avgLap?: string;
      worstLap?: string;
      s1?: string;
      s2?: string;
      s3?: string;
      tires?: string;
      fuelLoad?: number;
      conditions?: string;
      assists?: string;
      rating?: number;
      notes?: string;
      penalty?: string;
      gameVersion?: string;
      platform?: string;
      inputDevice?: string;
      position?: string;
    };

    if (!body.id || !body.date || !body.trackId || !body.car || !body.type) {
      res.status(400).json({ error: "Missing required fields: id, date, trackId, car, type" });
      return;
    }

    const laps: LapRecord[] = body.laps ?? [];
    let bestLap = body.bestLap ?? "";
    let avgLap = body.avgLap ?? "";
    let worstLap = body.worstLap ?? "";
    let s1 = body.s1 ?? "";
    let s2 = body.s2 ?? "";
    let s3 = body.s3 ?? "";

    if (laps.length > 0 && !bestLap) {
      const summary = computeLapSummary(laps);
      bestLap = summary.bestLap;
      avgLap = summary.avgLap;
      worstLap = summary.worstLap;
      const bestLapRecord = laps.find(l => lapToSeconds(l.time) === lapToSeconds(bestLap));
      if (bestLapRecord) {
        s1 = bestLapRecord.s1 ?? "";
        s2 = bestLapRecord.s2 ?? "";
        s3 = bestLapRecord.s3 ?? "";
      }
    }

    await db.insert(sessionsTable).values({
      id: body.id,
      userId,
      date: body.date,
      trackId: body.trackId,
      car: body.car,
      type: body.type,
      bestLap,
      avgLap,
      worstLap,
      s1,
      s2,
      s3,
      tires: body.tires ?? "",
      fuelLoad: body.fuelLoad ?? 0,
      conditions: body.conditions ?? "",
      assists: body.assists ?? "",
      rating: body.rating ?? 0,
      notes: body.notes ?? "",
      penalty: body.penalty ?? "",
      gameVersion: body.gameVersion ?? "",
      platform: body.platform ?? "",
      inputDevice: body.inputDevice ?? "",
      position: body.position ?? "",
      isPB: false,
      isPublic: false,
      laps: laps.length > 0 ? JSON.parse(JSON.stringify(laps)) : null,
    }).onConflictDoNothing();

    await recalcPBsForUser(userId);

    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "POST /companion/session failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
