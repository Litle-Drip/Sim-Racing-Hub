import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { SessionSnapshot, LapRecord } from "./session";

export interface PendingUpload {
  id: string;
  payload: UploadPayload;
  attemptCount: number;
  createdAt: string;
}

export interface UploadPayload {
  sessionType: string;
  track: string;
  car: string;
  weather: string;
  assists: string;
  gameVersion: string;
  platform: string;
  fuelRemaining: number;
  laps: LapRecord[];
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
    return JSON.parse(readFileSync(p, "utf-8")) as PendingUpload[];
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
      sessionType: session.sessionType,
      track: session.track,
      car: session.car,
      weather: session.weather,
      assists: "",
      gameVersion: "F1 25",
      platform: "PC",
      fuelRemaining: session.fuelRemaining,
      laps: session.laps,
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
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

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
