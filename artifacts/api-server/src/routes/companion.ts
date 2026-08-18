import { Router } from "express";
import { eq, and, gte, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db, sessionsTable, apiKeysTable, type DbLapRecord } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Hard backstop against a runaway client (a stuck retry loop, a future bug,
// anything) hammering this endpoint — independent of whether the client
// behaves correctly. A real driving session uploads once; even someone
// finishing back-to-back short sessions won't come close to this ceiling.
// In-memory is fine for this app's single-instance deployment.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const recentRequestsByUser = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = (recentRequestsByUser.get(userId) ?? []).filter(t => t > cutoff);
  existing.push(now);
  recentRequestsByUser.set(userId, existing);
  return existing.length > RATE_LIMIT_MAX_REQUESTS;
}

// Periodically drop entries for users with no recent activity so this map
// can't grow without bound over the server's lifetime.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [userId, timestamps] of recentRequestsByUser) {
    if (timestamps.every(t => t <= cutoff)) recentRequestsByUser.delete(userId);
  }
}, 5 * 60_000).unref();

// Independent of any client-supplied id: if this exact lap/session already
// exists for this user within the last few minutes, it's a duplicate upload
// (a retry loop, a double-launched app, anything) — reject it rather than
// insert another row. This is the safety net of last resort, since it
// doesn't trust the client to behave correctly at all.
const DUPLICATE_WINDOW_MS = 10 * 60_000;

async function findRecentDuplicateSession(params: {
  userId: string;
  trackId: string;
  car: string;
  type: string;
  bestLap: string;
  avgLap: string;
  worstLap: string;
}) {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const [existing] = await db
    .select()
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.userId, params.userId),
      eq(sessionsTable.trackId, params.trackId),
      eq(sessionsTable.car, params.car),
      eq(sessionsTable.type, params.type),
      eq(sessionsTable.bestLap, params.bestLap),
      eq(sessionsTable.avgLap, params.avgLap),
      eq(sessionsTable.worstLap, params.worstLap),
      gte(sessionsTable.createdAt, cutoff),
    ))
    .limit(1);
  return existing;
}

// A well-formed lap trace has at most a few thousand points (F1 25 sends
// telemetry at 60Hz, downsampled client-side). A companion-app bug can
// produce traces with duplicated, unbounded segments (e.g. from repeated
// rewinds) that are large enough to crash the server on insert — clamp
// defensively so a single bad upload can never take the whole API down.
const MAX_TRACE_SAMPLES = 3000;

function capTrace<T extends { trace?: unknown[] }>(laps: T[]): T[] {
  for (const lap of laps) {
    if (Array.isArray(lap.trace) && lap.trace.length > MAX_TRACE_SAMPLES) {
      lap.trace = lap.trace.slice(0, MAX_TRACE_SAMPLES);
    }
  }
  return laps;
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
  // Round to whole milliseconds first so floor/toFixed can't disagree at a
  // minute boundary (e.g. 119.99958 -> floor(1.999..)=1 but toFixed(3)
  // rounds the remainder up to "60.000", producing "1:60.000").
  const totalMs = Math.round(s * 1000);
  const m = Math.floor(totalMs / 60000);
  const remSec = (totalMs - m * 60000) / 1000;
  return `${m}:${remSec.toFixed(3).padStart(6, "0")}`;
}

function isFasterLap(a: string, b: string): boolean {
  if (!a || a.trim() === "") return false;
  if (!b || b.trim() === "") return true;
  return lapToSeconds(a) < lapToSeconds(b);
}

// Per-lap telemetry lives in the `laps` jsonb column, so the shape is
// defined once alongside the table rather than restated here.
type LapRecord = DbLapRecord;

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
  // Only the columns the PB comparison below actually reads — this runs on
  // every companion-app upload, so pulling the full row (including the
  // per-lap telemetry traces in `laps`) would re-transfer a user's entire
  // session history's worth of trace data on every upload.
  const rows = await db
    .select({
      id: sessionsTable.id,
      date: sessionsTable.date,
      createdAt: sessionsTable.createdAt,
      trackId: sessionsTable.trackId,
      bestLap: sessionsTable.bestLap,
      isPB: sessionsTable.isPB,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));
  // Sort chronologically so, among sessions logged on the same calendar
  // date, the one uploaded/created first consistently wins tie-breaking
  // for which row keeps the isPB flag (date alone doesn't distinguish
  // same-day sessions, and without a stable secondary key the winner would
  // depend on incidental DB row order).
  const sorted = [...rows].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const pbMap: Record<string, string> = {};

  // Only the rows whose isPB flag actually changes need writing — for a
  // single new upload that's normally just the old PB (now demoted) and the
  // new one, not every session the user has ever logged. Batching those
  // into two IN-list updates instead of one UPDATE per row turns a
  // recalc that used to cost O(session count) round-trips into O(1) for
  // the common case — this runs on every companion-app upload.
  const toSetTrue: string[] = [];
  const toSetFalse: string[] = [];

  for (const s of sorted) {
    const key = normalizeTrackId(s.trackId);
    const currentPB = pbMap[key];
    const isNewPB = isFasterLap(s.bestLap, currentPB ?? "");
    if (isNewPB && s.bestLap && s.bestLap.trim() !== "") pbMap[key] = s.bestLap;
    if (isNewPB !== s.isPB) {
      (isNewPB ? toSetTrue : toSetFalse).push(s.id);
    }
  }

  if (toSetTrue.length > 0) {
    await db
      .update(sessionsTable)
      .set({ isPB: true })
      .where(and(eq(sessionsTable.userId, userId), inArray(sessionsTable.id, toSetTrue)));
  }
  if (toSetFalse.length > 0) {
    await db
      .update(sessionsTable)
      .set({ isPB: false })
      .where(and(eq(sessionsTable.userId, userId), inArray(sessionsTable.id, toSetFalse)));
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
  const [row] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.keyHash, keyHash)).limit(1);

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
    const [row] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, userId)).limit(1);
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
    await db.insert(apiKeysTable).values({ id, userId, keyHash }).onConflictDoUpdate({
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
    trackId: normalizeTrackId(r.trackId),
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
    trackTemperature: r.trackTemperature ?? null,
    airTemperature: r.airTemperature ?? null,
    totalLaps: r.totalLaps ?? null,
    pitSpeedLimit: r.pitSpeedLimit ?? null,
    safetyCarStatus: r.safetyCarStatus ?? null,
    fuelInTank: r.fuelInTank ?? null,
    ersDeployMode: r.ersDeployMode ?? null,
    ersEnergyStored: r.ersEnergyStored ?? null,
    ersDeployedThisLap: r.ersDeployedThisLap ?? null,
    tyreWear: r.tyreWear ?? null,
    wingDamage: r.wingDamage ?? null,
    tyreSurfaceTemps: r.tyreSurfaceTemps ?? null,
    brakeTemps: r.brakeTemps ?? null,
    setupSnapshot: r.setupSnapshot ?? null,
    tyreStints: r.tyreStints ?? null,
    lapHistory: r.lapHistory ?? null,
    aiDifficulty: r.aiDifficulty ?? null,
    topSpeedKph: r.topSpeedKph ?? null,
    avgThrottlePct: r.avgThrottlePct ?? null,
    avgBrakePct: r.avgBrakePct ?? null,
    drsActivations: r.drsActivations ?? null,
    maxRpm: r.maxRpm ?? null,
    topGear: r.topGear ?? null,
    fuelRemainingLaps: r.fuelRemainingLaps ?? null,
    actualTyreCompound: r.actualTyreCompound ?? null,
    tyreAgeLaps: r.tyreAgeLaps ?? null,
    pitStops: r.pitStops ?? null,
    fuelCapacity: r.fuelCapacity ?? null,
    startingFuelKg: r.startingFuelKg ?? null,
    engineMaxRpm: r.engineMaxRpm ?? null,
    engineTemperature: r.engineTemperature ?? null,
    vehicleFiaFlags: r.vehicleFiaFlags ?? null,
    tyrePressureLive: r.tyrePressureLive ?? null,
    floorDamage: r.floorDamage ?? null,
    diffuserDamage: r.diffuserDamage ?? null,
    sidepodDamage: r.sidepodDamage ?? null,
    gearBoxDamage: r.gearBoxDamage ?? null,
    engineDamage: r.engineDamage ?? null,
    liveBrakeBias: r.liveBrakeBias ?? null,
    tyreDamage: r.tyreDamage ?? null,
    brakesDamage: r.brakesDamage ?? null,
    tyreBlisters: r.tyreBlisters ?? null,
    tyreInnerTemps: r.tyreInnerTemps ?? null,
    engineWear: r.engineWear ?? null,
    ersHarvestedThisLap: r.ersHarvestedThisLap ?? null,
    fuelMix: r.fuelMix ?? null,
    speedTrapKph: r.speedTrapKph ?? null,
    flashbacks: r.flashbacks ?? null,
    collisions: r.collisions ?? null,
    safetyCarPeriods: r.safetyCarPeriods ?? null,
    redFlags: r.redFlags ?? null,
    totalWarnings: r.totalWarnings ?? null,
    cornerCuttingWarnings: r.cornerCuttingWarnings ?? null,
    bestLapNum: r.bestLapNum ?? null,
    bestSector1LapNum: r.bestSector1LapNum ?? null,
    bestSector2LapNum: r.bestSector2LapNum ?? null,
    bestSector3LapNum: r.bestSector3LapNum ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/companion/verify", requireApiKey, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

router.post("/companion/session", requireApiKey, async (req: Request, res: Response) => {
  try {
    const userId = (req as ApiKeyRequest).companionUserId;

    if (isRateLimited(userId)) {
      req.log.warn({ userId }, "companion/session rate limit exceeded");
      res.status(429).json({ error: "Too many session uploads — please slow down." });
      return;
    }

    const body = req.body as {
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
      id?: string;
      date?: string;
      position?: string;
      notes?: string;
      rating?: number;
      penalty?: string;
      trackTemperature?: number;
      airTemperature?: number;
      totalLaps?: number;
      pitSpeedLimit?: number;
      safetyCarStatus?: number;
      timeOfDay?: string;
      fuelInTank?: number;
      ersDeployMode?: number;
      ersEnergyStored?: number;
      ersDeployedThisLap?: number;
      tyreWear?: [number, number, number, number];
      frontWingDamage?: number;
      rearWingDamage?: number;
      tyreSurfaceTemps?: [number, number, number, number];
      brakeTemps?: [number, number, number, number];
      setup?: {
        frontWing: number; rearWing: number; onThrottle: number; offThrottle: number;
        frontCamber: number; rearCamber: number; frontToe: number; rearToe: number;
        frontSuspension: number; rearSuspension: number; frontAntiRollBar: number; rearAntiRollBar: number;
        frontRideHeight: number; rearRideHeight: number; brakePressure: number; brakeBias: number;
        frontTyrePressure: number; rearTyrePressure: number;
      };
      tyreStints?: Array<{ startLap: number; endLap: number; compound: string; visualCompound: string }>;
      lapHistory?: Array<{ lap: number; lapTimeMs: number; sector1Ms: number; sector2Ms: number; sector3Ms: number; valid: boolean; sector1Valid?: boolean; sector2Valid?: boolean; sector3Valid?: boolean }>;
      aiDifficulty?: number;
      topSpeedKph?: number;
      avgThrottlePct?: number;
      avgBrakePct?: number;
      drsActivations?: number;
      maxRpm?: number;
      topGear?: number;
      actualTyreCompound?: string;
      tyreAgeLaps?: number;
      pitStops?: number;
      fuelCapacity?: number;
      startingFuelKg?: number;
      engineMaxRpm?: number;
      engineTemperature?: number;
      vehicleFiaFlags?: number;
      tyrePressureLive?: [number, number, number, number];
      floorDamage?: number;
      diffuserDamage?: number;
      sidepodDamage?: number;
      gearBoxDamage?: number;
      engineDamage?: number;
      liveBrakeBias?: number;
      tyreDamage?: [number, number, number, number];
      brakesDamage?: [number, number, number, number];
      tyreBlisters?: [number, number, number, number];
      tyreInnerTemps?: [number, number, number, number];
      engineWear?: { mguh: number; es: number; ce: number; ice: number; mguk: number; tc: number };
      ersHarvestedThisLap?: number;
      fuelMix?: number;
      speedTrapKph?: number;
      flashbacks?: number;
      collisions?: number;
      safetyCarPeriods?: number;
      redFlags?: number;
      totalWarnings?: number;
      cornerCuttingWarnings?: number;
      bestLapNum?: number;
      bestSector1LapNum?: number;
      bestSector2LapNum?: number;
      bestSector3LapNum?: number;
    };

    if (!body.sessionType || !body.track || !body.car) {
      res.status(400).json({ error: "Missing required fields: sessionType, track, car" });
      return;
    }

    const laps: LapRecord[] = capTrace((body.laps ?? []).filter(l => l.time && l.time.trim() !== ""));

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
        const bestRecord = laps.find(l => lapToSeconds(l.time) === lapToSeconds(bestLap));
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
    const sessionDate = body.date ?? new Date().toISOString().slice(0, 10);
    const trackId = normalizeTrackId(body.track);

    const duplicate = await findRecentDuplicateSession({
      userId,
      trackId,
      car: body.car,
      type: body.sessionType,
      bestLap,
      avgLap,
      worstLap,
    });
    if (duplicate) {
      req.log.warn({ userId, duplicateOf: duplicate.id, newId: sessionId }, "companion/session duplicate rejected");
      // 200, not 201 — nothing was created. The existing session is returned
      // as-is; any new telemetry in this payload was intentionally not merged.
      res.status(200).json(serializeSession(duplicate));
      return;
    }

    try {
      await db.insert(sessionsTable).values({
        id: sessionId,
        userId,
        date: sessionDate,
        trackId,
        car: body.car,
        type: body.sessionType,
        bestLap,
        avgLap,
        worstLap,
        s1, s2, s3,
        tires: body.tyreCompound ?? "",
        // fuelLoad is a starting-fuel PERCENTAGE for manually-logged sessions
        // (see CreateSessionRequest/the Sessions.tsx form) — body.fuelRemaining
        // is F1 telemetry's "laps of fuel remaining", a different unit
        // entirely, so it must not be written into this column. It's still
        // uploaded and stored separately as fuelRemainingLaps.
        fuelLoad: 0,
        fuelRemainingLaps: body.fuelRemaining ?? null,
        conditions: body.weather ?? "",
        timeOfDay: body.timeOfDay ?? null,
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
        trackTemperature: body.trackTemperature ?? null,
        airTemperature: body.airTemperature ?? null,
        totalLaps: body.totalLaps ?? null,
        pitSpeedLimit: body.pitSpeedLimit ?? null,
        safetyCarStatus: body.safetyCarStatus ?? null,
        fuelInTank: body.fuelInTank ?? null,
        ersDeployMode: body.ersDeployMode ?? null,
        ersEnergyStored: body.ersEnergyStored ?? null,
        ersDeployedThisLap: body.ersDeployedThisLap ?? null,
        tyreWear: body.tyreWear ?? null,
        wingDamage: (body.frontWingDamage !== undefined || body.rearWingDamage !== undefined)
          ? { front: body.frontWingDamage ?? 0, rear: body.rearWingDamage ?? 0 }
          : null,
        tyreSurfaceTemps: body.tyreSurfaceTemps ?? null,
        brakeTemps: body.brakeTemps ?? null,
        setupSnapshot: body.setup ?? null,
        tyreStints: body.tyreStints ?? null,
        lapHistory: body.lapHistory ?? null,
        aiDifficulty: body.aiDifficulty ?? null,
        topSpeedKph: body.topSpeedKph ?? null,
        avgThrottlePct: body.avgThrottlePct ?? null,
        avgBrakePct: body.avgBrakePct ?? null,
        drsActivations: body.drsActivations ?? null,
        maxRpm: body.maxRpm ?? null,
        topGear: body.topGear ?? null,
        actualTyreCompound: body.actualTyreCompound ?? null,
        tyreAgeLaps: body.tyreAgeLaps ?? null,
        pitStops: body.pitStops ?? null,
        fuelCapacity: body.fuelCapacity ?? null,
        startingFuelKg: body.startingFuelKg ?? null,
        engineMaxRpm: body.engineMaxRpm ?? null,
        engineTemperature: body.engineTemperature ?? null,
        vehicleFiaFlags: body.vehicleFiaFlags ?? null,
        tyrePressureLive: body.tyrePressureLive ?? null,
        floorDamage: body.floorDamage ?? null,
        diffuserDamage: body.diffuserDamage ?? null,
        sidepodDamage: body.sidepodDamage ?? null,
        gearBoxDamage: body.gearBoxDamage ?? null,
        engineDamage: body.engineDamage ?? null,
        liveBrakeBias: body.liveBrakeBias ?? null,
        tyreDamage: body.tyreDamage ?? null,
        brakesDamage: body.brakesDamage ?? null,
        tyreBlisters: body.tyreBlisters ?? null,
        tyreInnerTemps: body.tyreInnerTemps ?? null,
        engineWear: body.engineWear ?? null,
        ersHarvestedThisLap: body.ersHarvestedThisLap ?? null,
        fuelMix: body.fuelMix ?? null,
        speedTrapKph: body.speedTrapKph ?? null,
        flashbacks: body.flashbacks ?? null,
        collisions: body.collisions ?? null,
        safetyCarPeriods: body.safetyCarPeriods ?? null,
        redFlags: body.redFlags ?? null,
        totalWarnings: body.totalWarnings ?? null,
        cornerCuttingWarnings: body.cornerCuttingWarnings ?? null,
        bestLapNum: body.bestLapNum ?? null,
        bestSector1LapNum: body.bestSector1LapNum ?? null,
        bestSector2LapNum: body.bestSector2LapNum ?? null,
        bestSector3LapNum: body.bestSector3LapNum ?? null,
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
