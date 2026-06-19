import { Router } from "express";
import { eq, and } from "drizzle-orm";
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

function serializeSession(r: typeof sessionsTable.$inferSelect) {
  return {
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
    timeOfDay: r.timeOfDay ?? null,
    assists: r.assists,
    rating: r.rating,
    notes: r.notes,
    penalty: r.penalty,
    gameVersion: r.gameVersion,
    platform: r.platform,
    inputDevice: r.inputDevice,
    isPublic: r.isPublic,
    sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
    publicNote: r.publicNote ?? null,
    laps: r.laps ?? null,
    isPB: r.isPB,
    position: r.position ?? "",
  };
}

router.post("/companion/session", requireApiKey, async (req: Request, res: Response) => {
  try {
    const userId = (req as ApiKeyRequest).companionUserId;

    // Telemetry-style payload from the companion app
    const body = req.body as {
      // Telemetry fields (companion app convention)
      sessionType?: string;
      track?: string;
      car?: string;
      lapTime?: string;
      sectors?: { s1?: string; s2?: string; s3?: string };
      tyreCompound?: string;
      fuelRemaining?: number;
      weather?: string;
      assists?: string;
      gameVersion?: string;
      platform?: string;
      inputDevice?: string;
      laps?: LapRecord[];
      // Optional meta
      id?: string;
      date?: string;
      position?: string;
      notes?: string;
      rating?: number;
      penalty?: string;
    };

    // Require at minimum sessionType, track, and car
    if (!body.sessionType || !body.track || !body.car) {
      res.status(400).json({ error: "Missing required fields: sessionType, track, car" });
      return;
    }

    const laps: LapRecord[] = (body.laps ?? []).filter(
      l => l.time && l.time.trim() !== ""
    );

    let bestLap = body.lapTime ?? "";
    let avgLap = "";
    let worstLap = "";
    let s1 = body.sectors?.s1 ?? "";
    let s2 = body.sectors?.s2 ?? "";
    let s3 = body.sectors?.s3 ?? "";

    if (laps.length > 0) {
      const summary = computeLapSummary(laps);
      if (!bestLap || lapToSeconds(summary.bestLap) < lapToSeconds(bestLap)) {
        bestLap = summary.bestLap;
        const bestRecord = laps.find(
          l => lapToSeconds(l.time) === lapToSeconds(bestLap)
        );
        if (bestRecord) {
          s1 = bestRecord.s1 ?? s1;
          s2 = bestRecord.s2 ?? s2;
          s3 = bestRecord.s3 ?? s3;
        }
      }
      avgLap = summary.avgLap;
      worstLap = summary.worstLap;
    }

    const sessionId = body.id ?? randomBytes(16).toString("hex");
    const sessionDate =
      body.date ?? new Date().toISOString().slice(0, 10);

    try {
      await db.insert(sessionsTable).values({
        id: sessionId,
        userId,
        date: sessionDate,
        trackId: body.track,
        car: body.car,
        type: body.sessionType,
        bestLap,
        avgLap,
        worstLap,
        s1,
        s2,
        s3,
        tires: body.tyreCompound ?? "",
        fuelLoad: body.fuelRemaining ?? 0,
        conditions: body.weather ?? "",
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
      });
    } catch (insertErr: unknown) {
      const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
        res.status(409).json({ error: "Session with this id already exists" });
        return;
      }
      throw insertErr;
    }

    await recalcPBsForUser(userId);

    const [created] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)))
      .limit(1);

    if (!created) {
      res.status(500).json({ error: "Session insert succeeded but row not found" });
      return;
    }

    res.status(201).json(serializeSession(created));
  } catch (err) {
    req.log.error({ err }, "POST /companion/session failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
