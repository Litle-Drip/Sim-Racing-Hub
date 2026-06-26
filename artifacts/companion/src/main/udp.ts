import { EventEmitter } from "events";
import * as dgram from "dgram";

// F1 2024 UDP spec constants
const HEADER_SIZE = 29;
const NUM_CARS = 22;

// Per-car struct sizes (bytes)
const LAP_DATA_SIZE = 57;
const CAR_STATUS_SIZE = 55;
const PARTICIPANT_SIZE = 59;
const FINAL_CLASS_SIZE = 45;

export class UdpListener extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private port: number;
  private _isRunning = false;
  private _lastPacketAt = 0;

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
    
    const packetId = buf.readUInt8(6);
    const sessionUID = buf.readBigUInt64LE(7).toString();
    const playerCarIndex = buf.readUInt8(27);

    switch (packetId) {
      case 1: this.parseSession(buf, sessionUID); break;
      case 2: this.parseLapData(buf); break;
      case 4: this.parseParticipants(buf, playerCarIndex); break;
      case 7: this.parseCarStatus(buf); break;
      case 8: this.parseFinalClassification(buf); break;
    }
  }

  private parseSession(buf: Buffer, sessionUID: string): void {
    if (buf.length < 606) return;
    this.emit("session", {
      m_sessionUID: sessionUID,
      m_weather: buf.readUInt8(29),
      m_sessionType: buf.readUInt8(35),
      m_trackId: buf.readInt8(36),
      m_aiDifficulty: buf.readUInt8(605),
    });
  }

  private parseLapData(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * LAP_DATA_SIZE) return;
    const m_lapData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * LAP_DATA_SIZE;
      m_lapData.push({
        m_lastLapTimeInMS: buf.readUInt32LE(o),
        m_currentLapTimeInMS: buf.readUInt32LE(o + 4),
        m_sector1TimeInMS: buf.readUInt16LE(o + 8),
        m_sector2TimeInMS: buf.readUInt16LE(o + 11),
        m_lapDistance: buf.readFloatLE(o + 20),
        m_currentLapNum: buf.readUInt8(o + 33),
        m_currentLapInvalid: buf.readUInt8(o + 37),
        m_penalties: buf.readUInt8(o + 38),
      });
    }
    this.emit("lapData", { m_lapData });
  }

  private parseParticipants(buf: Buffer, playerCarIndex: number): void {
    if (buf.length < HEADER_SIZE + 1 + NUM_CARS * PARTICIPANT_SIZE) return;
    const m_numActiveCars = buf.readUInt8(HEADER_SIZE);
    const m_participants = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + 1 + i * PARTICIPANT_SIZE;
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

  private parseCarStatus(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + NUM_CARS * CAR_STATUS_SIZE) return;
    const m_carStatusData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + i * CAR_STATUS_SIZE;
      m_carStatusData.push({
        m_tractionControl: buf.readUInt8(o),
        m_antiLockBrakes: buf.readUInt8(o + 1),
        m_fuelRemainingLaps: buf.readFloatLE(o + 13),
        m_visualTyreCompound: buf.readUInt8(o + 26),
      });
    }
    this.emit("carStatus", { m_carStatusData });
  }

  private parseFinalClassification(buf: Buffer): void {
    if (buf.length < HEADER_SIZE + 1 + NUM_CARS * FINAL_CLASS_SIZE) return;
    const m_numCars = buf.readUInt8(HEADER_SIZE);
    const m_classificationData = [];
    for (let i = 0; i < NUM_CARS; i++) {
      const o = HEADER_SIZE + 1 + i * FINAL_CLASS_SIZE;
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
}
