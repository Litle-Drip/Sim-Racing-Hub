import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  nativeImage,
} from "electron";
import { join } from "path";
import { networkInterfaces, tmpdir } from "os";
import { store } from "./store";
import { UdpListener } from "./udp";
import { SessionTracker } from "./session";
import { Uploader, type UploadResult } from "./uploader";

const udp = new UdpListener(store.get("port", 20777));
const tracker = new SessionTracker();
const uploader = new Uploader();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

interface LastUpload {
  track: string;
  lapTime: string;
  at: string;
}
let lastUpload: LastUpload | null = null;
let gameConnected = false;
let telemetryReceiving = false;
let gameCheckInterval: ReturnType<typeof setInterval> | null = null;

function pushStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("status-update", buildStatus());
}

function buildStatus() {
  return {
    signedIn: !!store.get("apiKey"),
    gameConnected,
    telemetryReceiving,
    lastUpload,
    currentSession: tracker.isActive
      ? { lapCount: tracker.currentLapCount, track: tracker.trackName }
      : null,
    pendingUploads: uploader.pendingCount,
  };
}

function wireUdp(): void {
  udp.on("session", (data) => {
    tracker.handleSessionPacket(data as Parameters<typeof tracker.handleSessionPacket>[0]);
  });
  udp.on("lapData", (data) => {
    tracker.handleLapPacket(data as Parameters<typeof tracker.handleLapPacket>[0]);
  });
  udp.on("carStatus", (data) => {
    tracker.handleCarStatusPacket(data as Parameters<typeof tracker.handleCarStatusPacket>[0]);
  });
  udp.on("carTelemetry", (data) => {
    tracker.handleCarTelemetryPacket(data as Parameters<typeof tracker.handleCarTelemetryPacket>[0]);
  });
  udp.on("carSetup", (data) => {
    tracker.handleCarSetupPacket(data as Parameters<typeof tracker.handleCarSetupPacket>[0]);
  });
  udp.on("carDamage", (data) => {
    tracker.handleCarDamagePacket(data as Parameters<typeof tracker.handleCarDamagePacket>[0]);
  });
  udp.on("sessionHistory", (data) => {
    tracker.handleSessionHistoryPacket(data as Parameters<typeof tracker.handleSessionHistoryPacket>[0]);
  });
  udp.on("participants", (data) => {
    tracker.handleParticipantsPacket(data as Parameters<typeof tracker.handleParticipantsPacket>[0]);
  });
  udp.on("finalClassification", (data) => {
    tracker.handleFinalClassificationPacket(data as Parameters<typeof tracker.handleFinalClassificationPacket>[0]);
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

uploader.onUploadResult = (result: UploadResult) => {
  if (result.ok) {
    lastUpload = { track: result.track, lapTime: result.lapTime, at: result.at };
    tray?.setToolTip(`F1SimHub — Last: ${result.track} ${result.lapTime}`);
  }
  pushStatus();
};

function startGameWatchdog(): void {
  gameCheckInterval = setInterval(() => {
    const receiving = udp.isReceiving(5000);
    const wasConnected = gameConnected;
    const wasReceiving = telemetryReceiving;

    gameConnected = receiving;
    telemetryReceiving = receiving;

    if (receiving && !wasConnected) console.log("[Watchdog] Game connected");
    if (!receiving && wasConnected) {
      console.log("[Watchdog] Game disconnected — flushing session");
      tracker.forceFlush();
    }
    if (gameConnected !== wasConnected || telemetryReceiving !== wasReceiving) pushStatus();
  }, 3000);
}

ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("get-status", () => buildStatus());
ipcMain.handle("get-settings", () => ({
  apiKey: store.get("apiKey"),
  apiBaseUrl: store.get("apiBaseUrl"),
  port: store.get("port"),
  launchAtStartup: store.get("launchAtStartup"),
  minimizeToTray: store.get("minimizeToTray"),
  wizardComplete: store.get("wizardComplete"),
}));

ipcMain.handle("set-settings", async (_event, partial: Record<string, unknown>) => {
  if (partial.apiKey !== undefined) store.set("apiKey", partial.apiKey as string);
  if (partial.apiBaseUrl !== undefined) store.set("apiBaseUrl", partial.apiBaseUrl as string);
  if (partial.port !== undefined) {
    const newPort = Number(partial.port);
    store.set("port", newPort);
    await udp.stop();
    await udp.start(newPort);
  }
  if (partial.launchAtStartup !== undefined) {
    const enabled = Boolean(partial.launchAtStartup);
    store.set("launchAtStartup", enabled);
    app.setLoginItemSettings({ openAtLogin: enabled });
  }
  if (partial.minimizeToTray !== undefined) store.set("minimizeToTray", Boolean(partial.minimizeToTray));
  if (partial.wizardComplete !== undefined) store.set("wizardComplete", Boolean(partial.wizardComplete));

  uploader.setCredentials(store.get("apiKey"), store.get("apiBaseUrl"));
  pushStatus();
});

ipcMain.handle("verify-api-key", async (_event, key: string) => {
  try {
    const resp = await fetch(`${store.get("apiBaseUrl")}/companion/verify`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    return resp.ok;
  } catch {
    return false;
  }
});

ipcMain.handle("get-local-ips", () => {
  const ifaces = networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips.length > 0 ? ips : ["127.0.0.1"];
});

ipcMain.handle("open-f1simhub", () => shell.openExternal("https://f1simhub.com"));
ipcMain.handle("open-log-file", () => shell.openPath(getLogFilePath()));
ipcMain.handle("open-releases-page", () => shell.openExternal("https://github.com/f1simhub/companion/releases/latest"));

function getLogFilePath(): string {
  try {
    return join(app.getPath("logs"), "companion.log");
  } catch {
    return join(tmpdir(), "companion.log");
  }
}

ipcMain.handle("force-flush", async () => {
  tracker.forceFlush();
  await uploader.flushPending();
  pushStatus();
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: "F1SimHub Companion",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

function createTrayIcon(): Electron.NativeImage {
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
  return nativeImage.createFromBuffer(rgba, { width: size, height: size });
}

function createTray(): Tray {
  const icon = createTrayIcon();
  const t = new Tray(icon);
  t.setToolTip("F1SimHub Companion");

  const updateMenu = (): void => {
    const lastUploadLabel = lastUpload
      ? `Last: ${lastUpload.track} — ${lastUpload.lapTime}`
      : "No uploads yet";
    t.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open F1SimHub Companion", click: () => mainWindow?.show() },
        { label: lastUploadLabel, enabled: false },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
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

app.whenReady().then(async () => {
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
  uploader.flushPending().catch(() => {});
  uploader.startRetryLoop(60_000);
  startGameWatchdog();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (gameCheckInterval) clearInterval(gameCheckInterval);
  uploader.stopRetryLoop();
  tracker.forceFlush();
  await udp.stop();
});
