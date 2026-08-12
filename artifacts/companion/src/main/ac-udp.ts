import { EventEmitter } from "events";
import * as dgram from "dgram";

// Assetto Corsa's "Remote Telemetry" UDP protocol (the same one Content
// Manager / phone dashboard apps use). Unlike F1's protocol — where the game
// broadcasts unprompted and we just listen — AC is a request/response
// server: we act as the client, connect out to the game, and it only sends
// data once we've handshaken and explicitly subscribed. It must be enabled
// in-game first (Documents/Assetto Corsa/cfg/race.ini -> [REMOTE_TELEMETRY]
// ACTIVE=1), which is off by default.
// Spec: https://docs.google.com/document/d/1KfkZiIluXZ6mMhLWfDX1qAGbvhGRC3ZUzjVIt5FQpp4/pub
const AC_DEFAULT_PORT = 9996;

const OP_HANDSHAKE = 0;
const OP_SUBSCRIBE_UPDATE = 1;
const OP_SUBSCRIBE_SPOT = 2;
const OP_DISMISS = 3;

// AC doesn't tag its packets with an identifier/type byte — the reference
// client (and every other implementation) distinguishes them purely by exact
// UDP payload size. Confirmed against ac-remote-telemetry-client.
const HANDSHAKE_RESPONSE_SIZE = 408;
const RT_CAR_INFO_SIZE = 328;
const RT_LAP_SIZE = 212;

export interface AcHandshakeInfo {
  carName: string;
  driverName: string;
  trackName: string;
  trackConfig: string;
}

export interface AcCarInfo {
  speedKmh: number;
  gas: number;
  brake: number;
  gear: number;
  engineRpm: number;
  steer: number;
  lapTimeMs: number;
  lastLapMs: number;
  bestLapMs: number;
  lapCount: number;
  isInPit: boolean;
}

export interface AcLapInfo {
  carIdentifierNumber: number;
  lap: number;
  driverName: string;
  carName: string;
  timeMs: number;
}

// Fixed-width UTF-16LE fields are null-padded to their declared byte length
// rather than length-prefixed — decode the whole span, then cut at the
// first \0 the way every other AC telemetry client does.
function readFixedUtf16(buf: Buffer, offset: number, byteLength: number): string {
  const raw = buf.toString("utf16le", offset, offset + byteLength);
  const nullIdx = raw.indexOf("\u0000");
  return (nullIdx === -1 ? raw : raw.slice(0, nullIdx)).trim();
}

function parseHandshakeResponse(buf: Buffer): AcHandshakeInfo {
  return {
    carName: readFixedUtf16(buf, 0, 100),
    driverName: readFixedUtf16(buf, 100, 100),
    trackName: readFixedUtf16(buf, 208, 100),
    trackConfig: readFixedUtf16(buf, 308, 100),
  };
}

function parseCarInfo(buf: Buffer): AcCarInfo {
  return {
    speedKmh: buf.readFloatLE(8),
    gas: buf.readFloatLE(56),
    brake: buf.readFloatLE(60),
    engineRpm: buf.readFloatLE(68),
    steer: buf.readFloatLE(72),
    gear: buf.readInt32LE(76),
    lapTimeMs: buf.readInt32LE(40),
    lastLapMs: buf.readInt32LE(44),
    bestLapMs: buf.readInt32LE(48),
    lapCount: buf.readInt32LE(52),
    isInPit: buf.readInt8(24) !== 0,
  };
}

function parseLapInfo(buf: Buffer): AcLapInfo {
  return {
    carIdentifierNumber: buf.readInt32LE(0),
    lap: buf.readInt32LE(4),
    driverName: readFixedUtf16(buf, 8, 100),
    carName: readFixedUtf16(buf, 108, 100),
    timeMs: buf.readInt32LE(208),
  };
}

// Handshake/subscribe/dismiss all share this 12-byte request shape —
// only the operation id differs.
function buildRequest(operationId: number): Buffer {
  const msg = Buffer.alloc(12);
  msg.writeInt32LE(0, 0); // identifier — unused by AC today, 0 is the reference client's default
  msg.writeInt32LE(1, 4); // version
  msg.writeInt32LE(operationId, 8);
  return msg;
}

export class AcUdpClient extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private host: string;
  private port: number;
  private _isRunning = false;
  private _handshaken = false;
  private _lastPacketAt = 0;
  private handshakeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(host = "127.0.0.1", port = AC_DEFAULT_PORT) {
    super();
    this.host = host;
    this.port = port;
  }

  get isRunning(): boolean { return this._isRunning; }
  get lastPacketAt(): number { return this._lastPacketAt; }

  isReceiving(windowMs = 5000): boolean {
    return this._isRunning && Date.now() - this._lastPacketAt < windowMs;
  }

  start(): void {
    if (this._isRunning) return;
    const socket = dgram.createSocket("udp4");

    socket.on("error", (err) => {
      this.emit("error", err);
    });

    socket.on("message", (msg) => {
      this._lastPacketAt = Date.now();
      this.handleMessage(msg);
    });

    socket.bind(() => {
      this.socket = socket;
      this._isRunning = true;
      this.sendHandshake();
      // AC forgets our subscription if the game (or just the track) is
      // restarted — re-handshaking on an interval, not just once, is what
      // lets the client silently reconnect afterward. Harmless to repeat
      // while already connected: AC just answers again.
      this.handshakeTimer = setInterval(() => this.sendHandshake(), 4000);
    });
  }

  async stop(): Promise<void> {
    if (this.handshakeTimer) {
      clearInterval(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this._handshaken) {
      this.send(buildRequest(OP_DISMISS));
    }
    this._handshaken = false;
    this._isRunning = false;
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
    });
  }

  private send(msg: Buffer): void {
    this.socket?.send(msg, this.port, this.host);
  }

  private sendHandshake(): void {
    this.send(buildRequest(OP_HANDSHAKE));
  }

  private handleMessage(buf: Buffer): void {
    switch (buf.length) {
      case HANDSHAKE_RESPONSE_SIZE: {
        const info = parseHandshakeResponse(buf);
        // Empty carName/trackName means AC answered but nothing is actually
        // loaded (main menu) — not a real session, don't subscribe on it.
        if (!info.carName || !info.trackName) return;
        if (!this._handshaken) {
          this._handshaken = true;
          this.send(buildRequest(OP_SUBSCRIBE_UPDATE));
          this.send(buildRequest(OP_SUBSCRIBE_SPOT));
        }
        this.emit("handshake", info);
        break;
      }
      case RT_CAR_INFO_SIZE:
        this.emit("carInfo", parseCarInfo(buf));
        break;
      case RT_LAP_SIZE:
        this.emit("lap", parseLapInfo(buf));
        break;
      default:
      // Unrecognized size — a future AC protocol revision or unrelated UDP
      // traffic on the same port. Nothing safe to do but ignore it.
    }
  }
}
