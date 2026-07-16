import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { SessionSnapshot, LapRecord, CarSetupSnapshot, TyreStint, LapHistoryEntry } from "./session";

export interface PendingUpload {
  id: string;
  payload: UploadPayload;
  attemptCount: number;
  createdAt: string;
}

export interface UploadPayload {
  id: string;
  sessionType: string;
  track: string;
  car: string;
  weather: string;
  assists: string;
  gameVersion: string;
  platform: string;
  fuelRemaining: number;
  laps: LapRecord[];
  aiDifficulty?: number;
  position?: string;
  trackTemperature?: number;
  airTemperature?: number;
  totalLaps?: number;
  pitSpeedLimit?: number;
  safetyCarStatus?: number;
  timeOfDay?: string;
  speed?: number;
  throttle?: number;
  brake?: number;
  gear?: number;
  engineRpm?: number;
  drsActive?: number;
  tyreSurfaceTemps?: [number, number, number, number];
  brakeTemps?: [number, number, number, number];
  fuelInTank?: number;
  ersDeployMode?: number;
  ersEnergyStored?: number;
  ersDeployedThisLap?: number;
  tyreWear?: [number, number, number, number];
  frontWingDamage?: number;
  rearWingDamage?: number;
  setup?: CarSetupSnapshot;
  tyreStints?: TyreStint[];
  lapHistory?: LapHistoryEntry[];
  topSpeedKph?: number;
  avgThrottlePct?: number;
  avgBrakePct?: number;
  drsActivations?: number;
  maxRpm?: number;
  topGear?: number;
  tyreCompound?: string;
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
}

export interface UploadResult {
  ok: boolean;
  track: string;
  lapTime: string;
  at: string;
  error?: string;
}

function pendingPath(): string {
  return join(app.getPath("userData"), "pending-uploads.json");
}

function loadPending(): PendingUpload[] {
  const p = pendingPath();
  if (!existsSync(p)) return [];
  try {
    const items = JSON.parse(readFileSync(p, "utf-8")) as PendingUpload[];
    // Items queued before session ids existed have no payload.id, so the
    // server can't dedupe them — every retry inserts a brand new row. Give
    // each a stable id once, here, so from this point on they behave like
    // any other upload: retried safely, never duplicated.
    let backfilled = false;
    for (const item of items) {
      if (!item.payload.id) {
        item.payload.id = randomId();
        backfilled = true;
      }
    }
    if (backfilled) savePending(items);
    return items;
  } catch {
    return [];
  }
}

function savePending(items: PendingUpload[]): void {
  try {
    writeFileSync(pendingPath(), JSON.stringify(items, null, 2), "utf-8");
  } catch {
    // Ignore write errors
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function bestLapTime(laps: LapRecord[]): string {
  if (laps.length === 0) return "";
  const toSecs = (t: string): number => {
    if (!t || !t.includes(":")) return Infinity;
    const [m, s] = t.split(":");
    return parseFloat(m) * 60 + parseFloat(s);
  };
  let best = laps[0].time;
  for (const l of laps) {
    if (toSecs(l.time) < toSecs(best)) best = l.time;
  }
  return best;
}

export class Uploader {
  private pending: PendingUpload[] = [];
  private apiKey = "";
  private apiBaseUrl = "https://f1simhub.com/api";
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  onUploadResult: ((result: UploadResult) => void) | null = null;

  constructor() {
    this.pending = loadPending();
  }

  setCredentials(apiKey: string, apiBaseUrl: string): void {
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
  }

  sessionToPayload(session: SessionSnapshot): UploadPayload {
    return {
      id: session.id,
      sessionType: session.sessionType,
      track: session.track,
      car: session.car,
      weather: session.weather,
      assists: session.assists,
      gameVersion: session.gameVersion,
      platform: "PC",
      fuelRemaining: session.fuelRemaining,
      laps: session.laps,
      aiDifficulty: session.aiDifficulty > 0 ? session.aiDifficulty : undefined,
      position: session.position > 0 ? String(session.position) : undefined,
      trackTemperature: session.trackTemperature,
      airTemperature: session.airTemperature,
      totalLaps: session.totalLaps,
      pitSpeedLimit: session.pitSpeedLimit,
      safetyCarStatus: session.safetyCarStatus,
      timeOfDay: session.timeOfDay,
      speed: session.speed,
      throttle: session.throttle,
      brake: session.brake,
      gear: session.gear,
      engineRpm: session.engineRpm,
      drsActive: session.drsActive,
      tyreSurfaceTemps: session.tyreSurfaceTemps,
      brakeTemps: session.brakeTemps,
      fuelInTank: session.fuelInTank,
      ersDeployMode: session.ersDeployMode,
      ersEnergyStored: session.ersEnergyStored,
      ersDeployedThisLap: session.ersDeployedThisLap,
      tyreWear: session.tyreWear,
      frontWingDamage: session.frontWingDamage,
      rearWingDamage: session.rearWingDamage,
      setup: session.setup,
      tyreStints: session.tyreStints,
      lapHistory: session.lapHistory,
      topSpeedKph: session.topSpeedKph,
      avgThrottlePct: session.avgThrottlePct,
      avgBrakePct: session.avgBrakePct,
      drsActivations: session.drsActivations,
      maxRpm: session.maxRpm,
      topGear: session.topGear,
      tyreCompound: session.tyreCompound,
      actualTyreCompound: session.actualTyreCompound,
      tyreAgeLaps: session.tyreAgeLaps,
      pitStops: session.pitStops,
      fuelCapacity: session.fuelCapacity,
      startingFuelKg: session.startingFuelKg,
      engineMaxRpm: session.engineMaxRpm,
      engineTemperature: session.engineTemperature,
      vehicleFiaFlags: session.vehicleFiaFlags,
      tyrePressureLive: session.tyrePressureLive,
      floorDamage: session.floorDamage,
      diffuserDamage: session.diffuserDamage,
      sidepodDamage: session.sidepodDamage,
      gearBoxDamage: session.gearBoxDamage,
      engineDamage: session.engineDamage,
    };
  }

  async uploadSession(session: SessionSnapshot): Promise<void> {
    const payload = this.sessionToPayload(session);
    await this.uploadPayload(payload);
  }

  async uploadPayload(payload: UploadPayload): Promise<void> {
    if (!this.apiKey) {
      this.queuePending(payload);
      return;
    }
    try {
      const resp = await fetch(`${this.apiBaseUrl}/companion/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      // 409 means a prior attempt with this same id already landed server-
      // side (the request that "timed out" client-side actually succeeded,
      // or a retry raced an earlier one) — the upload already achieved its
      // goal, so treat it as success rather than retrying forever.
      if (!resp.ok && resp.status !== 409) throw new Error(`HTTP ${resp.status}`);

      const best = bestLapTime(payload.laps);
      this.onUploadResult?.({
        ok: true,
        track: payload.track,
        lapTime: best,
        at: new Date().toISOString(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.onUploadResult?.({
        ok: false,
        track: payload.track,
        lapTime: "",
        at: new Date().toISOString(),
        error: errMsg,
      });
      this.queuePending(payload);
    }
  }

  private queuePending(payload: UploadPayload): void {
    const item: PendingUpload = {
      id: randomId(),
      payload,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.pending.push(item);
    savePending(this.pending);
  }

  async flushPending(): Promise<void> {
    if (!this.apiKey || this.pending.length === 0) return;

    const toRetry = [...this.pending];
    this.pending = [];
    savePending(this.pending);

    for (const item of toRetry) {
      await this.uploadPayload(item.payload);
    }
  }

  startRetryLoop(intervalMs = 60_000): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      this.flushPending().catch(() => {});
    }, intervalMs);
  }

  stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
