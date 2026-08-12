// Assetto Corsa Competizione session & lap state machine, built on top of
// acc-udp.ts's Broadcasting SDK client. Produces the same SessionSnapshot
// shape session.ts (F1) and ac-session.ts (base AC) do, so it flows through
// the same Uploader/API/DB unchanged.
import type { LapRecord, SessionSnapshot } from "./session";
import type { AccRegistrationResult, AccTrackData, AccCarEntry, AccRealtimeUpdate, AccCarUpdate } from "./acc-udp";
import { sessionTypeName } from "./acc-udp";

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

export class AccSessionTracker {
  private trackName: string | null = null;
  private sessionTypeLabel = "Practice";
  // ACC's Broadcasting SDK has no "this is the player's car" field at all —
  // REALTIME_UPDATE.focusedCarIndex is the spectator camera's target, which
  // just happens to default to the player's own car in a normal solo
  // session. It's not a real identity marker: cycling cameras, replays, or
  // a multiplayer context can point it elsewhere, and there is no protocol
  // fix for that — this is a genuine SDK gap, not a bug in this file.
  private focusedCarIndex = -1;
  // ACC has no reliable car-model-name table exposed over this protocol
  // (see acc-udp.ts) — TeamCarName is free text set by the entry, and is
  // the best available label; an entry with none falls through to a
  // visible `Car N` placeholder rather than a guess.
  private carLabels = new Map<number, string>();
  private laps: LapRecord[] = [];
  private lastRecordedLapCount = -1;
  // Registration re-fires every 5s (see acc-udp.ts's re-register interval)
  // and would otherwise re-log "connected" on every single one of those —
  // only log the state transitions, not every request/response round trip.
  private loggedRegistered = false;
  private loggedFirstCarUpdate = false;

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

  handleRegistration(result: AccRegistrationResult): void {
    if (!result.success) {
      console.warn(`[ACC] Registration failed: ${result.error || "unknown reason"}`);
      this.loggedRegistered = false;
      return;
    }
    if (!this.loggedRegistered) {
      this.loggedRegistered = true;
      console.log(`[ACC] Registered (connectionId=${result.connectionId}, readOnly=${result.readOnly})`);
    }
  }

  handleTrackData(data: AccTrackData): void {
    console.log(`[ACC] Track data: ${data.trackName} (${data.trackMeters}m)`);
    if (this.trackName === null) {
      this.trackName = data.trackName;
      this.onStatusChange?.();
      return;
    }
    if (data.trackName !== this.trackName) {
      // Loaded a different track without ever losing the connection —
      // that's a new session.
      void this.flushSession();
      this.trackName = data.trackName;
      this.onStatusChange?.();
    }
  }

  handleCarEntry(entry: AccCarEntry): void {
    const label = entry.teamCarName?.trim() || entry.displayName?.trim();
    console.log(`[ACC] Car entry #${entry.carIndex}: ${label || "(no name given)"}`);
    if (label) this.carLabels.set(entry.carIndex, label);
  }

  handleRealtimeUpdate(update: AccRealtimeUpdate): void {
    if (update.focusedCarIndex !== this.focusedCarIndex) {
      console.log(`[ACC] Focused car index -> ${update.focusedCarIndex}`);
    }
    this.focusedCarIndex = update.focusedCarIndex;
    const label = sessionTypeName(update.sessionType);
    if (label !== this.sessionTypeLabel && this.laps.length > 0) {
      // Session type changed mid-connection (e.g. practice -> qualifying)
      // — flush what was recorded under the old type before switching.
      void this.flushSession();
    }
    this.sessionTypeLabel = label;
  }

  handleCarUpdate(update: AccCarUpdate): void {
    if (!this.loggedFirstCarUpdate) {
      this.loggedFirstCarUpdate = true;
      console.log(`[ACC] Receiving car updates (focusedCarIndex=${this.focusedCarIndex}, this update's carIndex=${update.carIndex})`);
    }
    if (!this.trackName) return;
    if (update.carIndex !== this.focusedCarIndex) return;
    if (update.lastLap.laptimeMs === null || update.lastLap.laptimeMs <= 0) return;
    // `laps` is the car's running completed-lap count — use it to dedupe
    // against the same lastLap value being re-broadcast every tick.
    if (update.laps <= this.lastRecordedLapCount) return;
    this.lastRecordedLapCount = update.laps;

    if (update.lastLap.isInvalid) {
      console.log(`[ACC Lap] #${update.laps} invalid — excluded from session`);
      return;
    }

    const [s1, s2, s3] = update.lastLap.splitsMs;
    const record: LapRecord = {
      lap: update.laps,
      time: msToLapTime(update.lastLap.laptimeMs),
      s1: s1 != null ? msToLapTime(s1) : "",
      s2: s2 != null ? msToLapTime(s2) : "",
      s3: s3 != null ? msToLapTime(s3) : "",
      tires: "",
      penalty: "",
    };
    this.laps.push(record);
    this.onLapComplete?.(record);
    this.onStatusChange?.();
  }

  forceFlush(): Promise<void> {
    if (this.trackName && this.laps.length > 0) {
      return this.flushSession();
    }
    this.reset();
    return Promise.resolve();
  }

  private reset(): void {
    this.trackName = null;
    this.sessionTypeLabel = "Practice";
    this.focusedCarIndex = -1;
    this.carLabels = new Map();
    this.laps = [];
    this.lastRecordedLapCount = -1;
  }

  private async flushSession(): Promise<void> {
    const car = this.carLabels.get(this.focusedCarIndex) ?? `Car ${this.focusedCarIndex}`;
    const snap: SessionSnapshot = {
      id: randomFlushId(),
      sessionUID: `acc-${Date.now()}`,
      sessionType: this.sessionTypeLabel,
      track: this.trackName ?? "Unknown Track",
      car,
      weather: "",
      laps: [...this.laps],
      fuelRemaining: 0,
      aiDifficulty: 0,
      position: 0,
      assists: "",
      gameVersion: "Assetto Corsa Competizione",
    };

    this.reset();
    await this.onSessionComplete?.(snap);
  }
}
