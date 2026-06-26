import { EventEmitter } from "events";
import * as dgram from "dgram";

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
      this.socket = socket;

      socket.on("error", (err) => {
        this._isRunning = false;
        this.emit("error", err);
        reject(err);
      });

      socket.on("listening", () => {
        socket.setBroadcast(true);
        this._isRunning = true;
        this.emit("started", this.port);
        resolve();
      });

      socket.on("message", (msg) => {
        this._lastPacketAt = Date.now();
        this.handlePacket(msg);
      });

      socket.bind({ port: this.port, address: "0.0.0.0", exclusive: false });
    });
  }

  private handlePacket(buf: Buffer): void {
    if (buf.length < 24) return;

    const packetFormat = buf.readUInt16LE(0);
    const packetId = buf.readUInt8(6);

    // Emit raw packet with type info so session tracker can handle it
    this.emit("rawPacket", { packetFormat, packetId, data: buf });

    // Emit named events based on packet ID (F1 2024 format)
    switch (packetId) {
      case 1: this.emit("session", { packetFormat, data: buf }); break;
      case 2: this.emit("lapData", { packetFormat, data: buf }); break;
      case 7: this.emit("carStatus", { packetFormat, data: buf }); break;
      case 4: this.emit("participants", { packetFormat, data: buf }); break;
      case 8: this.emit("finalClassification", { packetFormat, data: buf }); break;
    }
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
}
