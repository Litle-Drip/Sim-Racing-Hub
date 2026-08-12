import { contextBridge, ipcRenderer } from "electron";

export type UpdateState =
  | { phase: "unsupported" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "not-available" }
  | { phase: "error"; message: string };

export interface CompanionStatus {
  signedIn: boolean;
  gameConnected: boolean;
  telemetryReceiving: boolean;
  lastUpload: { track: string; lapTime: string; at: string } | null;
  currentSession: { lapCount: number; track: string } | null;
  pendingUploads: number;
  detectedGame: string | null;
  unsupportedFormat: number | null;
  updateState: UpdateState;
}

export interface CompanionSettings {
  apiKey: string;
  apiBaseUrl: string;
  port: number;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  wizardComplete: boolean;
}

export interface SetupPathResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface SetupResult {
  ok: boolean;
  results: SetupPathResult[];
}

export interface CompanionAPI {
  minimizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  getVersion(): Promise<string>;
  getStatus(): Promise<CompanionStatus>;
  getSettings(): Promise<CompanionSettings>;
  setSettings(partial: Partial<CompanionSettings>): Promise<void>;
  verifyApiKey(key: string): Promise<boolean>;
  getLocalIPs(): Promise<string[]>;
  onStatusUpdate(cb: (status: CompanionStatus) => void): () => void;
  openF1SimHub(): Promise<void>;
  openLogFile(): Promise<void>;
  openReleasesPage(): Promise<void>;
  forceFlush(): Promise<void>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  setupAcTelemetry(): Promise<SetupResult>;
  setupAccTelemetry(): Promise<SetupResult>;
  showInFolder(path: string): Promise<void>;
}

const api: CompanionAPI = {
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  getVersion: () => ipcRenderer.invoke("get-version"),
  getStatus: () => ipcRenderer.invoke("get-status"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => ipcRenderer.invoke("set-settings", partial),
  verifyApiKey: (key) => ipcRenderer.invoke("verify-api-key", key),
  getLocalIPs: () => ipcRenderer.invoke("get-local-ips"),
  onStatusUpdate: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, status: CompanionStatus): void => cb(status);
    ipcRenderer.on("status-update", handler);
    return () => ipcRenderer.removeListener("status-update", handler);
  },
  openF1SimHub: () => ipcRenderer.invoke("open-f1simhub"),
  openLogFile: () => ipcRenderer.invoke("open-log-file"),
  openReleasesPage: () => ipcRenderer.invoke("open-releases-page"),
  forceFlush: () => ipcRenderer.invoke("force-flush"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  setupAcTelemetry: () => ipcRenderer.invoke("setup-ac-telemetry"),
  setupAccTelemetry: () => ipcRenderer.invoke("setup-acc-telemetry"),
  showInFolder: (path) => ipcRenderer.invoke("show-in-folder", path),
};

contextBridge.exposeInMainWorld("companion", api);
