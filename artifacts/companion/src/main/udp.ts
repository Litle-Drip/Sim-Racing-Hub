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
      m_lapData.push({
        m_lastLapTimeInMS: buf.readUInt32LE(o),
        m_currentLapTimeInMS: buf.readUInt32LE(o + 4),
        m_sector1TimeInMS: s1Min * 60_000 + s1Ms,
        m_sector2TimeInMS: s2Min * 60_000 + s2Ms,
        m_lapDistance: buf.readFloatLE(o + 20),
        m_currentLapNum: buf.readUInt8(o + 33),
        m_pitStatus: buf.readUInt8(o + 34),
        m_numPitStops: buf.readUInt8(o + 35),
        m_currentLapInvalid: buf.readUInt8(o + 37),
        m_penalties: buf.readUInt8(o + 38),
      });
    }
    this.emit("lapData", { m_lapData });
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
        m_gear: buf.readInt8(o + 15),
        m_engineRPM: buf.readUInt16LE(o + 16),
        m_drs: buf.readUInt8(o + 18),
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
        m_engineTemperature: buf.readUInt16LE(o + 38),
        m_tyresPressure: [
          buf.readFloatLE(o + 40),
          buf.readFloatLE(o + 44),
          buf.readFloatLE(o + 48),
          buf.readFloatLE(o + 52),
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
        m_frontBrakeBias: buf.readUInt8(o + 3),
        m_fuelInTank: buf.readFloatLE(o + 5),
        m_fuelCapacity: buf.readFloatLE(o + 9),
        m_fuelRemainingLaps: buf.readFloatLE(o + 13),
        m_maxRPM: buf.readUInt16LE(o + 17),
        m_actualTyreCompound: buf.readUInt8(o + 25),
        m_visualTyreCompound: buf.readUInt8(o + 26),
        m_tyresAgeLaps: buf.readUInt8(o + 27),
        m_vehicleFiaFlags: buf.readInt8(o + 28),
        m_ersStoreEnergy: buf.readFloatLE(o + 37),
        m_ersDeployMode: buf.readUInt8(o + 41),
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
        m_frontLeftWingDamage: buf.readUInt8(o + 24),
        m_frontRightWingDamage: buf.readUInt8(o + 25),
        m_rearWingDamage: buf.readUInt8(o + 26),
        m_floorDamage: buf.readUInt8(o + 27),
        m_diffuserDamage: buf.readUInt8(o + 28),
        m_sidepodDamage: buf.readUInt8(o + 29),
        m_gearBoxDamage: buf.readUInt8(o + 32),
        m_engineDamage: buf.readUInt8(o + 33),
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
      m_lapHistoryData,
      m_tyreStintsHistoryData,
    });
  }
}
