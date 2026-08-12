import { EventEmitter } from "events";
import * as dgram from "dgram";

// Assetto Corsa Competizione's "Broadcasting SDK" UDP protocol — a
// completely different protocol from base AC's Remote Telemetry (ac-udp.ts):
// TLV-ish, variable-length messages tagged by a leading command byte,
// instead of fixed-size structs identified by packet length. It must be
// enabled and given a port in Documents/Assetto Corsa Competizione/Config/
// broadcasting.json (updListenerPort, default 9000). If that file sets a
// non-empty connectionPassword, this client has no UI to configure one and
// registration will be rejected — same class of limitation as F1/AC needing
// telemetry enabled in-game first.
// Reference: Kunos's own BroadcastingNetworkProtocol.cs, published in the
// ACC SDK folder (steamapps/common/Assetto Corsa Competizione/sdk).
const ACC_DEFAULT_PORT = 9000;
const PROTOCOL_VERSION = 2;

const OUT_REGISTER = 1;
const OUT_UNREGISTER = 9;
const OUT_REQUEST_ENTRY_LIST = 10;
const OUT_REQUEST_TRACK_DATA = 11;

const IN_REGISTRATION_RESULT = 1;
const IN_REALTIME_UPDATE = 2;
const IN_REALTIME_CAR_UPDATE = 3;
const IN_ENTRY_LIST = 4;
const IN_TRACK_DATA = 5;
const IN_ENTRY_LIST_CAR = 6;

export const RACE_SESSION_TYPE: Record<number, string> = {
  0: "Practice",
  4: "Qualifying",
  9: "Superpole",
  10: "Race",
  11: "Hotlap",
  12: "Hotstint",
  13: "Hotlap Superpole",
  14: "Replay",
};

export interface AccRegistrationResult {
  connectionId: number;
  success: boolean;
  readOnly: boolean;
  error: string;
}

export interface AccTrackData {
  trackName: string;
  trackMeters: number;
}

export interface AccCarEntry {
  carIndex: number;
  teamCarName: string;
  displayName: string;
}

export interface AccRealtimeUpdate {
  sessionType: number;
  phase: number;
  focusedCarIndex: number;
}

export interface AccLap {
  laptimeMs: number | null;
  splitsMs: (number | null)[];
  isInvalid: boolean;
  isValidForBest: boolean;
}

export interface AccCarUpdate {
  carIndex: number;
  laps: number;
  lastLap: AccLap;
}

// Sequential little-endian reader mirroring .NET's BinaryReader, which is
// what the official protocol is written against (fixed-width ints/floats,
// and strings as a uint16 byte-length prefix + UTF-8 bytes — not
// null-terminated like base AC's fields).
class Cursor {
  private offset = 0;
  constructor(private buf: Buffer) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  byte(): number {
    return this.buf.readUInt8(this.offset++);
  }

  uint16(): number {
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  int32(): number {
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  float(): number {
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }

  string(): string {
    const len = this.uint16();
    const s = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }

  skip(n: number): void {
    this.offset += n;
  }
}

function readLap(c: Cursor): AccLap {
  const rawLapMs = c.int32();
  c.uint16(); // carIndex — redundant with the enclosing message's own carIndex
  c.uint16(); // driverIndex — unused; we don't track per-driver splits
  const splitCount = c.byte();
  const splits: (number | null)[] = [];
  for (let i = 0; i < splitCount; i++) {
    const v = c.int32();
    splits.push(v === 0x7fffffff ? null : v);
  }
  const isInvalid = c.byte() > 0;
  const isValidForBest = c.byte() > 0;
  c.byte(); // isOutlap
  c.byte(); // isInlap
  return {
    laptimeMs: rawLapMs === 0x7fffffff ? null : rawLapMs,
    splitsMs: splits,
    isInvalid,
    isValidForBest,
  };
}

class Writer {
  private chunks: Buffer[] = [];

  byte(v: number): this {
    this.chunks.push(Buffer.from([v & 0xff]));
    return this;
  }

  int32(v: number): this {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v, 0);
    this.chunks.push(b);
    return this;
  }

  string(s: string): this {
    const bytes = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2);
    len.writeUInt16LE(bytes.length, 0);
    this.chunks.push(len, bytes);
    return this;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export class AccUdpClient extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private host: string;
  private port: number;
  private displayName: string;
  private _isRunning = false;
  private _registered = false;
  private connectionId = 0;
  private _lastPacketAt = 0;
  private registerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(host = "127.0.0.1", port = ACC_DEFAULT_PORT, displayName = "Sim Racing Hub Companion") {
    super();
    this.host = host;
    this.port = port;
    this.displayName = displayName;
  }

  get isRunning(): boolean { return this._isRunning; }
  get lastPacketAt(): number { return this._lastPacketAt; }

  isReceiving(windowMs = 5000): boolean {
    return this._isRunning && Date.now() - this._lastPacketAt < windowMs;
  }

  start(): void {
    if (this._isRunning) return;
    const socket = dgram.createSocket("udp4");

    socket.on("error", (err) => this.emit("error", err));
    socket.on("message", (msg) => {
      this._lastPacketAt = Date.now();
      try {
        this.handleMessage(new Cursor(msg));
      } catch {
        // A truncated/malformed packet shouldn't take the whole listener
        // down — drop it and wait for the next one.
      }
    });

    socket.bind(() => {
      this.socket = socket;
      this._isRunning = true;
      this.register();
      // Re-send registration on an interval so a game restart (which drops
      // ACC's server-side connection state) gets silently reconnected, same
      // reasoning as ac-udp.ts's handshake retry — but unlike AC's handshake
      // (idempotent, same connection), ACC's Broadcasting SDK hands back a
      // brand-new connectionId on every OUT_REGISTER and never tells us to
      // drop the old one, so blindly resending on every tick orphans a fresh
      // connection on ACC's side every 5s. Only resend while we don't
      // already have a live registration.
      this.registerTimer = setInterval(() => {
        const stale = Date.now() - this._lastPacketAt > 10000;
        if (!this._registered || stale) this.register();
      }, 5000);
    });
  }

  async stop(): Promise<void> {
    if (this.registerTimer) {
      clearInterval(this.registerTimer);
      this.registerTimer = null;
    }
    if (this._registered) {
      this.send(new Writer().byte(OUT_UNREGISTER).int32(this.connectionId).toBuffer());
    }
    this._registered = false;
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

  private send(buf: Buffer): void {
    this.socket?.send(buf, this.port, this.host);
  }

  private register(): void {
    // 250ms realtime update interval — frequent enough for a responsive
    // "car connected" status without flooding the loopback socket.
    const req = new Writer()
      .byte(OUT_REGISTER)
      .byte(PROTOCOL_VERSION)
      .string(this.displayName)
      .string("") // connectionPassword — see file header comment
      .int32(250)
      .string(""); // commandPassword — unused, this client is read-only
    this.send(req.toBuffer());
  }

  private requestEntryList(): void {
    this.send(new Writer().byte(OUT_REQUEST_ENTRY_LIST).int32(this.connectionId).toBuffer());
  }

  private requestTrackData(): void {
    this.send(new Writer().byte(OUT_REQUEST_TRACK_DATA).int32(this.connectionId).toBuffer());
  }

  private handleMessage(c: Cursor): void {
    const type = c.byte();
    switch (type) {
      case IN_REGISTRATION_RESULT: {
        this.connectionId = c.int32();
        const success = c.byte() > 0;
        // Wire semantics per Kunos's own client: this byte is 0 when the
        // connection is read-only, non-zero when it has write access — the
        // inverse of what the field name suggests at a glance.
        const readOnly = c.byte() === 0;
        const error = c.string();
        this._registered = success;
        if (success) {
          this.requestEntryList();
          this.requestTrackData();
        }
        this.emit("registered", { connectionId: this.connectionId, success, readOnly, error } as AccRegistrationResult);
        break;
      }
      case IN_ENTRY_LIST: {
        // Just index/driver-index lists — the actual car details arrive
        // per-car in separate ENTRY_LIST_CAR messages, nothing to emit yet.
        break;
      }
      case IN_ENTRY_LIST_CAR: {
        const carIndex = c.uint16();
        c.byte(); // carModelType — no reliable public id->name table, see ac-session.ts
        c.string(); // teamName
        c.int32(); // raceNumber
        const teamCarName = c.string();
        const displayName = c.string();
        c.byte(); // cupCategory
        const driverCount = c.byte();
        for (let i = 0; i < driverCount; i++) {
          c.uint16(); // driverIndex
          const hasInfo = c.byte() > 0;
          if (hasInfo) {
            c.string(); // firstName
            c.string(); // lastName
            c.string(); // nickname
            c.string(); // shortName
            c.byte(); // category
          }
        }
        this.emit("carEntry", { carIndex, teamCarName, displayName } as AccCarEntry);
        break;
      }
      case IN_REALTIME_UPDATE: {
        c.uint16(); // eventIndex
        c.uint16(); // sessionIndex
        const sessionType = c.byte();
        const phase = c.byte();
        c.float(); // sessionTimeMs
        c.float(); // sessionEndTimeMs
        const focusedCarIndex = c.int32();
        c.string(); // activeCameraSet
        c.string(); // activeCamera
        c.string(); // currentHudPage
        const isReplayPlaying = c.byte() > 0;
        if (isReplayPlaying) {
          c.float(); // replaySessionTime
          c.float(); // replayRemainingTime
          c.int32(); // replayFocusedCar
        }
        c.uint16(); // timeOfDay
        c.byte(); // ambientTemp
        c.byte(); // trackTemp
        c.byte(); // clouds
        c.byte(); // rainLevel
        c.byte(); // wetness
        if (c.remaining > 0) readLap(c); // bestSessionLap — not currently surfaced
        this.emit("realtimeUpdate", { sessionType, phase, focusedCarIndex } as AccRealtimeUpdate);
        break;
      }
      case IN_REALTIME_CAR_UPDATE: {
        const carIndex = c.uint16();
        c.uint16(); // driverIndex
        c.byte(); // gear
        c.float(); // worldPosX
        c.float(); // worldPosY
        c.float(); // yaw
        c.byte(); // carLocation
        c.uint16(); // kmh
        c.uint16(); // position
        c.uint16(); // cupPosition
        c.uint16(); // trackPosition
        c.float(); // splinePosition
        const laps = c.uint16();
        c.int32(); // delta
        readLap(c); // bestSessionLap
        const lastLap = readLap(c);
        readLap(c); // currentLap (in progress, not useful until it finishes)
        this.emit("carUpdate", { carIndex, laps, lastLap } as AccCarUpdate);
        break;
      }
      case IN_TRACK_DATA: {
        c.int32(); // connectionId
        const trackName = c.string();
        c.int32(); // trackId
        const trackMeters = c.int32();
        const camSetCount = c.byte();
        for (let i = 0; i < camSetCount; i++) {
          c.string(); // camSetName
          const camCount = c.byte();
          for (let j = 0; j < camCount; j++) c.string(); // cameraName
        }
        const hudCount = c.byte();
        for (let i = 0; i < hudCount; i++) c.string();
        this.emit("trackData", { trackName, trackMeters } as AccTrackData);
        break;
      }
      default:
      // Unknown message type — a protocol revision we haven't seen. Drop it.
    }
  }
}

export function sessionTypeName(type: number): string {
  return RACE_SESSION_TYPE[type] ?? `Session ${type}`;
}
