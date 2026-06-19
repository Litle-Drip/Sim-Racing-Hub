import { EventEmitter } from "events";
import { F1TelemetryClient, constants } from "f1-telemetry-client";

const { PACKETS } = constants;

export class UdpListener extends EventEmitter {
  private client: F1TelemetryClient | null = null;
  private port: number;
  private _isRunning = false;
  private _lastPacketAt = 0;

  constructor(port = 20777) {
    super();
    this.port = port;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get lastPacketAt(): number {
    return this._lastPacketAt;
  }

  async start(port?: number): Promise<void> {
    if (this._isRunning) await this.stop();
    if (port !== undefined) this.port = port;

    try {
      this.client = new F1TelemetryClient({ port: this.port, forwardAddresses: [] });

      this.client.on(PACKETS.session, (data: unknown) => {
        this._lastPacketAt = Date.now();
        this.emit("session", data);
      });

      this.client.on(PACKETS.lapData, (data: unknown) => {
        this._lastPacketAt = Date.now();
        this.emit("lapData", data);
      });

      this.client.on(PACKETS.carStatus, (data: unknown) => {
        this._lastPacketAt = Date.now();
        this.emit("carStatus", data);
      });

      this.client.on(PACKETS.participants, (data: unknown) => {
        this._lastPacketAt = Date.now();
        this.emit("participants", data);
      });

      this.client.start();
      this._isRunning = true;
      this.emit("started", this.port);
    } catch (err) {
      this._isRunning = false;
      this.emit("error", err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        this.client.stop();
      } catch {
        // ignore
      }
      this.client = null;
    }
    this._isRunning = false;
    this.emit("stopped");
  }

  /** True if a packet arrived within the last `windowMs` milliseconds. */
  isReceiving(windowMs = 5000): boolean {
    return this._isRunning && Date.now() - this._lastPacketAt < windowMs;
  }
}
