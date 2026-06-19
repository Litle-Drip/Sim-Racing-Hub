import { contextBridge, ipcRenderer } from "electron";

export interface CompanionStatus {
  signedIn: boolean;
  gameConnected: boolean;
  telemetryReceiving: boolean;
  lastUpload: { track: string; lapTime: string; at: string } | null;
  currentSession: { lapCount: number; track: string } | null;
  pendingUploads: number;
}

export interface CompanionSettings {
  apiKey: string;
  apiBaseUrl: string;
  port: number;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  wizardComplete: boolean;
}

export interface CompanionAPI {
  getStatus(): Promise<CompanionStatus>;
  getSettings(): Promise<CompanionSettings>;
  setSettings(partial: Partial<CompanionSettings>): Promise<void>;
  verifyApiKey(key: string): Promise<boolean>;
  onStatusUpdate(cb: (status: CompanionStatus) => void): () => void;
  openF1SimHub(): Promise<void>;
  openLogFile(): Promise<void>;
  forceFlush(): Promise<void>;
}

const api: CompanionAPI = {
  getStatus: () => ipcRenderer.invoke("get-status"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => ipcRenderer.invoke("set-settings", partial),
  verifyApiKey: (key) => ipcRenderer.invoke("verify-api-key", key),
  onStatusUpdate: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, status: CompanionStatus): void => cb(status);
    ipcRenderer.on("status-update", handler);
    return () => ipcRenderer.removeListener("status-update", handler);
  },
  openF1SimHub: () => ipcRenderer.invoke("open-f1simhub"),
  openLogFile: () => ipcRenderer.invoke("open-log-file"),
  forceFlush: () => ipcRenderer.invoke("force-flush"),
};

contextBridge.exposeInMainWorld("companion", api);
