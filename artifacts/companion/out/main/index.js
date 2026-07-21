"use strict";
const electron = require("electron");
const path = require("path");
const os = require("os");
const Store = require("electron-store");
const events = require("events");
const f1TelemetryClient = require("f1-telemetry-client");
const fs = require("fs");
const defaults = {
  apiKey: "",
  apiBaseUrl: "https://f1simhub.com/api",
  port: 20777,
  launchAtStartup: false,
  minimizeToTray: false,
  wizardComplete: false
};
const store = new Store({ defaults });
const { PACKETS } = f1TelemetryClient.constants;
class UdpListener extends events.EventEmitter {
  client = null;
  port;
  _isRunning = false;
  _lastPacketAt = 0;
  constructor(port = 20777) {
    super();
    this.port = port;
  }
  get isRunning() {
    return this._isRunning;
  }
  get lastPacketAt() {
    return this._lastPacketAt;
  }
  async start(port) {
    if (this._isRunning) await this.stop();
    if (port !== void 0) this.port = port;
    try {
      this.client = new f1TelemetryClient.F1TelemetryClient({ port: this.port, forwardAddresses: [] });
      this.client.on(PACKETS.session, (data) => {
        this._lastPacketAt = Date.now();
        this.emit("session", data);
      });
      this.client.on(PACKETS.lapData, (data) => {
        this._lastPacketAt = Date.now();
        this.emit("lapData", data);
      });
      this.client.on(PACKETS.carStatus, (data) => {
        this._lastPacketAt = Date.now();
        this.emit("carStatus", data);
      });
      this.client.on(PACKETS.participants, (data) => {
        this._lastPacketAt = Date.now();
        this.emit("participants", data);
      });
      this.client.on(PACKETS.finalClassification, (data) => {
        this._lastPacketAt = Date.now();
        this.emit("finalClassification", data);
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
  async stop() {
    if (this.client) {
      try {
        this.client.stop();
      } catch {
      }
      this.client = null;
    }
    this._isRunning = false;
    this.emit("stopped");
  }
  /** True if a packet arrived within the last `windowMs` milliseconds. */
  isReceiving(windowMs = 5e3) {
    return this._isRunning && Date.now() - this._lastPacketAt < windowMs;
  }
}
const TRACK_NAMES = {
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
  32: "Lusail"
};
const SESSION_TYPES = {
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
  13: "Time Trial"
};
const WEATHER_NAMES = {
  0: "Clear",
  1: "Light Cloud",
  2: "Overcast",
  3: "Light Rain",
  4: "Heavy Rain",
  5: "Storm"
};
const TYRE_NAMES = {
  16: "Soft",
  17: "Medium",
  18: "Hard",
  7: "Inter",
  8: "Wet",
  9: "Dry",
  10: "Wet",
  11: "SC"
};
const TEAM_NAMES = {
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
  253: "My Team"
};
function msToLapTime(ms) {
  if (!ms || ms <= 0) return "";
  const totalSecs = ms / 1e3;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}
class SessionTracker {
  sessionUID = null;
  sessionType = 0;
  trackId = -1;
  weather = 0;
  playerCarIdx = 255;
  teamId = 253;
  currentLapNum = 0;
  pendingLap = null;
  validLaps = [];
  lastTyreCompound = 0;
  lastFuelRemaining = 0;
  lastPacketTime = 0;
  lastAiDifficulty = 0;
  lastPosition = 0;
  lastTractionControl = 0;
  lastAntiLockBrakes = 0;
  // Callbacks
  onSessionComplete = null;
  onLapComplete = null;
  onStatusChange = null;
  get isActive() {
    return this.sessionUID !== null;
  }
  get currentLapCount() {
    return this.validLaps.length;
  }
  get trackName() {
    return TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`;
  }
  get timeSinceLastPacket() {
    return this.lastPacketTime > 0 ? Date.now() - this.lastPacketTime : Infinity;
  }
  handleSessionPacket(data) {
    this.lastPacketTime = Date.now();
    const uid = String(data.m_sessionUID ?? "0");
    const sessionType = data.m_sessionType ?? 0;
    const trackId = data.m_trackId ?? -1;
    const weather = data.m_weather ?? 0;
    const aiDifficulty = data.m_aiDifficulty ?? 0;
    if (aiDifficulty > 0) this.lastAiDifficulty = aiDifficulty;
    const isMenuState = sessionType === 0 || uid === "0";
    if (uid !== this.sessionUID) {
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
        this.sessionUID = null;
        this.validLaps = [];
        this.pendingLap = null;
        this.currentLapNum = 0;
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
      }
      this.onStatusChange?.();
    } else if (this.sessionUID !== null && sessionType !== this.sessionType && this.sessionType !== 0 && sessionType !== 0) {
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
  handleParticipantsPacket(data) {
    this.lastPacketTime = Date.now();
    if (data.m_playerCarIndex !== void 0) {
      this.playerCarIdx = data.m_playerCarIndex;
    }
    if (data.m_participants && this.playerCarIdx < data.m_participants.length) {
      this.teamId = data.m_participants[this.playerCarIdx]?.m_teamId ?? 253;
    }
  }
  handleLapPacket(data) {
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
      if (this.pendingLap && this.pendingLap.lapNum > 0 && lastLapMs > 0) {
        if (!this.pendingLap.invalid) {
          const s1 = msToLapTime(this.pendingLap.s1Ms);
          const s2 = msToLapTime(this.pendingLap.s2Ms);
          const s3 = msToLapTime(Math.max(0, lastLapMs - this.pendingLap.s1Ms - this.pendingLap.s2Ms));
          const record = {
            lap: this.pendingLap.lapNum,
            time: msToLapTime(lastLapMs),
            s1,
            s2,
            s3,
            tires: TYRE_NAMES[this.lastTyreCompound] ?? "Unknown",
            penalty: penalties > 0 ? `${penalties}s` : ""
          };
          this.validLaps.push(record);
          this.onLapComplete?.(record);
          this.onStatusChange?.();
        }
      }
      this.pendingLap = { lapNum, lapStartTimeMs: Date.now(), s1Ms, s2Ms, invalid };
      this.currentLapNum = lapNum;
    } else {
      if (s1Ms > 0) this.pendingLap.s1Ms = s1Ms;
      if (s2Ms > 0) this.pendingLap.s2Ms = s2Ms;
      if (invalid) this.pendingLap.invalid = true;
    }
  }
  handleCarStatusPacket(data) {
    this.lastPacketTime = Date.now();
    if (!data.m_carStatusData) return;
    const playerIdx = this.playerCarIdx < data.m_carStatusData.length ? this.playerCarIdx : 0;
    const car = data.m_carStatusData[playerIdx];
    if (!car) return;
    const compound = car.m_visualTyreCompound ?? car.m_tyreVisualCompound ?? 0;
    if (compound > 0) this.lastTyreCompound = compound;
    const fuel = car.m_fuelRemainingLaps ?? 0;
    if (fuel > 0) this.lastFuelRemaining = fuel;
    if (car.m_tractionControl !== void 0) this.lastTractionControl = car.m_tractionControl;
    if (car.m_antiLockBrakes !== void 0) this.lastAntiLockBrakes = car.m_antiLockBrakes;
  }
  handleFinalClassificationPacket(data) {
    this.lastPacketTime = Date.now();
    if (!data.m_classificationData) return;
    const playerIdx = this.playerCarIdx < data.m_classificationData.length ? this.playerCarIdx : 0;
    const classification = data.m_classificationData[playerIdx];
    if (!classification) return;
    const resultStatus = classification.m_resultStatus ?? 0;
    if (resultStatus >= 2 && classification.m_position !== void 0 && classification.m_position > 0) {
      this.lastPosition = classification.m_position;
    }
  }
  // Called when the app detects the game disconnected or a force-upload is needed
  forceFlush() {
    if (this.sessionUID && this.validLaps.length > 0) {
      this.flushSession();
    }
  }
  buildAssistsString() {
    const tc = ["Off", "Medium", "Full"][this.lastTractionControl] ?? "Off";
    const abs = this.lastAntiLockBrakes ? "On" : "Off";
    return `TC: ${tc}, ABS: ${abs}`;
  }
  flushSession() {
    const snap = {
      sessionUID: this.sessionUID,
      sessionType: SESSION_TYPES[this.sessionType] ?? "Unknown",
      track: TRACK_NAMES[this.trackId] ?? `Track ${this.trackId}`,
      car: TEAM_NAMES[this.teamId] ?? "My Team",
      weather: WEATHER_NAMES[this.weather] ?? "Clear",
      laps: [...this.validLaps],
      fuelRemaining: this.lastFuelRemaining,
      aiDifficulty: this.lastAiDifficulty,
      position: this.lastPosition,
      assists: this.buildAssistsString(),
      gameVersion: "F1 25"
    };
    this.sessionUID = null;
    this.validLaps = [];
    this.pendingLap = null;
    this.lastPosition = 0;
    this.onSessionComplete?.(snap);
  }
}
function pendingPath() {
  return path.join(electron.app.getPath("userData"), "pending-uploads.json");
}
function loadPending() {
  const p = pendingPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}
function savePending(items) {
  try {
    fs.writeFileSync(pendingPath(), JSON.stringify(items, null, 2), "utf-8");
  } catch {
  }
}
function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function bestLapTime(laps) {
  if (laps.length === 0) return "";
  const toSecs = (t) => {
    if (!t || !t.includes(":")) return Infinity;
    const [m, s] = t.split(":");
    return parseFloat(m) * 60 + parseFloat(s);
  };
  let best = laps[0].time;
  for (const l of laps) {
    if (toSecs(l.time) < toSecs(best)) best = l.time;
  }
  return best;
}
class Uploader {
  pending = [];
  apiKey = "";
  apiBaseUrl = "https://f1simhub.com/api";
  retryTimer = null;
  onUploadResult = null;
  constructor() {
    this.pending = loadPending();
  }
  setCredentials(apiKey, apiBaseUrl) {
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
  }
  sessionToPayload(session) {
    return {
      sessionType: session.sessionType,
      track: session.track,
      car: session.car,
      weather: session.weather,
      assists: session.assists,
      gameVersion: session.gameVersion,
      platform: "PC",
      fuelRemaining: session.fuelRemaining,
      laps: session.laps,
      aiDifficulty: session.aiDifficulty > 0 ? session.aiDifficulty : void 0,
      position: session.position > 0 ? String(session.position) : void 0
    };
  }
  async uploadSession(session) {
    const payload = this.sessionToPayload(session);
    await this.uploadPayload(payload);
  }
  async uploadPayload(payload) {
    if (!this.apiKey) {
      this.queuePending(payload);
      return;
    }
    try {
      const resp = await fetch(`${this.apiBaseUrl}/companion/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15e3)
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const best = bestLapTime(payload.laps);
      this.onUploadResult?.({
        ok: true,
        track: payload.track,
        lapTime: best,
        at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.onUploadResult?.({
        ok: false,
        track: payload.track,
        lapTime: "",
        at: (/* @__PURE__ */ new Date()).toISOString(),
        error: errMsg
      });
      this.queuePending(payload);
    }
  }
  queuePending(payload) {
    const item = {
      id: randomId(),
      payload,
      attemptCount: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.pending.push(item);
    savePending(this.pending);
  }
  async flushPending() {
    if (!this.apiKey || this.pending.length === 0) return;
    const toRetry = [...this.pending];
    this.pending = [];
    savePending(this.pending);
    for (const item of toRetry) {
      await this.uploadPayload(item.payload);
    }
  }
  startRetryLoop(intervalMs = 6e4) {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      this.flushPending().catch(() => {
      });
    }, intervalMs);
  }
  stopRetryLoop() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
  get pendingCount() {
    return this.pending.length;
  }
}
const udp = new UdpListener(store.get("port", 20777));
const tracker = new SessionTracker();
const uploader = new Uploader();
let mainWindow = null;
let tray = null;
let lastUpload = null;
let gameConnected = false;
let telemetryReceiving = false;
let gameCheckInterval = null;
function pushStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("status-update", buildStatus());
}
function buildStatus() {
  return {
    signedIn: !!store.get("apiKey"),
    gameConnected,
    telemetryReceiving,
    lastUpload,
    currentSession: tracker.isActive ? { lapCount: tracker.currentLapCount, track: tracker.trackName } : null,
    pendingUploads: uploader.pendingCount
  };
}
function wireUdp() {
  udp.on("session", (data) => {
    tracker.handleSessionPacket(data);
  });
  udp.on("lapData", (data) => {
    tracker.handleLapPacket(data);
  });
  udp.on("carStatus", (data) => {
    tracker.handleCarStatusPacket(data);
  });
  udp.on("participants", (data) => {
    tracker.handleParticipantsPacket(data);
  });
  udp.on("finalClassification", (data) => {
    tracker.handleFinalClassificationPacket(data);
  });
  udp.on("error", (err) => {
    console.error("[UDP] error:", err);
  });
}
tracker.onSessionComplete = async (session) => {
  console.log(`[Session] Complete: ${session.track} — ${session.laps.length} laps`);
  try {
    await uploader.uploadSession(session);
  } catch (err) {
    console.error("[Upload] failed:", err);
  }
};
tracker.onLapComplete = (lap) => {
  console.log(`[Lap] #${lap.lap} ${lap.time}`);
  pushStatus();
};
tracker.onStatusChange = () => {
  pushStatus();
};
uploader.onUploadResult = (result) => {
  if (result.ok) {
    lastUpload = { track: result.track, lapTime: result.lapTime, at: result.at };
    tray?.setToolTip(`F1SimHub — Last: ${result.track} ${result.lapTime}`);
  }
  pushStatus();
};
function startGameWatchdog() {
  gameCheckInterval = setInterval(() => {
    const receiving = udp.isReceiving(5e3);
    const wasConnected = gameConnected;
    const wasReceiving = telemetryReceiving;
    gameConnected = receiving;
    telemetryReceiving = receiving;
    if (receiving && !wasConnected) {
      console.log("[Watchdog] Game connected");
    }
    if (!receiving && wasConnected) {
      console.log("[Watchdog] Game disconnected — flushing session");
      tracker.forceFlush();
    }
    if (gameConnected !== wasConnected || telemetryReceiving !== wasReceiving) {
      pushStatus();
    }
  }, 3e3);
}
electron.ipcMain.handle("get-version", () => electron.app.getVersion());
electron.ipcMain.handle("get-status", () => buildStatus());
electron.ipcMain.handle("get-settings", () => ({
  apiKey: store.get("apiKey"),
  apiBaseUrl: store.get("apiBaseUrl"),
  port: store.get("port"),
  launchAtStartup: store.get("launchAtStartup"),
  minimizeToTray: store.get("minimizeToTray"),
  wizardComplete: store.get("wizardComplete")
}));
electron.ipcMain.handle("set-settings", async (_event, partial) => {
  if (partial.apiKey !== void 0) store.set("apiKey", partial.apiKey);
  if (partial.apiBaseUrl !== void 0) store.set("apiBaseUrl", partial.apiBaseUrl);
  if (partial.port !== void 0) {
    const newPort = Number(partial.port);
    store.set("port", newPort);
    await udp.stop();
    await udp.start(newPort);
  }
  if (partial.launchAtStartup !== void 0) {
    const enabled = Boolean(partial.launchAtStartup);
    store.set("launchAtStartup", enabled);
    electron.app.setLoginItemSettings({ openAtLogin: enabled });
  }
  if (partial.minimizeToTray !== void 0) {
    store.set("minimizeToTray", Boolean(partial.minimizeToTray));
  }
  if (partial.wizardComplete !== void 0) {
    store.set("wizardComplete", Boolean(partial.wizardComplete));
  }
  uploader.setCredentials(store.get("apiKey"), store.get("apiBaseUrl"));
  pushStatus();
});
electron.ipcMain.handle("verify-api-key", async (_event, key) => {
  try {
    const resp = await fetch(`${store.get("apiBaseUrl")}/companion/verify`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8e3)
    });
    return resp.ok;
  } catch {
    return false;
  }
});
electron.ipcMain.handle("get-local-ips", () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips.length > 0 ? ips : ["127.0.0.1"];
});
electron.ipcMain.handle("open-f1simhub", () => {
  electron.shell.openExternal("https://f1simhub.com");
});
electron.ipcMain.handle("open-log-file", () => {
  electron.shell.openPath(getLogFilePath());
});
electron.ipcMain.handle("open-releases-page", () => {
  electron.shell.openExternal("https://github.com/f1simhub/companion/releases/latest");
});
function getLogFilePath() {
  try {
    return path.join(electron.app.getPath("logs"), "companion.log");
  } catch {
    return path.join(os.tmpdir(), "companion.log");
  }
}
electron.ipcMain.handle("force-flush", async () => {
  tracker.forceFlush();
  await uploader.flushPending();
  pushStatus();
});
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: "F1SimHub Companion",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.on("close", (e) => {
    if (store.get("minimizeToTray") && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
function createTrayIcon() {
  const size = 16;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.abs(x - 7.5);
      const cy = Math.abs(y - 7.5);
      const inCircle = Math.sqrt(cx * cx + cy * cy) <= 7;
      rgba[i + 0] = 0;
      rgba[i + 1] = 212;
      rgba[i + 2] = 177;
      rgba[i + 3] = inCircle ? 255 : 0;
    }
  }
  return electron.nativeImage.createFromBuffer(rgba, { width: size, height: size });
}
function createTray() {
  const icon = createTrayIcon();
  const t = new electron.Tray(icon);
  t.setToolTip("F1SimHub Companion");
  const updateMenu = () => {
    const lastUploadLabel = lastUpload ? `Last: ${lastUpload.track} — ${lastUpload.lapTime}` : "No uploads yet";
    t.setContextMenu(
      electron.Menu.buildFromTemplate([
        { label: "Open F1SimHub Companion", click: () => mainWindow?.show() },
        { label: lastUploadLabel, enabled: false },
        { type: "separator" },
        { label: "Quit", click: () => electron.app.quit() }
      ])
    );
  };
  t.on("double-click", () => mainWindow?.show());
  updateMenu();
  const originalOnResult = uploader.onUploadResult;
  uploader.onUploadResult = (result) => {
    originalOnResult?.(result);
    updateMenu();
  };
  return t;
}
electron.app.whenReady().then(async () => {
  mainWindow = createWindow();
  tray = createTray();
  wireUdp();
  try {
    await udp.start(store.get("port", 20777));
    console.log(`[UDP] Listening on port ${store.get("port", 20777)}`);
  } catch (err) {
    console.error("[UDP] Failed to start:", err);
  }
  uploader.setCredentials(store.get("apiKey"), store.get("apiBaseUrl"));
  uploader.flushPending().catch(() => {
  });
  uploader.startRetryLoop(6e4);
  startGameWatchdog();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", async () => {
  if (gameCheckInterval) clearInterval(gameCheckInterval);
  uploader.stopRetryLoop();
  tracker.forceFlush();
  await udp.stop();
});
