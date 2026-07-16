import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import {
  CreateSessionBody,
  GetSessionsResponse,
} from "@workspace/api-zod";

const router = Router();

type LapTraceSample = { d: number; speed: number; throttle: number; brake: number; steer: number };
type LapRecord = { lap: number; time: string; s1: string; s2: string; s3: string; tires: string; penalty: string; trace?: LapTraceSample[] };

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
    const key = normalizeTrackId(s.trackId);
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
    timeOfDay: r.timeOfDay || null,
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
    position: r.position ?? '',
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
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/sessions", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId));

    res.json(GetSessionsResponse.parse(rows.map(serializeSession)));
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
  const incomingLaps = ((data.laps ?? []) as LapRecord[]).filter(
    l => l.time && l.time.trim() !== ""
  );

  // Auto-compute best/avg/worst from laps if laps provided and summary fields are blank
  let bestLap = data.bestLap;
  let avgLap = data.avgLap;
  let worstLap = data.worstLap;
  if (incomingLaps.length > 0) {
    const computed = computeLapSummary(incomingLaps);
    if (!bestLap) bestLap = computed.bestLap;
    if (!avgLap) avgLap = computed.avgLap;
    if (!worstLap) worstLap = computed.worstLap;
  }

  try {
    await db.insert(sessionsTable).values({
      id: data.id,
      userId,
      date: data.date,
      trackId: normalizeTrackId(data.trackId),
      car: data.car,
      type: data.type,
      bestLap,
      avgLap,
      worstLap,
      s1: data.s1,
      s2: data.s2,
      s3: data.s3,
      tires: data.tires,
      fuelLoad: data.fuelLoad,
      conditions: data.conditions,
      timeOfDay: data.timeOfDay || null,
      assists: data.assists,
      rating: data.rating,
      notes: data.notes,
      penalty: data.penalty,
      gameVersion: data.gameVersion ?? "",
      platform: data.platform ?? "",
      inputDevice: data.inputDevice ?? "",
      laps: incomingLaps.length > 0 ? incomingLaps : null,
      position: data.position ?? '',
      isPB: false,
      aiDifficulty: data.aiDifficulty ?? null,
      topSpeedKph: data.topSpeedKph ?? null,
      avgThrottlePct: data.avgThrottlePct ?? null,
      avgBrakePct: data.avgBrakePct ?? null,
      drsActivations: data.drsActivations ?? null,
      maxRpm: data.maxRpm ?? null,
      topGear: data.topGear ?? null,
      fuelRemainingLaps: data.fuelRemainingLaps ?? null,
    });

    await recalcPBsForUser(userId);

    const [saved] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, data.id as string), eq(sessionsTable.userId, userId)));

    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve created session" });
      return;
    }
    res.status(201).json(serializeSession(saved));
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

router.post("/sessions/:id/share", requireAuth, async (req, res) => {
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

    const newIsPublic = !existing.isPublic;
    const sharedAt = newIsPublic ? new Date() : null;
    const { publicNote: rawNote } = req.body as { publicNote?: string };
    const publicNote = typeof rawNote === "string" ? rawNote.slice(0, 500) : undefined;

    await db
      .update(sessionsTable)
      .set({
        isPublic: newIsPublic,
        sharedAt,
        ...(newIsPublic && publicNote !== undefined ? { publicNote: publicNote || null } : {}),
      })
      .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId)));

    res.json({
      isPublic: newIsPublic,
      sharedAt: sharedAt ? sharedAt.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to share session");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
