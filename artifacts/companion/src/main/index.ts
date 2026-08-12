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
import { mkdirSync, createWriteStream, type WriteStream } from "fs";
import { autoUpdater } from "electron-updater";
import { store } from "./store";
import { UdpListener } from "./udp";
import { SessionTracker } from "./session";
import { AcUdpClient } from "./ac-udp";
import { AcSessionTracker } from "./ac-session";
import { AccUdpClient } from "./acc-udp";
import { AccSessionTracker } from "./acc-session";
import { Uploader, type UploadResult } from "./uploader";
import { setupAcTelemetry, setupAccTelemetry } from "./game-config";

function getLogFilePath(): string {
  try {
    return join(app.getPath("logs"), "companion.log");
  } catch {
    return join(tmpdir(), "companion.log");
  }
}

// Mirror console output to a file so the "Open Log File" button in Settings
// has something to show — a packaged app has no attached terminal, so
// console.log otherwise goes nowhere the user can ever see it.
function setupFileLogging(): void {
  const logPath = getLogFilePath();
  let stream: WriteStream;
  try {
    mkdirSync(join(logPath, ".."), { recursive: true });
    stream = createWriteStream(logPath, { flags: "w" });
  } catch {
    return;
  }
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        const line = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
        stream.write(`[${new Date().toISOString()}] ${line}\n`);
      } catch {
        // best-effort — never let logging itself crash the app
      }
    };
  }
}
setupFileLogging();

const udp = new UdpListener(store.get("port", 20777));
const tracker = new SessionTracker();
// AC is a client-connects-out protocol on its own dedicated port (9996), not
// a listener like F1's — the two can run simultaneously with no conflict,
// so there's no "pick your game" setting; whichever game is actually
// running is the one that ends up producing packets.
const acUdp = new AcUdpClient();
const acTracker = new AcSessionTracker();
// ACC is a different game with its own protocol/port (9000, Broadcasting
// SDK) — not an extension of base AC's Remote Telemetry. Same reasoning as
// acUdp: a separate client-connects-out connection, no conflict with the
// others, runs unconditionally alongside them.
const accUdp = new AccUdpClient();
const accTracker = new AccSessionTracker();
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
// Set when udp.ts drops packets from a game whose UDP format it hasn't
// verified offsets for (see udp.ts SUPPORTED_FORMATS) — surfaced in status
// so the UI can say so instead of silently showing "Waiting…" forever.
let unsupportedFormat: number | null = null;
let gameCheckInterval: ReturnType<typeof setInterval> | null = null;
let updateReady = false;
let refreshTrayMenu: (() => void) | null = null;

type UpdateState =
  | { phase: "unsupported" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "not-available" }
  | { phase: "error"; message: string };

// Windows+packaged only — see setupAutoUpdater's own gating below. Reported
// as "unsupported" everywhere else so the Settings UI can say so instead of
// a "Check for Updates" button that silently does nothing.
let updateState: UpdateState =
  process.platform === "win32" ? { phase: "idle" } : { phase: "unsupported" };

function pushStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("status-update", buildStatus());
}

function buildStatus() {
  const acConnected = acUdp.isReceiving(20000);
  const accConnected = accUdp.isReceiving(20000);
  return {
    signedIn: !!store.get("apiKey"),
    gameConnected: gameConnected || acConnected || accConnected,
    telemetryReceiving: telemetryReceiving || acConnected || accConnected,
    lastUpload,
    currentSession: tracker.isActive
      ? { lapCount: tracker.currentLapCount, track: tracker.trackName }
      : acTracker.isActive
        ? { lapCount: acTracker.currentLapCount, track: acTracker.track ?? "" }
        : accTracker.isActive
          ? { lapCount: accTracker.currentLapCount, track: accTracker.track ?? "" }
          : null,
    pendingUploads: uploader.pendingCount,
    detectedGame: tracker.gameVersion ?? (acConnected ? "Assetto Corsa" : accConnected ? "Assetto Corsa Competizione" : null),
    unsupportedFormat,
    updateState,
  };
}

function wireUdp(): void {
  udp.on("session", (data) => {
    unsupportedFormat = null;
    tracker.handleSessionPacket(data as Parameters<typeof tracker.handleSessionPacket>[0]);
  });
  udp.on("unsupportedFormat", (format: number) => {
    console.warn(
      `[UDP] Unsupported game/packet format ${format} — ignoring its packets so telemetry isn't silently corrupted. Supported: F1 24, F1 25, F1 26.`
    );
    unsupportedFormat = format;
    pushStatus();
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

function wireAcUdp(): void {
  acUdp.on("handshake", (info) => {
    acTracker.handleHandshake(info as Parameters<typeof acTracker.handleHandshake>[0]);
  });
  acUdp.on("carInfo", (info) => {
    acTracker.handleCarInfo(info as Parameters<typeof acTracker.handleCarInfo>[0]);
  });
  acUdp.on("lap", (info) => {
    acTracker.handleLap(info as Parameters<typeof acTracker.handleLap>[0]);
  });
  acUdp.on("error", (err) => {
    console.error("[AC UDP] error:", err);
  });
}

function wireAccUdp(): void {
  accUdp.on("registered", (result) => {
    accTracker.handleRegistration(result as Parameters<typeof accTracker.handleRegistration>[0]);
  });
  accUdp.on("trackData", (data) => {
    accTracker.handleTrackData(data as Parameters<typeof accTracker.handleTrackData>[0]);
  });
  accUdp.on("carEntry", (entry) => {
    accTracker.handleCarEntry(entry as Parameters<typeof accTracker.handleCarEntry>[0]);
  });
  accUdp.on("realtimeUpdate", (update) => {
    accTracker.handleRealtimeUpdate(update as Parameters<typeof accTracker.handleRealtimeUpdate>[0]);
  });
  accUdp.on("carUpdate", (update) => {
    accTracker.handleCarUpdate(update as Parameters<typeof accTracker.handleCarUpdate>[0]);
  });
  accUdp.on("error", (err) => {
    console.error("[ACC UDP] error:", err);
  });
}

async function handleSessionComplete(session: Parameters<NonNullable<typeof tracker.onSessionComplete>>[0]): Promise<void> {
  console.log(`[Session] Complete: ${session.track} — ${session.laps.length} laps`);
  try {
    await uploader.uploadSession(session);
  } catch (err) {
    console.error("[Upload] failed:", err);
  }
}

tracker.onSessionComplete = handleSessionComplete;
acTracker.onSessionComplete = handleSessionComplete;
accTracker.onSessionComplete = handleSessionComplete;

tracker.onLapComplete = (lap) => {
  console.log(`[Lap] #${lap.lap} ${lap.time}`);
  pushStatus();
};
acTracker.onLapComplete = (lap) => {
  console.log(`[AC Lap] #${lap.lap} ${lap.time}`);
  pushStatus();
};
accTracker.onLapComplete = (lap) => {
  console.log(`[ACC Lap] #${lap.lap} ${lap.time}`);
  pushStatus();
};

tracker.onStatusChange = () => {
  pushStatus();
};
acTracker.onStatusChange = () => {
  pushStatus();
};
accTracker.onStatusChange = () => {
  pushStatus();
};

uploader.onUploadResult = (result: UploadResult) => {
  if (result.ok) {
    lastUpload = { track: result.track, lapTime: result.lapTime, at: result.at };
    tray?.setToolTip(`F1SimHub — Last: ${result.track} ${result.lapTime}`);
  } else {
    // Failed uploads were previously silent — nothing in the log file
    // explained why an item stayed stuck in the pending queue, so a
    // permanent failure (bad auth, rejected payload) was indistinguishable
    // from a transient one (network blip, cold server) just waiting on
    // the next retry.
    console.error(`[Upload] Failed for ${result.track}: ${result.error}`);
  }
  pushStatus();
};

let acWasConnected = false;
let accWasConnected = false;

function startGameWatchdog(): void {
  gameCheckInterval = setInterval(() => {
    // A rewind/flashback can pause UDP telemetry output for several
    // seconds; a short gap threshold here misreads that as the game
    // disconnecting, force-flushing and fragmenting one continuous
    // session into several uploaded ones. 20s tolerates that while still
    // catching a genuine quit/crash reasonably quickly.
    const receiving = udp.isReceiving(20000);
    const wasConnected = gameConnected;
    const wasReceiving = telemetryReceiving;

    gameConnected = receiving;
    telemetryReceiving = receiving;

    if (receiving && !wasConnected) console.log("[Watchdog] Game connected");
    if (!receiving && wasConnected) {
      console.log("[Watchdog] Game disconnected — flushing session");
      void tracker.forceFlush();
    }

    const acReceiving = acUdp.isReceiving(20000);
    const acChanged = acReceiving !== acWasConnected;
    if (acReceiving && !acWasConnected) console.log("[Watchdog] AC connected");
    if (!acReceiving && acWasConnected) {
      console.log("[Watchdog] AC disconnected — flushing session");
      void acTracker.forceFlush();
    }
    acWasConnected = acReceiving;

    const accReceiving = accUdp.isReceiving(20000);
    const accChanged = accReceiving !== accWasConnected;
    if (accReceiving && !accWasConnected) console.log("[Watchdog] ACC connected");
    if (!accReceiving && accWasConnected) {
      console.log("[Watchdog] ACC disconnected — flushing session");
      void accTracker.forceFlush();
    }
    accWasConnected = accReceiving;

    if (gameConnected !== wasConnected || telemetryReceiving !== wasReceiving || acChanged || accChanged) pushStatus();
  }, 3000);
}

// Windows-only for now: Squirrel.Mac (electron-updater's macOS mechanism)
// verifies update signatures against the app's code-signing identity, and
// the Mac build is currently unsigned (see PROJECT.md) — enabling it there
// would just fail every check. Feed URL/version metadata come from
// app-update.yml, generated at build time from electron-builder.json5's
// `publish` config, so there's nothing to configure here beyond gating.
function setupAutoUpdater(): void {
  if (process.platform !== "win32" || !app.isPackaged) {
    // No installed Windows app to update (unsigned Mac build, or running
    // from source) — report it as such rather than leaving the Settings
    // "Check for Updates" button silently do nothing.
    updateState = { phase: "unsupported" };
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdate] Checking for update");
    updateState = { phase: "checking" };
    pushStatus();
  });
  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdate] Update available: ${info.version} (current: ${app.getVersion()})`);
    updateState = { phase: "downloading", version: info.version, percent: 0 };
    pushStatus();
  });
  autoUpdater.on("update-not-available", (info) => {
    console.log(`[AutoUpdate] Already up to date (current: ${app.getVersion()}, latest: ${info.version})`);
    updateState = { phase: "not-available" };
    pushStatus();
  });
  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdate] Error:", err);
    updateState = { phase: "error", message: err instanceof Error ? err.message : String(err) };
    pushStatus();
  });
  autoUpdater.on("download-progress", (p) => {
    console.log(`[AutoUpdate] Downloading: ${Math.round(p.percent)}%`);
    if (updateState.phase === "downloading") {
      updateState = { ...updateState, percent: Math.round(p.percent) };
      pushStatus();
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[AutoUpdate] Update ${info.version} downloaded — ready to install`);
    updateReady = true;
    updateState = { phase: "ready", version: info.version };
    refreshTrayMenu?.();
    pushStatus();
  });

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(err => console.error("[AutoUpdate] Check failed:", err));
  };
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-close", () => mainWindow?.close());

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
// Not /releases/latest — that endpoint specifically excludes prereleases,
// and the companion build is always published as one (see
// companion-release.yml), so it would 404. The plain releases list sorts
// newest-first regardless of prerelease status and actually finds it.
ipcMain.handle("open-releases-page", () => shell.openExternal("https://github.com/Litle-Drip/Sim-Racing-Hub/releases"));

ipcMain.handle("force-flush", async () => {
  await tracker.forceFlush();
  await acTracker.forceFlush();
  await accTracker.forceFlush();
  await uploader.flushPending();
  pushStatus();
});

ipcMain.handle("check-for-updates", async () => {
  if (updateState.phase === "unsupported") return;
  // A ready-to-install update doesn't need re-checking — clicking "check
  // for updates" again here would just re-report the same ready state.
  if (updateState.phase === "ready") {
    pushStatus();
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error("[AutoUpdate] Manual check failed:", err);
    updateState = { phase: "error", message: err instanceof Error ? err.message : String(err) };
    pushStatus();
  }
});

ipcMain.handle("install-update", () => {
  if (updateState.phase !== "ready") return;
  autoUpdater.quitAndInstall();
});

ipcMain.handle("setup-ac-telemetry", () => setupAcTelemetry());
ipcMain.handle("setup-acc-telemetry", () => setupAccTelemetry());

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    frame: false,
    title: "F1SimHub Companion",
    backgroundColor: "#080808",
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
      rgba[i + 0] = 232;
      rgba[i + 1] = 0;
      rgba[i + 2] = 45;
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
        ...(updateReady
          ? [
              { label: "Restart to Update", click: () => autoUpdater.quitAndInstall() },
              { type: "separator" as const },
            ]
          : []),
        { label: "Quit", click: () => app.quit() },
      ])
    );
  };

  t.on("double-click", () => mainWindow?.show());
  updateMenu();
  refreshTrayMenu = updateMenu;

  const originalOnResult = uploader.onUploadResult;
  uploader.onUploadResult = (result) => {
    originalOnResult?.(result);
    updateMenu();
  };

  return t;
}

// A second running instance would bind the same UDP port and independently
// upload every session the first instance already handles — quit it
// immediately rather than let it duplicate telemetry uploads.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    mainWindow = createWindow();
    tray = createTray();
    wireUdp();
    wireAcUdp();
    wireAccUdp();

    try {
      await udp.start(store.get("port", 20777));
      console.log(`[UDP] Listening on port ${store.get("port", 20777)}`);
    } catch (err) {
      console.error("[UDP] Failed to start:", err);
    }

    try {
      acUdp.start();
      console.log("[AC UDP] Client started, handshaking on port 9996");
    } catch (err) {
      console.error("[AC UDP] Failed to start:", err);
    }

    try {
      accUdp.start();
      console.log("[ACC UDP] Client started, registering on port 9000");
    } catch (err) {
      console.error("[ACC UDP] Failed to start:", err);
    }

    uploader.setCredentials(store.get("apiKey"), store.get("apiBaseUrl"));
    uploader.flushPending().catch(() => {});
    uploader.startRetryLoop(60_000);
    startGameWatchdog();
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else {
        mainWindow?.show();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Electron does not wait on async "before-quit" listeners, so without this
// guard the process could tear down mid-flush and silently drop the final
// session of a race (e.g. a user quitting right after finishing). Instead,
// defer the actual quit until the flush/upload work has settled, then quit
// again — the `quitting` flag makes the second quit() go through instead of
// re-entering this handler.
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void (async () => {
    if (gameCheckInterval) clearInterval(gameCheckInterval);
    uploader.stopRetryLoop();
    try {
      await tracker.forceFlush();
      await acTracker.forceFlush();
      await accTracker.forceFlush();
      await uploader.flushPending();
    } catch (err) {
      console.error("[Quit] Flush before quit failed:", err);
    }
    await udp.stop();
    await acUdp.stop();
    await accUdp.stop();
    app.quit();
  })();
});
