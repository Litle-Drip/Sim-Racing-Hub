import { EventEmitter } from "events";
import * as dgram from "dgram";

// F1 24/25/26 UDP spec constants. The header's m_packetFormat field (the
// 4-digit game year, e.g. 2024) is checked against this allowlist before any
// packet is parsed — an unrecognized format is dropped rather than parsed
// with a possibly-wrong offset table. Struct layouts are close but not
// identical year to year; blindly parsing an unverified format produces
// silently wrong values (garbled lap times, wrong team, etc.), not a crash,
// so refusing unknown formats is the only way to catch that instead of
// uploading corrupted sessions.
const SUPPORTED_FORMATS = new Set([2024, 2025, 2026]);

const HEADER_SIZE = 29;
const NUM_CARS = 22;

// Per-car struct sizes (bytes) — derived from the packed F1 25/26 spec.
// Confirmed byte-for-byte identical to F1 24 for every packet EXCEPT
// CarDamageData, ParticipantData and FinalClassificationData (F1 24 sizes
// below), and the tail of the Session packet (see parseSession).
const LAP_DATA_SIZE = 57;
const CAR_STATUS_SIZE = 55;
const CAR_TELEMETRY_SIZE = 60;
const CAR_SETUP_SIZE = 50;
const CAR_DAMAGE_SIZE = 46;
const PARTICIPANT_SIZE = 57;
const FINAL_CLASS_SIZE = 46;

// F1 24 struct sizes for the packets that differ from F1 25/26, confirmed
// against F1 24's own UDP spec (github.com/MacManley/f1-24-udp).
const CAR_DAMAGE_SIZE_2024 = 42;
const PARTICIPANT_SIZE_2024 = 60;
const FINAL_CLASS_SIZE_2024 = 45;

function carDamageSize(format: number): number {
  return format === 2024 ? CAR_DAMAGE_SIZE_2024 : CAR_DAMAGE_SIZE;
}
function participantSize(format: number): number {
  return format === 2024 ? PARTICIPANT_SIZE_2024 : PARTICIPANT_SIZE;
}
function finalClassSize(format: number): number {
  return format === 2024 ? FINAL_CLASS_SIZE_2024 : FINAL_CLASS_SIZE;
}

// Session History sizes
const LAP_HISTORY_SIZE = 14;
const TYRE_STINT_HISTORY_SIZE = 3;

// CarDamageData gained a m_tyreBlisters[4] array in F1 25, inserted between
// m_brakesDamage and m_frontLeftWingDamage. Every field from the wings
// onwards therefore sits 4 bytes later in F1 25/26 than in F1 24 — reading
// the F1 24 offsets against an F1 25/26 packet returns blister percentages
// where wing damage should be, and shifts every later field by one.
function damageWingBase(format: number): number {
  return format === 2024 ? 24 : 28;
}

export class UdpListener extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private port: number;
  private _isRunning = false;
  private _lastPacketAt = 0;
  // Formats we've already warned about, so a stream of packets from an
  // unsupported game logs (and emits) once instead of flooding per-packet.
  private warnedFormats = new Set<number>();

  constructor(port = 20777) {
    super();
    this.port = port;
  }

  get isRunning(): boolean { return this._isRunning; }
  get lastPacketAt(): number { return this._lastPacketAt; }

  async start(port?: number): Promise<void> {
    if (this._isRunning) await this.stop();
    if (port !== undefined) this.port = port;

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      socket.on("error", (err) => {
        this._isRunning = false;
        this.emit("error", err);
        reject(err);
      });

      socket.on("message", (msg: Buffer) => {
        this._lastPacketAt = Date.now();
        this.handlePacket(msg);
      });

      socket.bind(this.port, "0.0.0.0", () => {
        socket.setBroadcast(true);
        this.socket = socket;
        this._isRunning = true;
        this.emit("started", this.port);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        try {
          this.socket.close(() => resolve());
        } catch {
          resolve();
        }
        this.socket = null;
      } else {
        resolve();
      }
      this._isRunning = false;
      this.emit("stopped");
    });
  }

  isReceiving(windowMs = 5000): boolean {
    return this._isRunning && Date.now() - this._lastPacketAt < windowMs;
  }

  private handlePacket(buf: Buffer): void {
    if (buf.length < HEADER_SIZE) return;

    const packetFormat = buf.readUInt16LE(0);
    if (!SUPPORTED_FORMATS.has(packetFormat)) {
      if (!this.warnedFormats.has(packetFormat)) {
        this.warnedFormats.add(packetFormat);
        this.emit("unsupportedFormat", packetFormat);
      }
      return;
    }

    const packetId = buf.readUInt8(6);
    const sessionUID = buf.readBigUInt64LE(7).toString();
    const playerCarIndex = buf.readUInt8(27);

    switch (packetId) {
      case 1: this.parseSession(buf, sessionUID, packetFormat); break;
      case 2: this.parseLapData(buf); break;
      case 3: this.parseEvent(buf, playerCarIndex); break;
      case 4: this.parseParticipants(buf, playerCarIndex, packetFormat); break;
      case 5: this.parseCarSetup(buf); break;
      case 6: this.parseCarTelemetry(buf); break;
      case 7: this.parseCarStatus(buf); break;
      case 8: this.parseFinalClassification(buf, packetFormat); break;
      case 10: this.parseCarDamage(buf, packetFormat); break;
      case 11: this.parseSessionHistory(buf, playerCarIndex); break;
    }
  }

  // The Session packet is identical between F1 24 and F1 25/26 up through
  // m_safetyCarStatus (offset 153) — marshal zones didn't change. Past that,
  // F1 24's weather forecast array is longer, pushing m_aiDifficulty and
  // m_timeOfDay to different offsets (669/696 vs 605/632). Confirmed against
  // F1 24's own UDP spec (github.com/MacManley/f1-24-udp).
  private parseSession(buf: Buffer, sessionUID: string, format: number): void {
    const aiDifficultyOffset = format === 2024 ? 669 : 605;
    const timeOfDayOffset = format === 2024 ? 696 : 632;
    if (buf.length < aiDifficultyOffset + 1) return;
    this.emit("session", {
      m_packetFormat: format,
      m_sessionUID: sessionUID,
      m_weather: buf.readUInt8(29),
      m_trackTemperature: buf.readInt8(30),
      m_airTemperature: buf.readInt8(31),
      m_totalLaps: buf.readUInt8(32),
      m_sessionType: buf.readUInt8(35),
      m_trackId: buf.readInt8(36),
      m_pitSpeedLimit: buf.readUInt8(42),
      m_safetyCarStatus: buf.readUInt8(153),
      m_aiDifficulty: buf.readUInt8(aiDifficultyOffset),
      m_timeOfDay: buf.length >= timeOfDayOffset + 4 ? buf.readUInt32LE(timeOfDayOffset) : undefined,
    });
  }

  private parseLapData(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * LAP_DATA_SIZE) return;
    const m_lapData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * LAP_DATA_SIZE;
      // Sector times are split into a ms part (uint16, 0-65535) and a
      // minutes part (uint8) — reading only the ms part silently truncates
      // any sector over ~65s (rare, but real: a spin/off-track recovery
      // within one sector). Combine both, matching how session history's
      // sector times are already reconstructed further down.
      const s1Ms = buf.readUInt16LE(o + 8);
      const s1Min = buf.readUInt8(o + 10);
      const s2Ms = buf.readUInt16LE(o + 11);
      const s2Min = buf.readUInt8(o + 13);
      // The two gap fields are split ms/minutes the same way sector times
      // are, so they need the same reconstruction to survive gaps over ~65s.
      const frontMs = buf.readUInt16LE(o + 14);
      const frontMin = buf.readUInt8(o + 16);
      const leaderMs = buf.readUInt16LE(o + 17);
      const leaderMin = buf.readUInt8(o + 19);
      m_lapData.push({
        m_lastLapTimeInMS: buf.readUInt32LE(o),
        m_currentLapTimeInMS: buf.readUInt32LE(o + 4),
        m_sector1TimeInMS: s1Min * 60_000 + s1Ms,
        m_sector2TimeInMS: s2Min * 60_000 + s2Ms,
        m_deltaToCarInFrontInMS: frontMin * 60_000 + frontMs,
        m_deltaToRaceLeaderInMS: leaderMin * 60_000 + leaderMs,
        m_lapDistance: buf.readFloatLE(o + 20),
        m_totalDistance: buf.readFloatLE(o + 24),
        m_safetyCarDelta: buf.readFloatLE(o + 28),
        m_carPosition: buf.readUInt8(o + 32),
        m_currentLapNum: buf.readUInt8(o + 33),
        m_pitStatus: buf.readUInt8(o + 34),
        m_numPitStops: buf.readUInt8(o + 35),
        m_sector: buf.readUInt8(o + 36),
        m_currentLapInvalid: buf.readUInt8(o + 37),
        m_penalties: buf.readUInt8(o + 38),
        m_totalWarnings: buf.readUInt8(o + 39),
        m_cornerCuttingWarnings: buf.readUInt8(o + 40),
        m_numUnservedDriveThroughPens: buf.readUInt8(o + 41),
        m_numUnservedStopGoPens: buf.readUInt8(o + 42),
        m_gridPosition: buf.readUInt8(o + 43),
        m_driverStatus: buf.readUInt8(o + 44),
        m_resultStatus: buf.readUInt8(o + 45),
        m_pitLaneTimerActive: buf.readUInt8(o + 46),
        m_pitLaneTimeInLaneInMS: buf.readUInt16LE(o + 47),
        m_pitStopTimerInMS: buf.readUInt16LE(o + 49),
        m_pitStopShouldServePen: buf.readUInt8(o + 51),
        m_speedTrapFastestSpeed: buf.readFloatLE(o + 52),
        m_speedTrapFastestLap: buf.readUInt8(o + 56),
      });
    }
    this.emit("lapData", { m_lapData });
  }

  // The Event packet is a 4-character string code plus a union whose layout
  // depends on that code. Only the codes carrying data worth attributing to
  // a lap are decoded; the rest are emitted with just their code so a
  // listener can still count/act on them. Every read past the code is length-
  // guarded because the union is shorter than the packet's max size for most
  // event types, and the game only sends as many bytes as the event needs.
  private parseEvent(buf: Buffer, playerCarIndex: number): void {
    if (buf.length < HEADER_SIZE + 4) return;
    const code = buf.toString("utf8", HEADER_SIZE, HEADER_SIZE + 4);
    const d = HEADER_SIZE + 4;
    const has = (n: number): boolean => buf.length >= d + n;

    const event: Record<string, unknown> = { m_eventStringCode: code, m_playerCarIndex: playerCarIndex };

    switch (code) {
      case "FTLP": // Fastest lap
        if (has(5)) {
          event.m_vehicleIdx = buf.readUInt8(d);
          event.m_lapTime = buf.readFloatLE(d + 1);
        }
        break;
      case "SPTP": // Speed trap triggered
        if (has(12)) {
          event.m_vehicleIdx = buf.readUInt8(d);
          event.m_speed = buf.readFloatLE(d + 1);
          event.m_isOverallFastestInSession = buf.readUInt8(d + 5);
          event.m_isDriverFastestInSession = buf.readUInt8(d + 6);
          event.m_fastestVehicleIdxInSession = buf.readUInt8(d + 7);
          event.m_fastestSpeedInSession = buf.readFloatLE(d + 8);
        }
        break;
      case "PENA": // Penalty issued
        if (has(7)) {
          event.m_penaltyType = buf.readUInt8(d);
          event.m_infringementType = buf.readUInt8(d + 1);
          event.m_vehicleIdx = buf.readUInt8(d + 2);
          event.m_otherVehicleIdx = buf.readUInt8(d + 3);
          event.m_time = buf.readUInt8(d + 4);
          event.m_lapNum = buf.readUInt8(d + 5);
          event.m_placesGained = buf.readUInt8(d + 6);
        }
        break;
      case "FLBK": // Flashback used
        if (has(8)) {
          event.m_flashbackFrameIdentifier = buf.readUInt32LE(d);
          event.m_flashbackSessionTime = buf.readFloatLE(d + 4);
        }
        break;
      case "RTMT": // Retirement
        if (has(2)) {
          event.m_vehicleIdx = buf.readUInt8(d);
          event.m_reason = buf.readUInt8(d + 1);
        }
        break;
      case "DRSD": // DRS disabled
        if (has(1)) event.m_reason = buf.readUInt8(d);
        break;
      case "SCAR": // Safety car deployed/changed
        if (has(2)) {
          event.m_safetyCarType = buf.readUInt8(d);
          event.m_eventType = buf.readUInt8(d + 1);
        }
        break;
      case "COLL": // Collision
        if (has(2)) {
          event.m_vehicle1Idx = buf.readUInt8(d);
          event.m_vehicle2Idx = buf.readUInt8(d + 1);
        }
        break;
      case "OVTK": // Overtake
        if (has(2)) {
          event.m_overtakingVehicleIdx = buf.readUInt8(d);
          event.m_beingOvertakenVehicleIdx = buf.readUInt8(d + 1);
        }
        break;
      case "TMPT": // Team mate in pits
      case "RCWN": // Race winner
      case "DTSV": // Drive-through penalty served
      case "SGSV": // Stop-go penalty served
        if (has(1)) event.m_vehicleIdx = buf.readUInt8(d);
        break;
      case "STLG": // Start lights
        if (has(1)) event.m_numLights = buf.readUInt8(d);
        break;
      // SSTA / SEND / DRSE / CHQF / RDFL / LGOT / BUTN carry nothing this app
      // needs beyond the code itself.
      default:
        break;
    }

    this.emit("event", event);
  }

  private parseParticipants(buf: Buffer, playerCarIndex: number, format: number): void {
    const stride = participantSize(format);
    if (buf.length < HEADER_SIZE + 1 + NUM_CARS * stride) return;
    const m_numActiveCars = buf.readUInt8(HEADER_SIZE);
    const m_participants = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + 1 + i * stride;
      const nameStart = o + 7;
      const nameEnd = buf.indexOf(0, nameStart);
      const nameLimit = nameStart + 48;
      const m_name = buf.toString("utf8", nameStart, nameEnd === -1 || nameEnd > nameLimit ? nameLimit : nameEnd);
      m_participants.push({
        m_teamId: buf.readUInt8(o + 3),
        m_myTeam: buf.readUInt8(o + 4),
        m_name,
      });
    }
    this.emit("participants", { m_numActiveCars, m_participants, m_playerCarIndex: playerCarIndex });
  }

  private parseCarSetup(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * CAR_SETUP_SIZE) return;
    const m_carSetups = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * CAR_SETUP_SIZE;
      m_carSetups.push({
        m_frontWing: buf.readUInt8(o),
        m_rearWing: buf.readUInt8(o + 1),
        m_onThrottle: buf.readUInt8(o + 2),
        m_offThrottle: buf.readUInt8(o + 3),
        m_frontCamber: buf.readFloatLE(o + 4),
        m_rearCamber: buf.readFloatLE(o + 8),
        m_frontToe: buf.readFloatLE(o + 12),
        m_rearToe: buf.readFloatLE(o + 16),
        m_frontSuspension: buf.readUInt8(o + 20),
        m_rearSuspension: buf.readUInt8(o + 21),
        m_frontAntiRollBar: buf.readUInt8(o + 22),
        m_rearAntiRollBar: buf.readUInt8(o + 23),
        m_frontSuspensionHeight: buf.readUInt8(o + 24),
        m_rearSuspensionHeight: buf.readUInt8(o + 25),
        m_brakePressure: buf.readUInt8(o + 26),
        m_brakeBias: buf.readUInt8(o + 27),
        m_rearLeftTyrePressure: buf.readFloatLE(o + 29),
        m_rearRightTyrePressure: buf.readFloatLE(o + 33),
        m_frontLeftTyrePressure: buf.readFloatLE(o + 37),
        m_frontRightTyrePressure: buf.readFloatLE(o + 41),
        m_fuelLoad: buf.readFloatLE(o + 46),
      });
    }
    this.emit("carSetup", { m_carSetups });
  }

  private parseCarTelemetry(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * CAR_TELEMETRY_SIZE) return;
    const m_carTelemetryData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * CAR_TELEMETRY_SIZE;
      m_carTelemetryData.push({
        m_speed: buf.readUInt16LE(o),
        m_throttle: buf.readFloatLE(o + 2),
        m_steer: buf.readFloatLE(o + 6),
        m_brake: buf.readFloatLE(o + 10),
        m_clutch: buf.readUInt8(o + 14),
        m_gear: buf.readInt8(o + 15),
        m_engineRPM: buf.readUInt16LE(o + 16),
        m_drs: buf.readUInt8(o + 18),
        m_revLightsPercent: buf.readUInt8(o + 19),
        m_brakesTemperature: [
          buf.readUInt16LE(o + 22),
          buf.readUInt16LE(o + 24),
          buf.readUInt16LE(o + 26),
          buf.readUInt16LE(o + 28),
        ] as [number, number, number, number],
        m_tyresSurfaceTemperature: [
          buf.readUInt8(o + 30),
          buf.readUInt8(o + 31),
          buf.readUInt8(o + 32),
          buf.readUInt8(o + 33),
        ] as [number, number, number, number],
        m_tyresInnerTemperature: [
          buf.readUInt8(o + 34),
          buf.readUInt8(o + 35),
          buf.readUInt8(o + 36),
          buf.readUInt8(o + 37),
        ] as [number, number, number, number],
        m_engineTemperature: buf.readUInt16LE(o + 38),
        m_tyresPressure: [
          buf.readFloatLE(o + 40),
          buf.readFloatLE(o + 44),
          buf.readFloatLE(o + 48),
          buf.readFloatLE(o + 52),
        ] as [number, number, number, number],
        m_surfaceType: [
          buf.readUInt8(o + 56),
          buf.readUInt8(o + 57),
          buf.readUInt8(o + 58),
          buf.readUInt8(o + 59),
        ] as [number, number, number, number],
      });
    }
    this.emit("carTelemetry", { m_carTelemetryData });
  }

  private parseCarStatus(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * CAR_STATUS_SIZE) return;
    const m_carStatusData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * CAR_STATUS_SIZE;
      m_carStatusData.push({
        m_tractionControl: buf.readUInt8(o),
        m_antiLockBrakes: buf.readUInt8(o + 1),
        m_fuelMix: buf.readUInt8(o + 2),
        m_frontBrakeBias: buf.readUInt8(o + 3),
        m_pitLimiterStatus: buf.readUInt8(o + 4),
        m_fuelInTank: buf.readFloatLE(o + 5),
        m_fuelCapacity: buf.readFloatLE(o + 9),
        m_fuelRemainingLaps: buf.readFloatLE(o + 13),
        m_maxRPM: buf.readUInt16LE(o + 17),
        m_idleRPM: buf.readUInt16LE(o + 19),
        m_maxGears: buf.readUInt8(o + 21),
        m_drsAllowed: buf.readUInt8(o + 22),
        m_drsActivationDistance: buf.readUInt16LE(o + 23),
        m_actualTyreCompound: buf.readUInt8(o + 25),
        m_visualTyreCompound: buf.readUInt8(o + 26),
        m_tyresAgeLaps: buf.readUInt8(o + 27),
        m_vehicleFiaFlags: buf.readInt8(o + 28),
        m_enginePowerICE: buf.readFloatLE(o + 29),
        m_enginePowerMGUK: buf.readFloatLE(o + 33),
        m_ersStoreEnergy: buf.readFloatLE(o + 37),
        m_ersDeployMode: buf.readUInt8(o + 41),
        m_ersHarvestedThisLapMGUK: buf.readFloatLE(o + 42),
        m_ersHarvestedThisLapMGUH: buf.readFloatLE(o + 46),
        m_ersDeployedThisLap: buf.readFloatLE(o + 50),
      });
    }
    this.emit("carStatus", { m_carStatusData });
  }

  private parseFinalClassification(buf: Buffer, format: number): void {
    const stride = finalClassSize(format);
    if (buf.length < HEADER_SIZE + 1 + NUM_CARS * stride) return;
    const m_numCars = buf.readUInt8(HEADER_SIZE);
    const m_classificationData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + 1 + i * stride;
      m_classificationData.push({
        m_position: buf.readUInt8(o),
        m_numLaps: buf.readUInt8(o + 1),
        m_gridPosition: buf.readUInt8(o + 2),
        m_points: buf.readUInt8(o + 3),
        m_numPitStops: buf.readUInt8(o + 4),
        m_resultStatus: buf.readUInt8(o + 5),
      });
    }
    this.emit("finalClassification", { m_numCars, m_classificationData });
  }

  private parseCarDamage(buf: Buffer, format: number): void {
    const stride = carDamageSize(format);
    if (buf.length < HEADER_SIZE + NUM_CARS * stride) return;
    const w = damageWingBase(format);
    const hasBlisters = format !== 2024;
    const m_carDamageData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * stride;
      m_carDamageData.push({
        m_tyresWear: [
          buf.readFloatLE(o),
          buf.readFloatLE(o + 4),
          buf.readFloatLE(o + 8),
          buf.readFloatLE(o + 12),
        ] as [number, number, number, number],
        m_tyresDamage: [
          buf.readUInt8(o + 16),
          buf.readUInt8(o + 17),
          buf.readUInt8(o + 18),
          buf.readUInt8(o + 19),
        ] as [number, number, number, number],
        m_brakesDamage: [
          buf.readUInt8(o + 20),
          buf.readUInt8(o + 21),
          buf.readUInt8(o + 22),
          buf.readUInt8(o + 23),
        ] as [number, number, number, number],
        m_tyreBlisters: hasBlisters
          ? ([
              buf.readUInt8(o + 24),
              buf.readUInt8(o + 25),
              buf.readUInt8(o + 26),
              buf.readUInt8(o + 27),
            ] as [number, number, number, number])
          : undefined,
        m_frontLeftWingDamage: buf.readUInt8(o + w),
        m_frontRightWingDamage: buf.readUInt8(o + w + 1),
        m_rearWingDamage: buf.readUInt8(o + w + 2),
        m_floorDamage: buf.readUInt8(o + w + 3),
        m_diffuserDamage: buf.readUInt8(o + w + 4),
        m_sidepodDamage: buf.readUInt8(o + w + 5),
        m_drsFault: buf.readUInt8(o + w + 6),
        m_ersFault: buf.readUInt8(o + w + 7),
        m_gearBoxDamage: buf.readUInt8(o + w + 8),
        m_engineDamage: buf.readUInt8(o + w + 9),
        m_engineMGUHWear: buf.readUInt8(o + w + 10),
        m_engineESWear: buf.readUInt8(o + w + 11),
        m_engineCEWear: buf.readUInt8(o + w + 12),
        m_engineICEWear: buf.readUInt8(o + w + 13),
        m_engineMGUKWear: buf.readUInt8(o + w + 14),
        m_engineTCWear: buf.readUInt8(o + w + 15),
        m_engineBlown: buf.readUInt8(o + w + 16),
        m_engineSeized: buf.readUInt8(o + w + 17),
      });
    }
    this.emit("carDamage", { m_carDamageData });
  }

  private parseSessionHistory(buf: Buffer, playerCarIndex: number): void {
    const minSize = HEADER_SIZE + 7 + 100 * LAP_HISTORY_SIZE + 8 * TYRE_STINT_HISTORY_SIZE;
    if (buf.length < minSize) return;

    const m_carIdx = buf.readUInt8(HEADER_SIZE);
    if (m_carIdx !== playerCarIndex) return;

    const m_numLaps = buf.readUInt8(HEADER_SIZE + 1);
    const m_numTyreStints = buf.readUInt8(HEADER_SIZE + 2);
    const m_bestLapTimeLapNum = buf.readUInt8(HEADER_SIZE + 3);
    const m_bestSector1LapNum = buf.readUInt8(HEADER_SIZE + 4);
    const m_bestSector2LapNum = buf.readUInt8(HEADER_SIZE + 5);
    const m_bestSector3LapNum = buf.readUInt8(HEADER_SIZE + 6);

    const m_lapHistoryData = [];
    const lapCount = Math.min(m_numLaps, 100);
    for (let i = 0; i < lapCount; i++) {
      const lo = HEADER_SIZE + 7 + i * LAP_HISTORY_SIZE;
      const s1ms = buf.readUInt16LE(lo + 4);
      const s1min = buf.readUInt8(lo + 6);
      const s2ms = buf.readUInt16LE(lo + 7);
      const s2min = buf.readUInt8(lo + 9);
      const s3ms = buf.readUInt16LE(lo + 10);
      const s3min = buf.readUInt8(lo + 12);
      m_lapHistoryData.push({
        m_lapTimeInMS: buf.readUInt32LE(lo),
        m_sector1TimeMS: s1min * 60_000 + s1ms,
        m_sector2TimeMS: s2min * 60_000 + s2ms,
        m_sector3TimeMS: s3min * 60_000 + s3ms,
        m_lapValidBitFlags: buf.readUInt8(lo + 13),
      });
    }

    const m_tyreStintsHistoryData = [];
    const stintCount = Math.min(m_numTyreStints, 8);
    for (let i = 0; i < stintCount; i++) {
      const so = HEADER_SIZE + 7 + 100 * LAP_HISTORY_SIZE + i * TYRE_STINT_HISTORY_SIZE;
      m_tyreStintsHistoryData.push({
        m_endLap: buf.readUInt8(so),
        m_tyreActualCompound: buf.readUInt8(so + 1),
        m_tyreVisualCompound: buf.readUInt8(so + 2),
      });
    }

    this.emit("sessionHistory", {
      m_carIdx,
      m_numLaps,
      m_numTyreStints,
      m_bestLapTimeLapNum,
      m_bestSector1LapNum,
      m_bestSector2LapNum,
      m_bestSector3LapNum,
      m_lapHistoryData,
      m_tyreStintsHistoryData,
    });
  }
}
