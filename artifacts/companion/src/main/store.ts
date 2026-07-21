import Store from "electron-store";

export interface Settings {
  apiKey: string;
  apiBaseUrl: string;
  port: number;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  wizardComplete: boolean;
}

const defaults: Settings = {
  apiKey: "",
  apiBaseUrl: "https://sim-racing-hub.onrender.com/api",
  port: 20777,
  launchAtStartup: false,
  minimizeToTray: false,
  wizardComplete: false,
};

export const store = new Store<Settings>({ defaults });
