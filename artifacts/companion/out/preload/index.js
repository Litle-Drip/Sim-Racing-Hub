"use strict";
const electron = require("electron");
const api = {
  getVersion: () => electron.ipcRenderer.invoke("get-version"),
  getStatus: () => electron.ipcRenderer.invoke("get-status"),
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => electron.ipcRenderer.invoke("set-settings", partial),
  verifyApiKey: (key) => electron.ipcRenderer.invoke("verify-api-key", key),
  getLocalIPs: () => electron.ipcRenderer.invoke("get-local-ips"),
  onStatusUpdate: (cb) => {
    const handler = (_, status) => cb(status);
    electron.ipcRenderer.on("status-update", handler);
    return () => electron.ipcRenderer.removeListener("status-update", handler);
  },
  openF1SimHub: () => electron.ipcRenderer.invoke("open-f1simhub"),
  openLogFile: () => electron.ipcRenderer.invoke("open-log-file"),
  openReleasesPage: () => electron.ipcRenderer.invoke("open-releases-page"),
  forceFlush: () => electron.ipcRenderer.invoke("force-flush")
};
electron.contextBridge.exposeInMainWorld("companion", api);
