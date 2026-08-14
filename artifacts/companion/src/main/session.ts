// F1 25 UDP session & lap state machine

export interface LapTraceSample {
  d: number; // lap distance, metres
  speed: number; // km/h
  throttle: number; // 0-100
  brake: number; // 0-100
  steer: number; // -100 (full left) to 100 (full right)
  // Optional so traces recorded by older companion builds (and already
  // stored server-side) stay valid — readers must treat these as absent
  // rather than zero when missing.
  gear?: number; // -1 reverse, 0 neutral, 1-8
  rpm?: number;
  drs?: number; // 0 off, 1 open
}

// A penalty the game issued during a specific lap. Raw enum values are kept
// rather than resolved to strings: the penalty/infringement tables are long,
// version-specific, and better decoded where they're displayed than guessed
// at here.
export interface LapPenalty {
  type: number;
  infringement: number;
  seconds: number;
  placesGained: number;
}

export interface LapRecord {
  lap: number;
  time: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  penalty: string;
  trace?: LapTraceSample[];

  // Everything below is per-lap telemetry captured alongside the lap time.
  // All optional: laps recovered from session history (see
  // reconcileFromLapHistory) only ever have the timing fields, and older
  // stored sessions have none of them.
  lapTimeMs?: number;
  s1Ms?: number;
  s2Ms?: number;
  s3Ms?: number;
  valid?: boolean;
  actualCompound?: string;
  tyreAgeLaps?: number;
  position?: number;
  topSpeedKph?: number;
  avgThrottlePct?: number;
  avgBrakePct?: number;
  maxRpm?: number;
  fuelUsedKg?: number;
  fuelAtEndKg?: number;
  fuelMix?: number;
  tyreWearEndPct?: [number, number, number, number];
  tyreSurfaceTempsEnd?: [number, number, number, number];
  tyreInnerTempsEnd?: [number, number, number, number];
  brakeTempsEnd?: [number, number, number, number];
  ersDeployedMJ?: number;
  ersHarvestedMJ?: number;
  ersStoreEndMJ?: number;
  ersDeployMode?: number;
  warningsThisLap?: number;
  cornerCuttingWarningsThisLap?: number;
  totalWarnings?: number;
  penalties?: LapPenalty[];
  speedTrapKph?: number;
  pitted?: boolean;
  pitLaneTimeMs?: number;
  pitStopTimeMs?: number;
  flashbacks?: number;
}

export interface CarSetupSnapshot {
  frontWing: number;
  rearWing: number;
  onThrottle: number;
  offThrottle: number;
  frontCamber: number;
  rearCamber: number;
  frontToe: number;
  rearToe: number;
  frontSuspension: number;
  rearSuspension: number;
  frontAntiRollBar: number;
  rearAntiRollBar: number;
  frontRideHeight: number;
  rearRideHeight: number;
  brakePressure: number;
  brakeBias: number;
  frontTyrePressure: number;
  rearTyrePressure: number;
}

export interface TyreStint {
  startLap: number;
  endLap: number;
  compound: string;
  visualCompound: string;
}

export interface LapHistoryEntry {
  lap: number;
  lapTimeMs: number;
  sector1Ms: number;
  sector2Ms: number;
  sector3Ms: number;
  valid: boolean;
  // m_lapValidBitFlags carries per-sector validity in bits 1-3 alongside the
  // whole-lap bit 0 — a lap can be invalidated in one sector while the other
  // two remain legal reference times.
  sector1Valid?: boolean;
  sector2Valid?: boolean;
  sector3Valid?: boolean;
}

export interface EngineWear {
  mguh: number;
  es: number;
  ce: number;
  ice: number;
  mguk: number;
  tc: number;
}

export interface SessionSnapshot {
  id: string;
  sessionUID: string;
  sessionType: string;
  track: string;
  car: string;
  weather: string;
  laps: LapRecord[];
  fuelRemaining: number;
  aiDifficulty: number;
  position: number;
  assists: string;
  gameVersion: string;
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
  liveBrakeBias?: number;
  tyreDamage?: [number, number, number, number];
  brakesDamage?: [number, number, number, number];
  tyreBlisters?: [number, number, number, number];
  tyreInnerTemps?: [number, number, number, number];
  engineWear?: EngineWear;
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
}

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
  // F1 25 added reverse-layout circuits (new track ids, not present in F1 24)
  39: "Silverstone Reverse",
  40: "Austria Reverse",
  41: "Zandvoort Reverse",
};

// F1 25 inserted 5 sprint-weekend session types before Race, shifting Race
// from 10->15 and Time Trial from 13->18 versus the F1 24 UDP spec.
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
  10: "Sprint Shootout 1",
  11: "Sprint Shootout 2",
  12: "Sprint Shootout 3",
  13: "Short Sprint Shootout",
  14: "OSQ Sprint Shootout",
  15: "Race",
  16: "Race 2",
  17: "Race 3",
  18: "Time Trial",
};

// F1 24's own session-type enum (pre-dates the F1 25 sprint-weekend shift
// above). Confirmed against F1 24's own UDP spec
// (github.com/MacManley/f1-24-udp): Race = 10, Time Trial = 13.
const SESSION_TYPES_F1_24: Record<number, string> = {
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

const TYRE_ACTUAL_NAMES: Record<number, string> = {
  16: "C5",
  17: "C4",
  18: "C3",
  19: "C2",
  20: "C1",
  21: "C0",
  7: "Intermediate",
  8: "Wet",
};

// Base ids confirmed against the current F1 25 team roster (AlphaTauri
// rebranded to RB, Alfa Romeo rebranded to Sauber). The '24 retro-livery
// block (185-194) is a genuine fixed +185-per-team offset, confirmed
// working across many sessions.
//
// The 2026-content block is NOT a uniform offset — that was wrongly
// inferred from a single McLaren sighting (228 = 8 + 220) and then
// extrapolated to the rest of the roster. A second data point disproved
// it: Red Bull (base id 2) came back as raw 232, not 222. Likely cause is
// the 2026 season adding an 11th team (Cadillac), which shifts the whole
// block's internal ordering away from the old base-id order. Until each
// team's real 2026 id is independently confirmed via a diagnostic log
// sighting, only add entries here that have actually been observed —
// guessing the rest mislabels drivers as a different team entirely
// (this is exactly what caused a Mercedes car to show as "Ferrari '26").
// An unmapped id falls through to `Team ${id}` (see flushSession) rather
// than a guessed name, so an unconfirmed team shows up as a visible,
// greppable anomaly instead of silently mislabeling as some other team.
const TEAM_NAMES: Record<number, string> = {
  0: "Mercedes",
  1: "Ferrari",
  2: "Red Bull Racing",
  3: "Williams",
  4: "Aston Martin",
  5: "Alpine",
  6: "RB",
  7: "Haas",
  8: "McLaren",
  9: "Sauber",
  41: "F1 Generic",
  104: "My Team",
  185: "Mercedes '24",
  186: "Ferrari '24",
  187: "Red Bull Racing '24",
  188: "Williams '24",
  189: "Aston Martin '24",
  190: "Alpine '24",
  191: "RB '24",
  192: "Haas '24",
  193: "McLaren '24",
  194: "Sauber '24",
  220: "Mercedes '26", // confirmed live, 2026-08-10
  221: "Ferrari '26", // confirmed live, 2026-08-10
  222: "Red Bull Racing '26", // confirmed live, 2026-08-10
  223: "Williams '26", // confirmed live, 2026-08-10
  224: "Aston Martin '26", // confirmed live, 2026-08-10
  225: "Alpine '26", // confirmed live, 2026-08-10
  226: "RB '26", // confirmed live, 2026-08-10
  227: "Haas '26", // confirmed live, 2026-08-10
  228: "McLaren '26", // confirmed live, 2026-07-21
  229: "Audi '26", // confirmed live, 2026-08-10
  230: "Cadillac '26", // confirmed live, 2026-08-10
  232: "Red Bull Racing '26", // confirmed live, 2026-07-21
  253: "My Team",
};

// Generated once per flush and carried through every retry of that same
// upload (network flakiness, a slow/cold server, or an accidental second
// app instance all trigger retries) so the server can dedupe on it instead
// of inserting a new row per attempt. A genuinely new flush — even for the
// same game session, e.g. a fragment split by a real disconnect — gets its
// own fresh id, so distinct lap data is never silently dropped as a dupe.
function randomFlushId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function msToLapTime(ms: number): string {
  if (!ms || ms <= 0) return "";
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

function minutesToTimeString(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = minutesSinceMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface LapState {
  lapNum: number;
  lapStartTimeMs: number;
  s1Ms: number;
  s2Ms: number;
  invalid: boolean;
  trace: LapTraceSample[];

  // Running aggregates over this lap's telemetry samples.
  topSpeedKph: number;
  throttleSum: number;
  brakeSum: number;
  inputSamples: number;
  maxRpm: number;

  // Most recent value seen *while on this lap*. Snapshotting continuously
  // rather than reading the tracker's live fields at completion time matters
  // for the per-lap counters the game resets at the line (ERS deployed /
  // harvested): by the time a lap is finalized those have already rolled
  // over to the new lap's values.
  fuelStartKg: number;
  fuelEndKg: number;
  fuelMix: number;
  tyreWearEnd: [number, number, number, number];
  tyreSurfaceTempsEnd: [number, number, number, number];
  tyreInnerTempsEnd: [number, number, number, number];
  brakeTempsEnd: [number, number, number, number];
  ersDeployedJ: number;
  ersHarvestedJ: number;
  ersStoreJ: number;
  ersDeployMode: number;
  actualCompound: number;
  tyreAgeLaps: number;
  position: number;

  // Session-cumulative counters captured at lap start, so the per-lap delta
  // can be reported instead of a running total that only grows.
  warningsAtStart: number;
  cornerCuttingAtStart: number;
  totalWarnings: number;
  cornerCuttingWarnings: number;

  penalties: LapPenalty[];
  speedTrapKph: number;
  pitted: boolean;
  pitLaneTimeMs: number;
  pitStopTimeMs: number;
  flashbacks: number;
}

function newLapState(lapNum: number, s1Ms: number, s2Ms: number, invalid: boolean, seed?: {
  fuelKg: number;
  warnings: number;
  cornerCutting: number;
}): LapState {
  return {
    lapNum,
    lapStartTimeMs: Date.now(),
    s1Ms,
    s2Ms,
    invalid,
    trace: [],
    topSpeedKph: 0,
    throttleSum: 0,
    brakeSum: 0,
    inputSamples: 0,
    maxRpm: 0,
    fuelStartKg: seed?.fuelKg ?? 0,
    fuelEndKg: seed?.fuelKg ?? 0,
    fuelMix: 0,
    tyreWearEnd: [0, 0, 0, 0],
    tyreSurfaceTempsEnd: [0, 0, 0, 0],
    tyreInnerTempsEnd: [0, 0, 0, 0],
    brakeTempsEnd: [0, 0, 0, 0],
    ersDeployedJ: 0,
    ersHarvestedJ: 0,
    ersStoreJ: 0,
    ersDeployMode: 0,
    actualCompound: 0,
    tyreAgeLaps: 0,
    position: 0,
    warningsAtStart: seed?.warnings ?? 0,
    cornerCuttingAtStart: seed?.cornerCutting ?? 0,
    totalWarnings: seed?.warnings ?? 0,
    cornerCuttingWarnings: seed?.cornerCutting ?? 0,
    penalties: [],
    speedTrapKph: 0,
    pitted: false,
    pitLaneTimeMs: 0,
    pitStopTimeMs: 0,
    flashbacks: 0,
  };
}

const JOULES_PER_MJ = 1_000_000;

export class SessionTracker {
  private sessionUID: string | null = null;
  private sessionType = 0;
  // Set from each Session packet's m_packetFormat (2024/2025/2026). Drives
  // both the session-type name lookup (the enum shifted in F1 25, see
  // SESSION_TYPES_F1_24 above) and the gameVersion label on upload — udp.ts
  // already refuses to parse any format outside this set, so by the time a
  // session packet reaches here the format is one we've verified offsets for.
  private packetFormat: number | null = null;
  private trackId = -1;
  private weather = 0;
  private playerCarIdx = 255;
  private teamId = 253;
  // True once the player's own car has been observed actually moving —
  // guards against resolving car/team identity from Participants data
  // seen while still in the garage / program-select screen (see
  // handleParticipantsPacket).
  private seenOnTrack = false;

  private currentLapNum = 0;
  private pendingLap: LapState | null = null;
  private validLaps: LapRecord[] = [];
  private lastRecordedLapMs = 0;

  private lastTyreCompound = 0;
  private lastFuelRemaining = 0;
  private lastPacketTime = 0;
  private lastAiDifficulty = 0;
  private lastPosition = 0;
  private lastTractionControl = 0;
  private lastAntiLockBrakes = 0;

  private lastTrackTemperature = 0;
  private lastAirTemperature = 0;
  private lastTotalLaps = 0;
  private lastPitSpeedLimit = 0;
  private lastSafetyCarStatus = 0;
  private lastTimeOfDay: string | undefined = undefined;

  private lastSpeed = 0;
  private lastThrottle = 0;
  private lastBrake = 0;
  private lastGear = 0;
  private lastEngineRpm = 0;
  private lastDrsActive = 0;
  private lastTyreSurfaceTemps: [number, number, number, number] = [0, 0, 0, 0];
  private lastBrakeTemps: [number, number, number, number] = [0, 0, 0, 0];

  private lastFuelInTank = 0;
  private lastErsDeployMode = 0;
  private lastErsEnergyStored = 0;
  private lastErsDeployedThisLap = 0;

  private lastTyreWear: [number, number, number, number] = [0, 0, 0, 0];
  private lastFrontWingDamage = 0;
  private lastRearWingDamage = 0;

  private lastSetup: CarSetupSnapshot | undefined = undefined;

  private lastTyreStints: TyreStint[] = [];
  private lastLapHistory: LapHistoryEntry[] = [];

  private lastActualTyreCompound = 0;
  private lastTyreAgeLaps = 0;
  private lastPitStops = 0;
  private lastFuelCapacity = 0;
  private lastStartingFuelKg = 0;
  private lastEngineMaxRpm = 0;
  private lastEngineTemperature = 0;
  private lastVehicleFiaFlags = -1;
  private lastTyrePressureLive: [number, number, number, number] = [0, 0, 0, 0];
  private lastFloorDamage = 0;
  private lastDiffuserDamage = 0;
  private lastSidepodDamage = 0;
  private lastGearBoxDamage = 0;
  private lastEngineDamage = 0;
  private lastLiveBrakeBias = 0;

  private lastTyreDamage: [number, number, number, number] = [0, 0, 0, 0];
  private lastBrakesDamage: [number, number, number, number] = [0, 0, 0, 0];
  private lastTyreBlisters: [number, number, number, number] = [0, 0, 0, 0];
  private lastTyreInnerTemps: [number, number, number, number] = [0, 0, 0, 0];
  private lastEngineWear: EngineWear | undefined = undefined;
  private lastErsHarvestedThisLap = 0;
  private lastFuelMix = 0;
  private lastTotalWarnings = 0;
  private lastCornerCuttingWarnings = 0;
  private lastBestLapNum = 0;
  private lastBestSector1LapNum = 0;
  private lastBestSector2LapNum = 0;
  private lastBestSector3LapNum = 0;

  // Event-packet derived session counters (packet id 3). These have no
  // equivalent in the per-frame packets — a flashback, a collision or a red
  // flag is only ever announced once, as an event.
  private speedTrapKph = 0;
  private flashbackCount = 0;
  private collisionCount = 0;
  private safetyCarPeriods = 0;
  private redFlagCount = 0;

  // Session-level aggregates (running max/avg/count), distinct from the
  // lastX "most recent sample" fields above — these summarize the whole
  // session rather than a snapshot at flush time.
  private topSpeedKph = 0;
  private throttleSum = 0;
  private brakeSum = 0;
  private throttleBrakeSamples = 0;
  private drsWasActive = false;
  private drsActivations = 0;
  private maxRpm = 0;
  private topGear = 0;

  // Per-lap distance trace (speed/throttle/brake/steer vs. lap distance),
  // sampled from CarTelemetry and downsampled by TRACE_SAMPLE_EVERY so a
  // full lap stays a few hundred points instead of every raw packet.
  private currentLapDistanceM = 0;
  private telemetrySampleCounter = 0;
  private static readonly TRACE_SAMPLE_EVERY = 3;

  onSessionComplete: ((session: SessionSnapshot) => void | Promise<void>) | null = null;
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

  // null until the first Session packet of a supported format arrives.
  get gameVersion(): string | null {
    switch (this.packetFormat) {
      case 2024: return "F1 24";
      case 2025: return "F1 25";
      case 2026: return "F1 26";
      case null: return null;
      default: return `F1 ${this.packetFormat % 100}`;
    }
  }

  // m_packetFormat=2024 isn't a reliable signal that the F1-24 session-type
  // enum applies — confirmed live on 2026-08-12/13: a real F1 26 session
  // sent packetFormat=2024 with raw m_sessionType=18 (Time Trial) and,
  // separately, 15 (Race), neither of which exist in the F1-24 table (it
  // tops out at 13) — so the game apparently doesn't always bump this
  // field on newer releases. Rather than hardcode each colliding id as
  // it's found, fall through to the modern table whenever the id isn't
  // recognized in the legacy one; this self-heals for ids the F1-24 table
  // was never going to define and is inert for real F1 24 telemetry, whose
  // own spec never sends ids outside the legacy table's range.
  private sessionTypeName(type: number): string {
    if (this.packetFormat === 2024) {
      const legacyName = SESSION_TYPES_F1_24[type];
      if (legacyName) return legacyName;
    }
    return SESSION_TYPES[type] ?? "Unknown";
  }

  get timeSinceLastPacket(): number {
    return this.lastPacketTime > 0 ? Date.now() - this.lastPacketTime : Infinity;
  }

  handleSessionPacket(data: {
    m_packetFormat?: number;
    m_sessionUID?: string | number | bigint;
    m_sessionType?: number;
    m_trackId?: number;
    m_weather?: number;
    m_aiDifficulty?: number;
    m_trackTemperature?: number;
    m_airTemperature?: number;
    m_totalLaps?: number;
    m_pitSpeedLimit?: number;
    m_safetyCarStatus?: number;
    m_timeOfDay?: number;
  }): void {
    this.lastPacketTime = Date.now();

    if (data.m_packetFormat !== undefined) this.packetFormat = data.m_packetFormat;

    const uid = String(data.m_sessionUID ?? "0");
    const sessionType = data.m_sessionType ?? 0;
    const trackId = data.m_trackId ?? -1;
    const weather = data.m_weather ?? 0;
    const aiDifficulty = data.m_aiDifficulty ?? 0;
    if (aiDifficulty > 0) this.lastAiDifficulty = aiDifficulty;

    if (data.m_trackTemperature !== undefined) this.lastTrackTemperature = data.m_trackTemperature;
    if (data.m_airTemperature !== undefined) this.lastAirTemperature = data.m_airTemperature;
    if (data.m_totalLaps !== undefined && data.m_totalLaps > 0) this.lastTotalLaps = data.m_totalLaps;
    if (data.m_pitSpeedLimit !== undefined) this.lastPitSpeedLimit = data.m_pitSpeedLimit;
    if (data.m_safetyCarStatus !== undefined) this.lastSafetyCarStatus = data.m_safetyCarStatus;
    if (data.m_timeOfDay !== undefined) this.lastTimeOfDay = minutesToTimeString(data.m_timeOfDay);

    const isMenuState = sessionType === 0 || uid === "0";

    if (uid !== this.sessionUID) {
      if (this.sessionUID !== null && this.validLaps.length > 0) void this.flushSession();
      if (!isMenuState) {
        console.log(`[Session] new session raw m_sessionType=${sessionType} packetFormat=${this.packetFormat} -> ${this.sessionTypeName(sessionType)}`);
        this.sessionUID = uid;
        this.sessionType = sessionType;
        this.trackId = trackId;
        this.weather = weather;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
        this.resetTelemetryState();
        this.onStatusChange?.();
      } else {
        this.sessionUID = null;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
        this.resetTelemetryState();
        this.onStatusChange?.();
      }
    } else if (this.sessionUID !== null && isMenuState) {
      if (this.validLaps.length > 0) {
        void this.flushSession();
      } else {
        this.sessionUID = null;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
        this.resetTelemetryState();
      }
      this.onStatusChange?.();
    } else if (
      this.sessionUID !== null &&
      sessionType !== this.sessionType &&
      this.sessionType !== 0 &&
      sessionType !== 0
    ) {
      if (this.validLaps.length > 0) void this.flushSession();
      this.sessionType = sessionType;
      this.validLaps = [];
      this.pendingLap = null;
      this.currentLapNum = 0;
      this.resetTelemetryState();
      this.onStatusChange?.();
    } else {
      this.weather = weather;
    }
  }

  handleParticipantsPacket(data: { m_playerCarIndex?: number; m_participants?: Array<{ m_teamId?: number }> }): void {
    this.lastPacketTime = Date.now();
    if (data.m_playerCarIndex !== undefined) this.playerCarIdx = data.m_playerCarIndex;
    // Garage/program-select screens (choosing a Practice program, watching a
    // teammate, etc.) can transmit Participants data before the player's own
    // car is actually the one being driven — seen live as m_playerCarIndex
    // pointing at an unrelated grid slot (idx 21 of 22) whose team then got
    // latched in for the rest of the session. Car identity is only
    // meaningful once the player's own car is confirmed moving on track.
    if (!this.seenOnTrack) return;
    if (data.m_participants && this.playerCarIdx < data.m_participants.length) {
      const raw = data.m_participants[this.playerCarIdx]?.m_teamId ?? 253;
      if (raw !== this.teamId) {
        console.log(`[Participants] player idx=${this.playerCarIdx} raw m_teamId=${raw} -> ${TEAM_NAMES[raw] ?? "(unmapped)"}`);
      }
      this.teamId = raw;
    } else {
      console.log(`[Participants] no usable participant data: playerCarIdx=${this.playerCarIdx}, m_participants length=${data.m_participants?.length ?? "undefined"}`);
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
    m_numPitStops?: number;
    m_carPosition?: number;
    m_pitStatus?: number;
    m_totalWarnings?: number;
    m_cornerCuttingWarnings?: number;
    m_pitLaneTimeInLaneInMS?: number;
    m_pitStopTimerInMS?: number;
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
    this.currentLapDistanceM = lap.m_lapDistance ?? 0;
    if (lap.m_numPitStops !== undefined) this.lastPitStops = lap.m_numPitStops;
    if (lap.m_totalWarnings !== undefined) this.lastTotalWarnings = lap.m_totalWarnings;
    if (lap.m_cornerCuttingWarnings !== undefined) this.lastCornerCuttingWarnings = lap.m_cornerCuttingWarnings;
    if (lap.m_carPosition !== undefined && lap.m_carPosition > 0) this.lastPosition = lap.m_carPosition;

    // Fold this frame's LapData into the lap being driven before any
    // completion check below, so a lap that finishes on this very packet
    // still carries the final values from it.
    if (this.pendingLap && lapNum === this.pendingLap.lapNum) {
      const p = this.pendingLap;
      if (lap.m_carPosition !== undefined && lap.m_carPosition > 0) p.position = lap.m_carPosition;
      if (lap.m_totalWarnings !== undefined) p.totalWarnings = lap.m_totalWarnings;
      if (lap.m_cornerCuttingWarnings !== undefined) p.cornerCuttingWarnings = lap.m_cornerCuttingWarnings;
      // pitStatus: 0 none, 1 pitting, 2 in pit area. The pit timers are only
      // non-zero while the stop is in progress, so keep the largest value
      // seen rather than whatever happens to be current at the line.
      if ((lap.m_pitStatus ?? 0) > 0) p.pitted = true;
      if ((lap.m_pitLaneTimeInLaneInMS ?? 0) > p.pitLaneTimeMs) p.pitLaneTimeMs = lap.m_pitLaneTimeInLaneInMS ?? 0;
      if ((lap.m_pitStopTimerInMS ?? 0) > p.pitStopTimeMs) p.pitStopTimeMs = lap.m_pitStopTimerInMS ?? 0;
    }

    // A rewind/flashback can make the game report a lower m_currentLapNum
    // than the lap we were tracking (re-driving an earlier lap). That's not
    // a forward lap completion, and m_lastLapTimeInMS/sector fields won't
    // have refreshed for it yet — treating it as one produces a phantom
    // duplicate record (same time as the real previous lap, blank sectors).
    // Only ever complete a lap on forward progress, and skip if the "last
    // lap" time is identical to the one we already recorded (stale data
    // from before a rewind resolves back to forward-driving).
    if (!this.pendingLap || lapNum > this.pendingLap.lapNum) {
      if (
        this.pendingLap &&
        this.pendingLap.lapNum > 0 &&
        lastLapMs > 0 &&
        lastLapMs !== this.lastRecordedLapMs
      ) {
        if (!this.pendingLap.invalid) {
          if (this.validLaps.some(l => l.lap === this.pendingLap!.lapNum)) {
            // A flashback that re-crosses the start/finish line can regress
            // m_currentLapNum back into the rewind branch below and then
            // cross forward again, re-completing a lap number already
            // recorded. m_lastLapTimeInMS often gets recomputed to a value a
            // few ms off from the original rather than exactly matching, so
            // the lastLapMs equality check above alone doesn't catch it —
            // guard on lap number too, since a lap number can only ever be
            // completed once.
            console.log(`[Lap] #${this.pendingLap.lapNum} duplicate (already recorded) — skipped`);
          } else {
            // The packet that reports the new lap number is also the first
            // to carry any warning picked up in the final metres of the lap
            // just finished — fold it in before the record is built, or that
            // warning is credited to the next lap instead. Both counters are
            // session-cumulative and never decrease, so taking the larger
            // value is safe.
            if (lap.m_totalWarnings !== undefined) {
              this.pendingLap.totalWarnings = Math.max(this.pendingLap.totalWarnings, lap.m_totalWarnings);
            }
            if (lap.m_cornerCuttingWarnings !== undefined) {
              this.pendingLap.cornerCuttingWarnings = Math.max(
                this.pendingLap.cornerCuttingWarnings,
                lap.m_cornerCuttingWarnings,
              );
            }
            const record = this.buildLapRecord(this.pendingLap, lastLapMs, penalties);
            this.validLaps.push(record);
            this.lastRecordedLapMs = lastLapMs;
            this.onLapComplete?.(record);
            this.onStatusChange?.();
          }
        } else {
          // Invalid laps (track limits, cutting a corner, etc.) are
          // deliberately excluded from validLaps/the uploaded session —
          // logged so a driven-lap-count vs. recorded-lap-count mismatch
          // is traceable instead of looking like a dropped/lost lap.
          console.log(`[Lap] #${this.pendingLap.lapNum} invalid — excluded from session`);
        }
      }
      this.pendingLap = newLapState(lapNum, s1Ms, s2Ms, invalid, {
        fuelKg: this.lastFuelInTank,
        warnings: this.lastTotalWarnings,
        cornerCutting: this.lastCornerCuttingWarnings,
      });
      this.telemetrySampleCounter = 0;
      this.currentLapNum = lapNum;
    } else if (lapNum < this.pendingLap.lapNum) {
      // Rewind landed us back on an earlier lap — resume tracking it
      // in place rather than starting a new pendingLap, so sector times
      // accumulate correctly once forward driving resumes.
      this.pendingLap.lapNum = lapNum;
      this.pendingLap.s1Ms = s1Ms;
      this.pendingLap.s2Ms = s2Ms;
      this.pendingLap.invalid = invalid;
      this.currentLapNum = lapNum;
      // Drop any trace samples past the rewind point — otherwise replaying
      // the same stretch of track re-appends instead of overwriting, and
      // repeated rewinds (e.g. practicing a corner) make the trace grow
      // without bound.
      this.pendingLap.trace = this.pendingLap.trace.filter(
        (s) => s.d <= this.currentLapDistanceM
      );
    } else {
      if (s1Ms > 0) this.pendingLap.s1Ms = s1Ms;
      if (s2Ms > 0) this.pendingLap.s2Ms = s2Ms;
      if (invalid) this.pendingLap.invalid = true;
    }
  }

  // Turns a finished lap's accumulated state into the record that gets
  // uploaded. Every telemetry field is emitted only when it was actually
  // observed during the lap — a zero from a packet that never arrived is
  // indistinguishable from a real zero once uploaded, so absent stays
  // absent.
  private buildLapRecord(state: LapState, lapTimeMs: number, penaltiesSec: number): LapRecord {
    const s3Ms = Math.max(0, lapTimeMs - state.s1Ms - state.s2Ms);
    const nonZero = (a: [number, number, number, number]): [number, number, number, number] | undefined =>
      a.some(v => v > 0) ? a : undefined;

    return {
      lap: state.lapNum,
      time: msToLapTime(lapTimeMs),
      s1: msToLapTime(state.s1Ms),
      s2: msToLapTime(state.s2Ms),
      s3: msToLapTime(s3Ms),
      tires: TYRE_NAMES[this.lastTyreCompound] ?? `Compound ${this.lastTyreCompound}`,
      penalty: penaltiesSec > 0 ? `${penaltiesSec}s` : "",
      trace: state.trace.length > 0 ? state.trace : undefined,

      lapTimeMs,
      s1Ms: state.s1Ms || undefined,
      s2Ms: state.s2Ms || undefined,
      s3Ms: s3Ms || undefined,
      valid: !state.invalid,
      actualCompound: state.actualCompound > 0
        ? (TYRE_ACTUAL_NAMES[state.actualCompound] ?? `C${state.actualCompound}`)
        : undefined,
      tyreAgeLaps: state.tyreAgeLaps || undefined,
      position: state.position || undefined,
      topSpeedKph: state.topSpeedKph || undefined,
      avgThrottlePct: state.inputSamples > 0 ? state.throttleSum / state.inputSamples : undefined,
      avgBrakePct: state.inputSamples > 0 ? state.brakeSum / state.inputSamples : undefined,
      maxRpm: state.maxRpm || undefined,
      // Only meaningful when both ends were observed; a lap that started
      // before the first CarStatus packet has no start reading to subtract.
      fuelUsedKg: state.fuelStartKg > 0 && state.fuelEndKg > 0
        ? Math.max(0, state.fuelStartKg - state.fuelEndKg)
        : undefined,
      fuelAtEndKg: state.fuelEndKg || undefined,
      fuelMix: state.fuelMix || undefined,
      tyreWearEndPct: nonZero(state.tyreWearEnd),
      tyreSurfaceTempsEnd: nonZero(state.tyreSurfaceTempsEnd),
      tyreInnerTempsEnd: nonZero(state.tyreInnerTempsEnd),
      brakeTempsEnd: nonZero(state.brakeTempsEnd),
      ersDeployedMJ: state.ersDeployedJ > 0 ? state.ersDeployedJ / JOULES_PER_MJ : undefined,
      ersHarvestedMJ: state.ersHarvestedJ > 0 ? state.ersHarvestedJ / JOULES_PER_MJ : undefined,
      ersStoreEndMJ: state.ersStoreJ > 0 ? state.ersStoreJ / JOULES_PER_MJ : undefined,
      ersDeployMode: state.ersDeployMode || undefined,
      warningsThisLap: Math.max(0, state.totalWarnings - state.warningsAtStart) || undefined,
      cornerCuttingWarningsThisLap:
        Math.max(0, state.cornerCuttingWarnings - state.cornerCuttingAtStart) || undefined,
      totalWarnings: state.totalWarnings || undefined,
      penalties: state.penalties.length > 0 ? state.penalties : undefined,
      speedTrapKph: state.speedTrapKph || undefined,
      pitted: state.pitted || undefined,
      pitLaneTimeMs: state.pitLaneTimeMs || undefined,
      pitStopTimeMs: state.pitStopTimeMs || undefined,
      flashbacks: state.flashbacks || undefined,
    };
  }

  handleCarStatusPacket(data: { m_carStatusData?: Array<{
    m_visualTyreCompound?: number;
    m_tyreVisualCompound?: number;
    m_actualTyreCompound?: number;
    m_tyresAgeLaps?: number;
    m_fuelRemainingLaps?: number;
    m_fuelCapacity?: number;
    m_maxRPM?: number;
    m_vehicleFiaFlags?: number;
    m_frontBrakeBias?: number;
    m_tractionControl?: number;
    m_antiLockBrakes?: number;
    m_fuelInTank?: number;
    m_ersStoreEnergy?: number;
    m_ersDeployMode?: number;
    m_ersDeployedThisLap?: number;
    m_ersHarvestedThisLapMGUK?: number;
    m_ersHarvestedThisLapMGUH?: number;
    m_fuelMix?: number;
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carStatusData) return;
    const playerIdx = this.playerCarIdx < data.m_carStatusData.length ? this.playerCarIdx : 0;
    const car = data.m_carStatusData[playerIdx];
    if (!car) return;

    const compound = car.m_visualTyreCompound ?? car.m_tyreVisualCompound ?? 0;
    if (compound > 0) this.lastTyreCompound = compound;
    if (car.m_actualTyreCompound !== undefined && car.m_actualTyreCompound > 0) this.lastActualTyreCompound = car.m_actualTyreCompound;
    if (car.m_tyresAgeLaps !== undefined) this.lastTyreAgeLaps = car.m_tyresAgeLaps;
    const fuel = car.m_fuelRemainingLaps ?? 0;
    if (fuel > 0) this.lastFuelRemaining = fuel;
    if (car.m_fuelCapacity !== undefined && car.m_fuelCapacity > 0) this.lastFuelCapacity = car.m_fuelCapacity;
    if (car.m_maxRPM !== undefined && car.m_maxRPM > 0) this.lastEngineMaxRpm = car.m_maxRPM;
    if (car.m_vehicleFiaFlags !== undefined) this.lastVehicleFiaFlags = car.m_vehicleFiaFlags;
    if (car.m_frontBrakeBias !== undefined && car.m_frontBrakeBias > 0) this.lastLiveBrakeBias = car.m_frontBrakeBias;
    if (car.m_tractionControl !== undefined) this.lastTractionControl = car.m_tractionControl;
    if (car.m_antiLockBrakes !== undefined) this.lastAntiLockBrakes = car.m_antiLockBrakes;
    if (car.m_fuelInTank !== undefined && car.m_fuelInTank > 0) this.lastFuelInTank = car.m_fuelInTank;
    if (car.m_ersStoreEnergy !== undefined) this.lastErsEnergyStored = car.m_ersStoreEnergy;
    if (car.m_ersDeployMode !== undefined) this.lastErsDeployMode = car.m_ersDeployMode;
    if (car.m_ersDeployedThisLap !== undefined) this.lastErsDeployedThisLap = car.m_ersDeployedThisLap;
    const harvested = (car.m_ersHarvestedThisLapMGUK ?? 0) + (car.m_ersHarvestedThisLapMGUH ?? 0);
    if (harvested > 0) this.lastErsHarvestedThisLap = harvested;
    if (car.m_fuelMix !== undefined) this.lastFuelMix = car.m_fuelMix;

    const p = this.pendingLap;
    if (p) {
      if ((car.m_fuelInTank ?? 0) > 0) {
        // First reading on this lap doubles as its start value when the lap
        // began before any CarStatus packet arrived (session just started).
        if (p.fuelStartKg <= 0) p.fuelStartKg = car.m_fuelInTank!;
        p.fuelEndKg = car.m_fuelInTank!;
      }
      if (car.m_fuelMix !== undefined) p.fuelMix = car.m_fuelMix;
      if (car.m_ersDeployedThisLap !== undefined) p.ersDeployedJ = car.m_ersDeployedThisLap;
      if (harvested > 0) p.ersHarvestedJ = harvested;
      if (car.m_ersStoreEnergy !== undefined) p.ersStoreJ = car.m_ersStoreEnergy;
      if (car.m_ersDeployMode !== undefined) p.ersDeployMode = car.m_ersDeployMode;
      if ((car.m_actualTyreCompound ?? 0) > 0) p.actualCompound = car.m_actualTyreCompound!;
      if (car.m_tyresAgeLaps !== undefined) p.tyreAgeLaps = car.m_tyresAgeLaps;
    }
  }

  handleCarTelemetryPacket(data: { m_carTelemetryData?: Array<{
    m_speed?: number;
    m_throttle?: number;
    m_steer?: number;
    m_brake?: number;
    m_gear?: number;
    m_engineRPM?: number;
    m_drs?: number;
    m_tyreSurfaceTemperature?: [number, number, number, number];
    m_tyresSurfaceTemperature?: [number, number, number, number];
    m_brakesTemperature?: [number, number, number, number];
    m_tyresInnerTemperature?: [number, number, number, number];
    m_engineTemperature?: number;
    m_tyresPressure?: [number, number, number, number];
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carTelemetryData) return;
    const playerIdx = this.playerCarIdx < data.m_carTelemetryData.length ? this.playerCarIdx : 0;
    const car = data.m_carTelemetryData[playerIdx];
    if (!car) return;

    if (car.m_speed !== undefined) {
      this.lastSpeed = car.m_speed;
      if (car.m_speed > 0) this.seenOnTrack = true;
    }
    if (car.m_throttle !== undefined) this.lastThrottle = car.m_throttle;
    if (car.m_brake !== undefined) this.lastBrake = car.m_brake;
    if (car.m_gear !== undefined) this.lastGear = car.m_gear;
    if (car.m_engineRPM !== undefined) this.lastEngineRpm = car.m_engineRPM;
    if (car.m_drs !== undefined) this.lastDrsActive = car.m_drs;
    const surfaceTemps = car.m_tyresSurfaceTemperature ?? car.m_tyreSurfaceTemperature;
    if (surfaceTemps) this.lastTyreSurfaceTemps = surfaceTemps;
    if (car.m_brakesTemperature) this.lastBrakeTemps = car.m_brakesTemperature;
    if (car.m_tyresInnerTemperature) this.lastTyreInnerTemps = car.m_tyresInnerTemperature;
    if (car.m_engineTemperature !== undefined && car.m_engineTemperature > 0) this.lastEngineTemperature = car.m_engineTemperature;
    if (car.m_tyresPressure && car.m_tyresPressure.some(p => p > 0)) this.lastTyrePressureLive = car.m_tyresPressure;

    if ((car.m_speed ?? 0) > this.topSpeedKph) this.topSpeedKph = car.m_speed ?? 0;
    if (car.m_throttle !== undefined && car.m_brake !== undefined) {
      this.throttleSum += car.m_throttle * 100;
      this.brakeSum += car.m_brake * 100;
      this.throttleBrakeSamples++;
    }
    const drsActive = (car.m_drs ?? 0) === 1;
    if (drsActive && !this.drsWasActive) this.drsActivations++;
    this.drsWasActive = drsActive;
    if ((car.m_engineRPM ?? 0) > this.maxRpm) this.maxRpm = car.m_engineRPM ?? 0;
    if ((car.m_gear ?? 0) > this.topGear) this.topGear = car.m_gear ?? 0;

    const p = this.pendingLap;
    if (p) {
      // Per-lap aggregates mirror the session-level ones above but reset at
      // every lap, so a session's laps can be compared against each other
      // rather than only against a single whole-session figure.
      if ((car.m_speed ?? 0) > p.topSpeedKph) p.topSpeedKph = car.m_speed ?? 0;
      if ((car.m_engineRPM ?? 0) > p.maxRpm) p.maxRpm = car.m_engineRPM ?? 0;
      if (car.m_throttle !== undefined && car.m_brake !== undefined) {
        p.throttleSum += car.m_throttle * 100;
        p.brakeSum += car.m_brake * 100;
        p.inputSamples++;
      }
      if (surfaceTemps) p.tyreSurfaceTempsEnd = surfaceTemps;
      if (car.m_tyresInnerTemperature) p.tyreInnerTempsEnd = car.m_tyresInnerTemperature;
      if (car.m_brakesTemperature) p.brakeTempsEnd = car.m_brakesTemperature;
    }

    if (p && !p.invalid) {
      this.telemetrySampleCounter++;
      if (this.telemetrySampleCounter % SessionTracker.TRACE_SAMPLE_EVERY === 0) {
        p.trace.push({
          d: Math.round(this.currentLapDistanceM),
          speed: car.m_speed ?? 0,
          throttle: Math.round((car.m_throttle ?? 0) * 100),
          brake: Math.round((car.m_brake ?? 0) * 100),
          steer: Math.round((car.m_steer ?? 0) * 100),
          gear: car.m_gear ?? 0,
          rpm: car.m_engineRPM ?? 0,
          drs: car.m_drs ?? 0,
        });
      }
    }
  }

  handleCarSetupPacket(data: { m_carSetups?: Array<{
    m_frontWing?: number;
    m_rearWing?: number;
    m_onThrottle?: number;
    m_offThrottle?: number;
    m_frontCamber?: number;
    m_rearCamber?: number;
    m_frontToe?: number;
    m_rearToe?: number;
    m_frontSuspension?: number;
    m_rearSuspension?: number;
    m_frontAntiRollBar?: number;
    m_rearAntiRollBar?: number;
    m_frontSuspensionHeight?: number;
    m_rearSuspensionHeight?: number;
    m_brakePressure?: number;
    m_brakeBias?: number;
    m_rearLeftTyrePressure?: number;
    m_rearRightTyrePressure?: number;
    m_frontLeftTyrePressure?: number;
    m_frontRightTyrePressure?: number;
    m_fuelLoad?: number;
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carSetups) return;
    const playerIdx = this.playerCarIdx < data.m_carSetups.length ? this.playerCarIdx : 0;
    const s = data.m_carSetups[playerIdx];
    if (!s) return;

    if (s.m_fuelLoad !== undefined && s.m_fuelLoad > 0) this.lastStartingFuelKg = s.m_fuelLoad;

    const frontTyrePressure =
      (s.m_frontLeftTyrePressure ?? 0) > 0 && (s.m_frontRightTyrePressure ?? 0) > 0
        ? ((s.m_frontLeftTyrePressure ?? 0) + (s.m_frontRightTyrePressure ?? 0)) / 2
        : (s.m_frontLeftTyrePressure ?? s.m_frontRightTyrePressure ?? 0);
    const rearTyrePressure =
      (s.m_rearLeftTyrePressure ?? 0) > 0 && (s.m_rearRightTyrePressure ?? 0) > 0
        ? ((s.m_rearLeftTyrePressure ?? 0) + (s.m_rearRightTyrePressure ?? 0)) / 2
        : (s.m_rearLeftTyrePressure ?? s.m_rearRightTyrePressure ?? 0);

    this.lastSetup = {
      frontWing: s.m_frontWing ?? 0,
      rearWing: s.m_rearWing ?? 0,
      onThrottle: s.m_onThrottle ?? 0,
      offThrottle: s.m_offThrottle ?? 0,
      frontCamber: s.m_frontCamber ?? 0,
      rearCamber: s.m_rearCamber ?? 0,
      frontToe: s.m_frontToe ?? 0,
      rearToe: s.m_rearToe ?? 0,
      frontSuspension: s.m_frontSuspension ?? 0,
      rearSuspension: s.m_rearSuspension ?? 0,
      frontAntiRollBar: s.m_frontAntiRollBar ?? 0,
      rearAntiRollBar: s.m_rearAntiRollBar ?? 0,
      frontRideHeight: s.m_frontSuspensionHeight ?? 0,
      rearRideHeight: s.m_rearSuspensionHeight ?? 0,
      brakePressure: s.m_brakePressure ?? 0,
      brakeBias: s.m_brakeBias ?? 0,
      frontTyrePressure,
      rearTyrePressure,
    };
  }

  handleCarDamagePacket(data: { m_carDamageData?: Array<{
    m_tyresWear?: [number, number, number, number];
    m_tyresDamage?: [number, number, number, number];
    m_brakesDamage?: [number, number, number, number];
    m_tyreBlisters?: [number, number, number, number];
    m_frontLeftWingDamage?: number;
    m_frontRightWingDamage?: number;
    m_rearWingDamage?: number;
    m_floorDamage?: number;
    m_diffuserDamage?: number;
    m_sidepodDamage?: number;
    m_gearBoxDamage?: number;
    m_engineDamage?: number;
    m_engineMGUHWear?: number;
    m_engineESWear?: number;
    m_engineCEWear?: number;
    m_engineICEWear?: number;
    m_engineMGUKWear?: number;
    m_engineTCWear?: number;
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carDamageData) return;
    const playerIdx = this.playerCarIdx < data.m_carDamageData.length ? this.playerCarIdx : 0;
    const car = data.m_carDamageData[playerIdx];
    if (!car) return;

    if (car.m_tyresWear) this.lastTyreWear = car.m_tyresWear;
    if (car.m_frontLeftWingDamage !== undefined && car.m_frontRightWingDamage !== undefined) {
      this.lastFrontWingDamage = (car.m_frontLeftWingDamage + car.m_frontRightWingDamage) / 2;
    } else if (car.m_frontLeftWingDamage !== undefined) {
      this.lastFrontWingDamage = car.m_frontLeftWingDamage;
    }
    if (car.m_rearWingDamage !== undefined) this.lastRearWingDamage = car.m_rearWingDamage;
    if (car.m_floorDamage !== undefined) this.lastFloorDamage = car.m_floorDamage;
    if (car.m_diffuserDamage !== undefined) this.lastDiffuserDamage = car.m_diffuserDamage;
    if (car.m_sidepodDamage !== undefined) this.lastSidepodDamage = car.m_sidepodDamage;
    if (car.m_gearBoxDamage !== undefined) this.lastGearBoxDamage = car.m_gearBoxDamage;
    if (car.m_engineDamage !== undefined) this.lastEngineDamage = car.m_engineDamage;
    if (car.m_tyresDamage) this.lastTyreDamage = car.m_tyresDamage;
    if (car.m_brakesDamage) this.lastBrakesDamage = car.m_brakesDamage;
    if (car.m_tyreBlisters) this.lastTyreBlisters = car.m_tyreBlisters;
    if (car.m_engineICEWear !== undefined) {
      this.lastEngineWear = {
        mguh: car.m_engineMGUHWear ?? 0,
        es: car.m_engineESWear ?? 0,
        ce: car.m_engineCEWear ?? 0,
        ice: car.m_engineICEWear,
        mguk: car.m_engineMGUKWear ?? 0,
        tc: car.m_engineTCWear ?? 0,
      };
    }

    if (this.pendingLap && car.m_tyresWear) this.pendingLap.tyreWearEnd = car.m_tyresWear;
  }

  // Event packet (id 3). Everything here is announced exactly once and has
  // no equivalent in the per-frame packets, so an event missed is data that
  // cannot be recovered later from any other packet.
  handleEventPacket(data: {
    m_eventStringCode?: string;
    m_vehicleIdx?: number;
    m_vehicle1Idx?: number;
    m_vehicle2Idx?: number;
    m_speed?: number;
    m_penaltyType?: number;
    m_infringementType?: number;
    m_time?: number;
    m_lapNum?: number;
    m_placesGained?: number;
    m_eventType?: number;
  }): void {
    this.lastPacketTime = Date.now();
    if (!this.sessionUID) return;

    const isPlayer = (idx?: number): boolean => idx !== undefined && idx === this.playerCarIdx;

    switch (data.m_eventStringCode) {
      case "SPTP":
        if (isPlayer(data.m_vehicleIdx) && (data.m_speed ?? 0) > 0) {
          if (this.pendingLap) this.pendingLap.speedTrapKph = data.m_speed!;
          if (data.m_speed! > this.speedTrapKph) this.speedTrapKph = data.m_speed!;
        }
        break;
      case "PENA":
        if (isPlayer(data.m_vehicleIdx)) {
          const penalty: LapPenalty = {
            type: data.m_penaltyType ?? 0,
            infringement: data.m_infringementType ?? 0,
            seconds: data.m_time ?? 0,
            placesGained: data.m_placesGained ?? 0,
          };
          // The event names the lap it belongs to, which is not always the
          // lap being driven now — a penalty for a last-lap infringement can
          // land after the line. Attach it to the named lap wherever that
          // lap currently lives.
          const lapNum = data.m_lapNum;
          const recorded = lapNum !== undefined ? this.validLaps.find(l => l.lap === lapNum) : undefined;
          if (recorded) {
            recorded.penalties = [...(recorded.penalties ?? []), penalty];
          } else if (this.pendingLap && (lapNum === undefined || lapNum === this.pendingLap.lapNum)) {
            this.pendingLap.penalties.push(penalty);
          }
        }
        break;
      case "FLBK":
        this.flashbackCount++;
        if (this.pendingLap) this.pendingLap.flashbacks++;
        break;
      case "COLL":
        if (isPlayer(data.m_vehicle1Idx) || isPlayer(data.m_vehicle2Idx)) this.collisionCount++;
        break;
      case "SCAR":
        this.safetyCarPeriods++;
        break;
      case "RDFL":
        this.redFlagCount++;
        break;
      default:
        break;
    }
  }

  handleSessionHistoryPacket(data: {
    m_carIdx?: number;
    m_numLaps?: number;
    m_bestLapTimeLapNum?: number;
    m_bestSector1LapNum?: number;
    m_bestSector2LapNum?: number;
    m_bestSector3LapNum?: number;
    m_lapHistoryData?: Array<{
      m_lapTimeInMS?: number;
      m_sector1TimeMS?: number;
      m_sector2TimeMS?: number;
      m_sector3TimeMS?: number;
      m_lapValidBitFlags?: number;
    }>;
    m_tyreStintsHistoryData?: Array<{
      m_endLap?: number;
      m_tyreActualCompound?: number;
      m_tyreVisualCompound?: number;
    }>;
  }): void {
    this.lastPacketTime = Date.now();
    if (!this.sessionUID) return;
    if (!data.m_lapHistoryData) return;

    if (data.m_bestLapTimeLapNum !== undefined) this.lastBestLapNum = data.m_bestLapTimeLapNum;
    if (data.m_bestSector1LapNum !== undefined) this.lastBestSector1LapNum = data.m_bestSector1LapNum;
    if (data.m_bestSector2LapNum !== undefined) this.lastBestSector2LapNum = data.m_bestSector2LapNum;
    if (data.m_bestSector3LapNum !== undefined) this.lastBestSector3LapNum = data.m_bestSector3LapNum;

    this.lastLapHistory = data.m_lapHistoryData.map((l, i) => {
      const flags = l.m_lapValidBitFlags ?? 0;
      return {
        lap: i + 1,
        lapTimeMs: l.m_lapTimeInMS ?? 0,
        sector1Ms: l.m_sector1TimeMS ?? 0,
        sector2Ms: l.m_sector2TimeMS ?? 0,
        sector3Ms: l.m_sector3TimeMS ?? 0,
        valid: (flags & 0x01) !== 0,
        sector1Valid: (flags & 0x02) !== 0,
        sector2Valid: (flags & 0x04) !== 0,
        sector3Valid: (flags & 0x08) !== 0,
      };
    });

    if (data.m_tyreStintsHistoryData) {
      const stints: TyreStint[] = [];
      let startLap = 1;
      for (const stint of data.m_tyreStintsHistoryData) {
        const endLap = (stint.m_endLap ?? 255) === 255
          ? (this.validLaps.length > 0 ? this.validLaps[this.validLaps.length - 1].lap : startLap)
          : (stint.m_endLap ?? startLap);
        stints.push({
          startLap,
          endLap,
          compound: TYRE_ACTUAL_NAMES[stint.m_tyreActualCompound ?? 0] ?? `C${stint.m_tyreActualCompound}`,
          visualCompound: TYRE_NAMES[stint.m_tyreVisualCompound ?? 0] ?? "Unknown",
        });
        startLap = endLap + 1;
      }
      this.lastTyreStints = stints;
    }
  }

  handleFinalClassificationPacket(data: {
    m_numCars?: number;
    m_classificationData?: Array<{
      m_position?: number;
      m_numPitStops?: number;
      m_resultStatus?: number;
    }>;
  }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_classificationData) return;
    const playerIdx = this.playerCarIdx < data.m_classificationData.length ? this.playerCarIdx : 0;
    const classification = data.m_classificationData[playerIdx];
    if (!classification) return;
    const resultStatus = classification.m_resultStatus ?? 0;
    if (resultStatus >= 2 && classification.m_position !== undefined && classification.m_position > 0) {
      this.lastPosition = classification.m_position;
    }
    // Authoritative final count once the race has actually finished —
    // LapData's live count (tracked throughout, all session types) is the
    // fallback for sessions that never reach a final classification.
    if (resultStatus >= 2 && classification.m_numPitStops !== undefined) {
      this.lastPitStops = classification.m_numPitStops;
    }
  }

  // Returns a promise that resolves once the flushed session has been handed
  // off to onSessionComplete (and, per its own implementation, uploaded or
  // queued) — callers that need to guarantee the flush landed before the
  // process exits (e.g. app quit) can await this instead of firing and
  // forgetting it.
  forceFlush(): Promise<void> {
    if (this.sessionUID && this.validLaps.length > 0) {
      return this.flushSession();
    }
    return Promise.resolve();
  }

  private buildAssistsString(): string {
    const tc = ["Off", "Medium", "Full"][this.lastTractionControl] ?? "Off";
    const abs = this.lastAntiLockBrakes ? "On" : "Off";
    return `TC: ${tc}, ABS: ${abs}`;
  }

  // Clears session-scoped telemetry so stale values from a previous
  // session/sub-session can't leak into the next one's snapshot. Called at
  // every session boundary (new session, menu, session-type change, flush).
  // Deliberately excludes: playerCarIdx/teamId (participant identity, not
  // session telemetry); aiDifficulty/trackTemperature/airTemperature/
  // totalLaps/pitSpeedLimit/safetyCarStatus/timeOfDay (set unconditionally
  // from every Session packet, including the one that triggers this reset,
  // so they self-correct without needing to be zeroed here).
  private resetTelemetryState(): void {
    this.seenOnTrack = false;
    this.lastTyreCompound = 0;
    this.lastFuelRemaining = 0;
    this.lastTractionControl = 0;
    this.lastAntiLockBrakes = 0;

    this.lastSpeed = 0;
    this.lastThrottle = 0;
    this.lastBrake = 0;
    this.lastGear = 0;
    this.lastEngineRpm = 0;
    this.lastDrsActive = 0;
    this.lastTyreSurfaceTemps = [0, 0, 0, 0];
    this.lastBrakeTemps = [0, 0, 0, 0];

    this.lastFuelInTank = 0;
    this.lastErsDeployMode = 0;
    this.lastErsEnergyStored = 0;
    this.lastErsDeployedThisLap = 0;

    this.lastTyreWear = [0, 0, 0, 0];
    this.lastFrontWingDamage = 0;
    this.lastRearWingDamage = 0;

    this.lastSetup = undefined;
    this.lastTyreStints = [];
    this.lastLapHistory = [];

    this.topSpeedKph = 0;
    this.throttleSum = 0;
    this.brakeSum = 0;
    this.throttleBrakeSamples = 0;
    this.drsWasActive = false;
    this.drsActivations = 0;
    this.maxRpm = 0;
    this.topGear = 0;

    this.lastActualTyreCompound = 0;
    this.lastTyreAgeLaps = 0;
    this.lastPitStops = 0;
    this.lastFuelCapacity = 0;
    this.lastStartingFuelKg = 0;
    this.lastEngineMaxRpm = 0;
    this.lastEngineTemperature = 0;
    this.lastVehicleFiaFlags = -1;
    this.lastTyrePressureLive = [0, 0, 0, 0];
    this.lastFloorDamage = 0;
    this.lastDiffuserDamage = 0;
    this.lastSidepodDamage = 0;
    this.lastGearBoxDamage = 0;
    this.lastEngineDamage = 0;
    this.lastLiveBrakeBias = 0;

    this.lastTyreDamage = [0, 0, 0, 0];
    this.lastBrakesDamage = [0, 0, 0, 0];
    this.lastTyreBlisters = [0, 0, 0, 0];
    this.lastTyreInnerTemps = [0, 0, 0, 0];
    this.lastEngineWear = undefined;
    this.lastErsHarvestedThisLap = 0;
    this.lastFuelMix = 0;
    this.lastTotalWarnings = 0;
    this.lastCornerCuttingWarnings = 0;
    this.lastBestLapNum = 0;
    this.lastBestSector1LapNum = 0;
    this.lastBestSector2LapNum = 0;
    this.lastBestSector3LapNum = 0;

    this.speedTrapKph = 0;
    this.flashbackCount = 0;
    this.collisionCount = 0;
    this.safetyCarPeriods = 0;
    this.redFlagCount = 0;
  }

  // Live lap completion (handleLapPacket) only finalizes a lap once it sees
  // telemetry for the NEXT lap starting — that never happens for the final
  // lap of a race, since there's no lap after the checkered flag to trigger
  // it. The Session History packet is the game's own authoritative lap-by-
  // lap record and keeps updating independently of that live tracking, so
  // use it here to backfill any trailing lap(s) it has that live tracking
  // never got a chance to close out. Only ever adds laps that are already
  // fully complete in the official record — never touches one already
  // captured live.
  private reconcileFromLapHistory(): void {
    if (this.lastLapHistory.length === 0) return;
    const recordedLapNums = new Set(this.validLaps.map(l => l.lap));
    let recovered = 0;
    for (const entry of this.lastLapHistory) {
      if (entry.lapTimeMs <= 0) continue;
      if (recordedLapNums.has(entry.lap)) continue;
      if (!entry.valid) {
        console.log(`[Lap] #${entry.lap} invalid — excluded from session (from session history)`);
        continue;
      }
      this.validLaps.push({
        lap: entry.lap,
        time: msToLapTime(entry.lapTimeMs),
        s1: msToLapTime(entry.sector1Ms),
        s2: msToLapTime(entry.sector2Ms),
        s3: msToLapTime(entry.sector3Ms),
        tires: TYRE_NAMES[this.lastTyreCompound] ?? `Compound ${this.lastTyreCompound}`,
        penalty: "",
        // The history packet carries timings and validity only — none of the
        // per-lap telemetry a live-tracked lap accumulates is available for
        // a lap that live tracking never saw.
        lapTimeMs: entry.lapTimeMs,
        s1Ms: entry.sector1Ms || undefined,
        s2Ms: entry.sector2Ms || undefined,
        s3Ms: entry.sector3Ms || undefined,
        valid: entry.valid,
      });
      recovered++;
      console.log(`[Lap] #${entry.lap} ${msToLapTime(entry.lapTimeMs)} recovered from session history (missed by live tracking)`);
    }
    if (recovered > 0) this.validLaps.sort((a, b) => a.lap - b.lap);
  }

  private async flushSession(): Promise<void> {
    console.log(`[Session] Flushing with ${this.validLaps.length} live-tracked lap(s), session history knows of ${this.lastLapHistory.length} lap(s)`);
    this.reconcileFromLapHistory();

    const snap: SessionSnapshot = {
      id: randomFlushId(),
      sessionUID: this.sessionUID!,
      sessionType: this.sessionTypeName(this.sessionType),
      track: TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`,
      car: TEAM_NAMES[this.teamId] ?? `Team ${this.teamId}`,
      weather: WEATHER_NAMES[this.weather] ?? "Clear",
      laps: [...this.validLaps],
      fuelRemaining: this.lastFuelRemaining,
      aiDifficulty: this.lastAiDifficulty,
      position: this.lastPosition,
      assists: this.buildAssistsString(),
      gameVersion: this.gameVersion ?? "F1 25",
      trackTemperature: this.lastTrackTemperature || undefined,
      airTemperature: this.lastAirTemperature || undefined,
      totalLaps: this.lastTotalLaps || undefined,
      pitSpeedLimit: this.lastPitSpeedLimit || undefined,
      safetyCarStatus: this.lastSafetyCarStatus,
      timeOfDay: this.lastTimeOfDay,
      speed: this.lastSpeed || undefined,
      throttle: this.lastThrottle || undefined,
      brake: this.lastBrake || undefined,
      gear: this.lastGear || undefined,
      engineRpm: this.lastEngineRpm || undefined,
      drsActive: this.lastDrsActive,
      tyreSurfaceTemps: this.lastTyreSurfaceTemps.some(t => t > 0) ? this.lastTyreSurfaceTemps : undefined,
      brakeTemps: this.lastBrakeTemps.some(t => t > 0) ? this.lastBrakeTemps : undefined,
      fuelInTank: this.lastFuelInTank || undefined,
      ersDeployMode: this.lastErsDeployMode,
      ersEnergyStored: this.lastErsEnergyStored || undefined,
      ersDeployedThisLap: this.lastErsDeployedThisLap || undefined,
      tyreWear: this.lastTyreWear.some(w => w > 0) ? this.lastTyreWear : undefined,
      frontWingDamage: this.lastFrontWingDamage || undefined,
      rearWingDamage: this.lastRearWingDamage || undefined,
      setup: this.lastSetup,
      tyreStints: this.lastTyreStints.length > 0 ? [...this.lastTyreStints] : undefined,
      lapHistory: this.lastLapHistory.length > 0 ? [...this.lastLapHistory] : undefined,
      topSpeedKph: this.topSpeedKph || undefined,
      avgThrottlePct: this.throttleBrakeSamples > 0 ? this.throttleSum / this.throttleBrakeSamples : undefined,
      avgBrakePct: this.throttleBrakeSamples > 0 ? this.brakeSum / this.throttleBrakeSamples : undefined,
      drsActivations: this.drsActivations || undefined,
      maxRpm: this.maxRpm || undefined,
      topGear: this.topGear || undefined,
      tyreCompound: this.lastTyreCompound > 0 ? (TYRE_NAMES[this.lastTyreCompound] ?? `Compound ${this.lastTyreCompound}`) : undefined,
      actualTyreCompound: this.lastActualTyreCompound > 0 ? (TYRE_ACTUAL_NAMES[this.lastActualTyreCompound] ?? `C${this.lastActualTyreCompound}`) : undefined,
      tyreAgeLaps: this.lastTyreAgeLaps || undefined,
      pitStops: this.lastPitStops || undefined,
      fuelCapacity: this.lastFuelCapacity || undefined,
      startingFuelKg: this.lastStartingFuelKg || undefined,
      engineMaxRpm: this.lastEngineMaxRpm || undefined,
      engineTemperature: this.lastEngineTemperature || undefined,
      vehicleFiaFlags: this.lastVehicleFiaFlags >= 0 ? this.lastVehicleFiaFlags : undefined,
      tyrePressureLive: this.lastTyrePressureLive.some(p => p > 0) ? this.lastTyrePressureLive : undefined,
      floorDamage: this.lastFloorDamage || undefined,
      diffuserDamage: this.lastDiffuserDamage || undefined,
      sidepodDamage: this.lastSidepodDamage || undefined,
      gearBoxDamage: this.lastGearBoxDamage || undefined,
      engineDamage: this.lastEngineDamage || undefined,
      liveBrakeBias: this.lastLiveBrakeBias || undefined,
      tyreDamage: this.lastTyreDamage.some(d => d > 0) ? this.lastTyreDamage : undefined,
      brakesDamage: this.lastBrakesDamage.some(d => d > 0) ? this.lastBrakesDamage : undefined,
      tyreBlisters: this.lastTyreBlisters.some(b => b > 0) ? this.lastTyreBlisters : undefined,
      tyreInnerTemps: this.lastTyreInnerTemps.some(t => t > 0) ? this.lastTyreInnerTemps : undefined,
      engineWear: this.lastEngineWear,
      ersHarvestedThisLap: this.lastErsHarvestedThisLap || undefined,
      fuelMix: this.lastFuelMix || undefined,
      speedTrapKph: this.speedTrapKph || undefined,
      flashbacks: this.flashbackCount || undefined,
      collisions: this.collisionCount || undefined,
      safetyCarPeriods: this.safetyCarPeriods || undefined,
      redFlags: this.redFlagCount || undefined,
      totalWarnings: this.lastTotalWarnings || undefined,
      cornerCuttingWarnings: this.lastCornerCuttingWarnings || undefined,
      bestLapNum: this.lastBestLapNum || undefined,
      bestSector1LapNum: this.lastBestSector1LapNum || undefined,
      bestSector2LapNum: this.lastBestSector2LapNum || undefined,
      bestSector3LapNum: this.lastBestSector3LapNum || undefined,
    };

    this.sessionUID = null;
    this.validLaps = [];
    this.pendingLap = null;
    this.lastPosition = 0;
    this.resetTelemetryState();
    await this.onSessionComplete?.(snap);
  }
}
