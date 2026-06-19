// F1 25 UDP session & lap state machine

export interface LapRecord {
  lap: number;
  time: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  penalty: string;
}

export interface SessionSnapshot {
  sessionUID: string;
  sessionType: string;
  track: string;
  car: string;
  weather: string;
  laps: LapRecord[];
  fuelRemaining: number;
}

// ──────────────────────────────────────────────
// F1 25 / F1 23 lookup tables
// ──────────────────────────────────────────────

const TRACK_NAMES: Record<number, string> = {
  0: "Melbourne",
  1: "Paul Ricard",
  2: "Shanghai",
  3: "Bahrain",
  4: "Catalunya",
  5: "Monaco",
  6: "Montreal",
  7: "Silverstone",
  8: "Hockenheim",
  9: "Hungaroring",
  10: "Spa",
  11: "Monza",
  12: "Singapore",
  13: "Suzuka",
  14: "Abu Dhabi",
  15: "COTA",
  16: "Interlagos",
  17: "Red Bull Ring",
  18: "Sochi",
  19: "Mexico City",
  20: "Baku",
  21: "Bahrain Short",
  22: "Silverstone Short",
  23: "COTA Short",
  24: "Suzuka Short",
  25: "Hanoi",
  26: "Zandvoort",
  27: "Imola",
  28: "Portimão",
  29: "Jeddah",
  30: "Miami",
  31: "Las Vegas",
  32: "Lusail",
};

const SESSION_TYPES: Record<number, string> = {
  0: "Unknown",
  1: "Practice 1",
  2: "Practice 2",
  3: "Practice 3",
  4: "Short Practice",
  5: "Q1",
  6: "Q2",
  7: "Q3",
  8: "Short Q",
  9: "OSQ",
  10: "Race",
  11: "Race 2",
  12: "Race 3",
  13: "Time Trial",
};

const WEATHER_NAMES: Record<number, string> = {
  0: "Clear",
  1: "Light Cloud",
  2: "Overcast",
  3: "Light Rain",
  4: "Heavy Rain",
  5: "Storm",
};

const TYRE_NAMES: Record<number, string> = {
  16: "Soft",
  17: "Medium",
  18: "Hard",
  7: "Inter",
  8: "Wet",
  9: "Dry",
  10: "Wet",
  11: "SC",
};

const TEAM_NAMES: Record<number, string> = {
  0: "Mercedes",
  1: "Ferrari",
  2: "Red Bull",
  3: "Williams",
  4: "Aston Martin",
  5: "Alpine",
  6: "AlphaTauri",
  7: "Haas",
  8: "McLaren",
  9: "Alfa Romeo",
  10: "Haas",
  85: "Red Bull 2",
  253: "My Team",
};

// ──────────────────────────────────────────────
// Time formatting helpers
// ──────────────────────────────────────────────

function msToLapTime(ms: number): string {
  if (!ms || ms <= 0) return "";
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

// ──────────────────────────────────────────────
// Session state
// ──────────────────────────────────────────────

interface LapState {
  lapNum: number;
  lapStartTimeMs: number;
  s1Ms: number;
  s2Ms: number;
  invalid: boolean;
}

export class SessionTracker {
  private sessionUID: string | null = null;
  private sessionType = 0;
  private trackId = -1;
  private weather = 0;
  private playerCarIdx = 255;
  private teamId = 253;

  private currentLapNum = 0;
  private pendingLap: LapState | null = null;
  private validLaps: LapRecord[] = [];

  private lastTyreCompound = 0;
  private lastFuelRemaining = 0;
  private lastPacketTime = 0;

  // Callbacks
  onSessionComplete: ((session: SessionSnapshot) => void) | null = null;
  onLapComplete: ((lap: LapRecord) => void) | null = null;
  onStatusChange: (() => void) | null = null;

  get isActive(): boolean {
    return this.sessionUID !== null;
  }

  get currentLapCount(): number {
    return this.validLaps.length;
  }

  get trackName(): string {
    return TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`;
  }

  get timeSinceLastPacket(): number {
    return this.lastPacketTime > 0 ? Date.now() - this.lastPacketTime : Infinity;
  }

  handleSessionPacket(data: {
    m_sessionUID?: string | number | bigint;
    m_sessionType?: number;
    m_trackId?: number;
    m_weather?: number;
  }): void {
    this.lastPacketTime = Date.now();

    const uid = String(data.m_sessionUID ?? "0");
    const sessionType = data.m_sessionType ?? 0;
    const trackId = data.m_trackId ?? -1;
    const weather = data.m_weather ?? 0;

    // sessionType 0 = Unknown (menus, lobby) — treat as end of active session
    const isMenuState = sessionType === 0 || uid === "0";

    if (uid !== this.sessionUID) {
      // Session UID changed → boundary, flush accumulated laps
      if (this.sessionUID !== null && this.validLaps.length > 0) {
        this.flushSession();
      }
      if (!isMenuState) {
        this.sessionUID = uid;
        this.sessionType = sessionType;
        this.trackId = trackId;
        this.weather = weather;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
        this.onStatusChange?.();
      } else {
        // Player is in menus — clear state without starting a new session
        this.sessionUID = null;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
        this.onStatusChange?.();
      }
    } else if (this.sessionUID !== null && isMenuState) {
      // Session type transitioned to menu/unknown under same UID → session ended
      if (this.validLaps.length > 0) {
        this.flushSession();
      } else {
        this.sessionUID = null;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
      }
      this.onStatusChange?.();
    } else if (
      this.sessionUID !== null &&
      sessionType !== this.sessionType &&
      this.sessionType !== 0 &&
      sessionType !== 0
    ) {
      // Session type changed within same UID (e.g. Q1→Q2 or P1→Race) — flush and restart
      if (this.validLaps.length > 0) {
        this.flushSession();
      }
      this.sessionType = sessionType;
      this.validLaps = [];
      this.pendingLap = null;
      this.currentLapNum = 0;
      this.onStatusChange?.();
    } else {
      this.weather = weather;
    }
  }

  handleParticipantsPacket(data: { m_playerCarIndex?: number; m_participants?: Array<{ m_teamId?: number }> }): void {
    this.lastPacketTime = Date.now();
    if (data.m_playerCarIndex !== undefined) {
      this.playerCarIdx = data.m_playerCarIndex;
    }
    if (data.m_participants && this.playerCarIdx < data.m_participants.length) {
      this.teamId = data.m_participants[this.playerCarIdx]?.m_teamId ?? 253;
    }
  }

  handleLapPacket(data: { m_lapData?: Array<{
    m_currentLapNum?: number;
    m_currentLapTimeInMS?: number;
    m_lastLapTimeInMS?: number;
    m_sector1TimeInMS?: number;
    m_sector2TimeInMS?: number;
    m_currentLapInvalid?: number;
    m_penalties?: number;
    m_lapDistance?: number;
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!this.sessionUID) return;
    if (!data.m_lapData) return;

    const playerIdx = this.playerCarIdx < data.m_lapData.length ? this.playerCarIdx : 0;
    const lap = data.m_lapData[playerIdx];
    if (!lap) return;

    const lapNum = lap.m_currentLapNum ?? 1;
    const invalid = (lap.m_currentLapInvalid ?? 0) === 1;
    const s1Ms = lap.m_sector1TimeInMS ?? 0;
    const s2Ms = lap.m_sector2TimeInMS ?? 0;
    const lastLapMs = lap.m_lastLapTimeInMS ?? 0;
    const penalties = lap.m_penalties ?? 0;

    if (!this.pendingLap || lapNum !== this.pendingLap.lapNum) {
      // Lap number changed → previous lap just completed
      if (this.pendingLap && this.pendingLap.lapNum > 0 && lastLapMs > 0) {
        if (!this.pendingLap.invalid) {
          const s1 = msToLapTime(this.pendingLap.s1Ms);
          const s2 = msToLapTime(this.pendingLap.s2Ms);
          const s3 = msToLapTime(Math.max(0, lastLapMs - this.pendingLap.s1Ms - this.pendingLap.s2Ms));
          const record: LapRecord = {
            lap: this.pendingLap.lapNum,
            time: msToLapTime(lastLapMs),
            s1,
            s2,
            s3,
            tires: TYRE_NAMES[this.lastTyreCompound] ?? "Unknown",
            penalty: penalties > 0 ? `${penalties}s` : "",
          };
          this.validLaps.push(record);
          this.onLapComplete?.(record);
          this.onStatusChange?.();
        }
      }
      this.pendingLap = { lapNum, lapStartTimeMs: Date.now(), s1Ms, s2Ms, invalid };
      this.currentLapNum = lapNum;
    } else {
      // Update sector data while lap is in progress
      if (s1Ms > 0) this.pendingLap.s1Ms = s1Ms;
      if (s2Ms > 0) this.pendingLap.s2Ms = s2Ms;
      if (invalid) this.pendingLap.invalid = true;
    }
  }

  handleCarStatusPacket(data: { m_carStatusData?: Array<{
    m_visualTyreCompound?: number;
    m_tyreVisualCompound?: number;
    m_fuelRemainingLaps?: number;
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carStatusData) return;
    const playerIdx = this.playerCarIdx < data.m_carStatusData.length ? this.playerCarIdx : 0;
    const car = data.m_carStatusData[playerIdx];
    if (!car) return;
    const compound = car.m_visualTyreCompound ?? car.m_tyreVisualCompound ?? 0;
    if (compound > 0) this.lastTyreCompound = compound;
    const fuel = car.m_fuelRemainingLaps ?? 0;
    if (fuel > 0) this.lastFuelRemaining = fuel;
  }

  // Called when the app detects the game disconnected or a force-upload is needed
  forceFlush(): void {
    if (this.sessionUID && this.validLaps.length > 0) {
      this.flushSession();
    }
  }

  private flushSession(): void {
    const snap: SessionSnapshot = {
      sessionUID: this.sessionUID!,
      sessionType: SESSION_TYPES[this.sessionType] ?? "Unknown",
      track: TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`,
      car: TEAM_NAMES[this.teamId] ?? "My Team",
      weather: WEATHER_NAMES[this.weather] ?? "Clear",
      laps: [...this.validLaps],
      fuelRemaining: this.lastFuelRemaining,
    };
    this.sessionUID = null;
    this.validLaps = [];
    this.pendingLap = null;
    this.onSessionComplete?.(snap);
  }
}
