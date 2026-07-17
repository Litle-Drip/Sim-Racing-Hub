// F1 25 UDP session & lap state machine

export interface LapTraceSample {
  d: number; // lap distance, metres
  speed: number; // km/h
  throttle: number; // 0-100
  brake: number; // 0-100
  steer: number; // -100 (full left) to 100 (full right)
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
// rebranded to RB, Alfa Romeo rebranded to Sauber). F1 25's "2026 Season
// Pack" adds alternate-livery variants of each team at a fixed offset from
// its base id — 185 for '24 retro liveries, 220 for 2026-spec concept
// liveries — confirmed live via a diagnostic log showing raw m_teamId=228
// (=8+220) for a McLaren car driven in the 2026 content.
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
  220: "Mercedes '26",
  221: "Ferrari '26",
  222: "Red Bull Racing '26",
  223: "Williams '26",
  224: "Aston Martin '26",
  225: "Alpine '26",
  226: "RB '26",
  227: "Haas '26",
  228: "McLaren '26",
  229: "Sauber '26",
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
    m_aiDifficulty?: number;
    m_trackTemperature?: number;
    m_airTemperature?: number;
    m_totalLaps?: number;
    m_pitSpeedLimit?: number;
    m_safetyCarStatus?: number;
    m_timeOfDay?: number;
  }): void {
    this.lastPacketTime = Date.now();

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
      if (this.sessionUID !== null && this.validLaps.length > 0) this.flushSession();
      if (!isMenuState) {
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
        this.flushSession();
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
      if (this.validLaps.length > 0) this.flushSession();
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
          const s1 = msToLapTime(this.pendingLap.s1Ms);
          const s2 = msToLapTime(this.pendingLap.s2Ms);
          const s3 = msToLapTime(Math.max(0, lastLapMs - this.pendingLap.s1Ms - this.pendingLap.s2Ms));
          const record: LapRecord = {
            lap: this.pendingLap.lapNum,
            time: msToLapTime(lastLapMs),
            s1, s2, s3,
            tires: TYRE_NAMES[this.lastTyreCompound] ?? "Unknown",
            penalty: penalties > 0 ? `${penalties}s` : "",
            trace: this.pendingLap.trace.length > 0 ? this.pendingLap.trace : undefined,
          };
          this.validLaps.push(record);
          this.lastRecordedLapMs = lastLapMs;
          this.onLapComplete?.(record);
          this.onStatusChange?.();
        }
      }
      this.pendingLap = { lapNum, lapStartTimeMs: Date.now(), s1Ms, s2Ms, invalid, trace: [] };
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

  handleCarStatusPacket(data: { m_carStatusData?: Array<{
    m_visualTyreCompound?: number;
    m_tyreVisualCompound?: number;
    m_actualTyreCompound?: number;
    m_tyresAgeLaps?: number;
    m_fuelRemainingLaps?: number;
    m_fuelCapacity?: number;
    m_maxRPM?: number;
    m_vehicleFiaFlags?: number;
    m_tractionControl?: number;
    m_antiLockBrakes?: number;
    m_fuelInTank?: number;
    m_ersStoreEnergy?: number;
    m_ersDeployMode?: number;
    m_ersDeployedThisLap?: number;
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
    if (car.m_tractionControl !== undefined) this.lastTractionControl = car.m_tractionControl;
    if (car.m_antiLockBrakes !== undefined) this.lastAntiLockBrakes = car.m_antiLockBrakes;
    if (car.m_fuelInTank !== undefined && car.m_fuelInTank > 0) this.lastFuelInTank = car.m_fuelInTank;
    if (car.m_ersStoreEnergy !== undefined) this.lastErsEnergyStored = car.m_ersStoreEnergy;
    if (car.m_ersDeployMode !== undefined) this.lastErsDeployMode = car.m_ersDeployMode;
    if (car.m_ersDeployedThisLap !== undefined) this.lastErsDeployedThisLap = car.m_ersDeployedThisLap;
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
    m_engineTemperature?: number;
    m_tyresPressure?: [number, number, number, number];
  }> }): void {
    this.lastPacketTime = Date.now();
    if (!data.m_carTelemetryData) return;
    const playerIdx = this.playerCarIdx < data.m_carTelemetryData.length ? this.playerCarIdx : 0;
    const car = data.m_carTelemetryData[playerIdx];
    if (!car) return;

    if (car.m_speed !== undefined) this.lastSpeed = car.m_speed;
    if (car.m_throttle !== undefined) this.lastThrottle = car.m_throttle;
    if (car.m_brake !== undefined) this.lastBrake = car.m_brake;
    if (car.m_gear !== undefined) this.lastGear = car.m_gear;
    if (car.m_engineRPM !== undefined) this.lastEngineRpm = car.m_engineRPM;
    if (car.m_drs !== undefined) this.lastDrsActive = car.m_drs;
    const surfaceTemps = car.m_tyresSurfaceTemperature ?? car.m_tyreSurfaceTemperature;
    if (surfaceTemps) this.lastTyreSurfaceTemps = surfaceTemps;
    if (car.m_brakesTemperature) this.lastBrakeTemps = car.m_brakesTemperature;
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

    if (this.pendingLap && !this.pendingLap.invalid) {
      this.telemetrySampleCounter++;
      if (this.telemetrySampleCounter % SessionTracker.TRACE_SAMPLE_EVERY === 0) {
        this.pendingLap.trace.push({
          d: Math.round(this.currentLapDistanceM),
          speed: car.m_speed ?? 0,
          throttle: Math.round((car.m_throttle ?? 0) * 100),
          brake: Math.round((car.m_brake ?? 0) * 100),
          steer: Math.round((car.m_steer ?? 0) * 100),
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
    m_frontLeftWingDamage?: number;
    m_frontRightWingDamage?: number;
    m_rearWingDamage?: number;
    m_floorDamage?: number;
    m_diffuserDamage?: number;
    m_sidepodDamage?: number;
    m_gearBoxDamage?: number;
    m_engineDamage?: number;
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
  }

  handleSessionHistoryPacket(data: {
    m_carIdx?: number;
    m_numLaps?: number;
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

    this.lastLapHistory = data.m_lapHistoryData.map((l, i) => ({
      lap: i + 1,
      lapTimeMs: l.m_lapTimeInMS ?? 0,
      sector1Ms: l.m_sector1TimeMS ?? 0,
      sector2Ms: l.m_sector2TimeMS ?? 0,
      sector3Ms: l.m_sector3TimeMS ?? 0,
      valid: ((l.m_lapValidBitFlags ?? 0) & 0x01) !== 0,
    }));

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

  forceFlush(): void {
    if (this.sessionUID && this.validLaps.length > 0) {
      this.flushSession();
    }
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
  }

  private flushSession(): void {
    const snap: SessionSnapshot = {
      id: randomFlushId(),
      sessionUID: this.sessionUID!,
      sessionType: SESSION_TYPES[this.sessionType] ?? "Unknown",
      track: TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`,
      car: TEAM_NAMES[this.teamId] ?? "My Team",
      weather: WEATHER_NAMES[this.weather] ?? "Clear",
      laps: [...this.validLaps],
      fuelRemaining: this.lastFuelRemaining,
      aiDifficulty: this.lastAiDifficulty,
      position: this.lastPosition,
      assists: this.buildAssistsString(),
      gameVersion: "F1 25",
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
      tyreCompound: this.lastTyreCompound > 0 ? TYRE_NAMES[this.lastTyreCompound] : undefined,
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
    };

    this.sessionUID = null;
    this.validLaps = [];
    this.pendingLap = null;
    this.lastPosition = 0;
    this.resetTelemetryState();
    this.onSessionComplete?.(snap);
  }
}
