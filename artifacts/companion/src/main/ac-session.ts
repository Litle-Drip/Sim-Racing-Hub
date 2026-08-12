// Assetto Corsa session & lap state machine. Reuses the F1 tracker's
// SessionSnapshot/LapRecord shapes (session.ts) so both games flow through
// the same Uploader and the same API/DB row shape — only the fields each
// game can actually supply differ.
import type { LapRecord, SessionSnapshot } from "./session";
import type { AcHandshakeInfo, AcCarInfo, AcLapInfo } from "./ac-udp";

function msToLapTime(ms: number): string {
  if (!ms || ms <= 0) return "";
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

function randomFlushId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class AcSessionTracker {
  private trackName: string | null = null;
  private carName: string | null = null;
  private laps: LapRecord[] = [];
  private recordedLapNums = new Set<number>();

  private lastSpeed = 0;
  private lastThrottle = 0;
  private lastBrake = 0;
  private lastGear = 0;
  private lastEngineRpm = 0;

  onSessionComplete: ((session: SessionSnapshot) => void | Promise<void>) | null = null;
  onLapComplete: ((lap: LapRecord) => void) | null = null;
  onStatusChange: (() => void) | null = null;

  get isActive(): boolean {
    return this.trackName !== null;
  }

  get currentLapCount(): number {
    return this.laps.length;
  }

  get track(): string | null {
    return this.trackName;
  }

  handleHandshake(info: AcHandshakeInfo): void {
    const track = info.trackConfig ? `${info.trackName} (${info.trackConfig})` : info.trackName;

    if (this.trackName === null) {
      this.trackName = track;
      this.carName = info.carName;
      this.onStatusChange?.();
      return;
    }

    // Track or car changed mid-connection (loaded a different combo without
    // ever disconnecting) — that's a new session, so flush the old one
    // before starting to track the new combo.
    if (track !== this.trackName || info.carName !== this.carName) {
      void this.flushSession();
      this.trackName = track;
      this.carName = info.carName;
      this.onStatusChange?.();
    }
  }

  handleCarInfo(info: AcCarInfo): void {
    this.lastSpeed = info.speedKmh;
    this.lastThrottle = info.gas;
    this.lastBrake = info.brake;
    this.lastGear = info.gear;
    this.lastEngineRpm = info.engineRpm;
  }

  handleLap(info: AcLapInfo): void {
    if (!this.trackName) return;
    // AC's remote-telemetry protocol reports only the total lap time — no
    // sector splits (that needs the separate shared-memory API, which only
    // works when the companion runs on the same machine as the game and
    // isn't exposed over this UDP protocol at all). s1/s2/s3 are left blank
    // rather than guessed.
    const lapNum = info.lap;
    if (this.recordedLapNums.has(lapNum)) return; // duplicate spot event
    if (info.timeMs <= 0) return; // an out-lap / invalid completion AC still spot-fires for

    this.recordedLapNums.add(lapNum);
    const record: LapRecord = {
      lap: lapNum,
      time: msToLapTime(info.timeMs),
      s1: "",
      s2: "",
      s3: "",
      tires: "",
      penalty: "",
    };
    this.laps.push(record);
    this.onLapComplete?.(record);
    this.onStatusChange?.();
  }

  // Called by the watchdog once the AC UDP connection has gone quiet for
  // long enough to mean the game closed or the session ended.
  forceFlush(): Promise<void> {
    if (this.trackName && this.laps.length > 0) {
      return this.flushSession();
    }
    this.reset();
    return Promise.resolve();
  }

  private reset(): void {
    this.trackName = null;
    this.carName = null;
    this.laps = [];
    this.recordedLapNums = new Set();
    this.lastSpeed = 0;
    this.lastThrottle = 0;
    this.lastBrake = 0;
    this.lastGear = 0;
    this.lastEngineRpm = 0;
  }

  private async flushSession(): Promise<void> {
    const snap: SessionSnapshot = {
      id: randomFlushId(),
      sessionUID: `ac-${Date.now()}`,
      // AC's remote-telemetry protocol has no session-type field (practice
      // vs. race vs. hotlap) — "Practice" is the closest honest default
      // for how this protocol is actually used (solo driving, not an
      // organized multiplayer race weekend).
      sessionType: "Practice",
      track: this.trackName ?? "Unknown Track",
      car: this.carName ?? "Unknown Car",
      weather: "",
      laps: [...this.laps],
      fuelRemaining: 0,
      aiDifficulty: 0,
      position: 0,
      assists: "",
      gameVersion: "Assetto Corsa",
      speed: this.lastSpeed || undefined,
      throttle: this.lastThrottle || undefined,
      brake: this.lastBrake || undefined,
      gear: this.lastGear || undefined,
      engineRpm: this.lastEngineRpm || undefined,
    };

    this.reset();
    await this.onSessionComplete?.(snap);
  }
}
