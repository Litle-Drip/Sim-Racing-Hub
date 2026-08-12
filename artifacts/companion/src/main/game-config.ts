// Writes the in-game config AC and ACC each require before their telemetry
// protocols will talk to us at all (see ac-udp.ts / acc-udp.ts file
// headers) — so a user never has to hand-edit an .ini or .json file
// themselves to use this app.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";

export interface SetupResult {
  ok: boolean;
  message: string;
}

function acRaceIniPath(): string {
  return join(app.getPath("documents"), "Assetto Corsa", "cfg", "race.ini");
}

function accBroadcastingJsonPath(): string {
  return join(app.getPath("documents"), "Assetto Corsa Competizione", "Config", "broadcasting.json");
}

// race.ini holds dozens of unrelated settings from the user's last-driven
// session — this only ever touches the one [REMOTE_TELEMETRY] section,
// never rewrites the file wholesale, so nothing else in it is disturbed.
export function setupAcTelemetry(): SetupResult {
  const path = acRaceIniPath();
  if (!existsSync(path)) {
    return {
      ok: false,
      message: "race.ini not found — launch Assetto Corsa at least once first, then try again.",
    };
  }

  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (err) {
    return { ok: false, message: `Couldn't read race.ini: ${err instanceof Error ? err.message : String(err)}` };
  }

  const sectionMatch = /\[REMOTE_TELEMETRY\]([^[]*)/i.exec(text);
  let updated: string;

  if (!sectionMatch) {
    const sep = text.endsWith("\n") ? "" : "\n";
    updated = `${text}${sep}\n[REMOTE_TELEMETRY]\nACTIVE=1\n`;
  } else {
    const body = sectionMatch[1];
    if (/^\s*ACTIVE\s*=\s*1\s*$/im.test(body)) {
      return { ok: true, message: "Remote Telemetry is already enabled." };
    }
    if (/ACTIVE\s*=/im.test(body)) {
      const newBody = body.replace(/ACTIVE\s*=\s*\S*/im, "ACTIVE=1");
      updated = text.slice(0, sectionMatch.index) + "[REMOTE_TELEMETRY]" + newBody + text.slice(sectionMatch.index + sectionMatch[0].length);
    } else {
      const newBody = `\nACTIVE=1${body}`;
      updated = text.slice(0, sectionMatch.index) + "[REMOTE_TELEMETRY]" + newBody + text.slice(sectionMatch.index + sectionMatch[0].length);
    }
  }

  try {
    writeFileSync(path, updated, "utf-8");
  } catch (err) {
    return { ok: false, message: `Couldn't write race.ini: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, message: "Remote Telemetry enabled — restart Assetto Corsa for it to take effect." };
}

// Matches acc-udp.ts's DEFAULT_CONNECTION_PASSWORD and ACC_DEFAULT_PORT.
const EXPECTED_ACC_PORT = 9000;
const EXPECTED_ACC_PASSWORD = "asd";

// Unlike race.ini, broadcasting.json holds nothing but these three keys —
// safe to write wholesale when it doesn't exist yet, since there's no
// unrelated content to preserve.
export function setupAccTelemetry(): SetupResult {
  const path = accBroadcastingJsonPath();

  if (existsSync(path)) {
    try {
      const existing = JSON.parse(readFileSync(path, "utf-8")) as {
        updListenerPort?: number;
        connectionPassword?: string;
      };
      if (existing.updListenerPort === EXPECTED_ACC_PORT && existing.connectionPassword === EXPECTED_ACC_PASSWORD) {
        return { ok: true, message: "Broadcasting is already configured correctly." };
      }
      // Don't silently overwrite — this file may already be configured for
      // a different broadcasting client (race control software, another
      // dashboard app) with a port/password this app doesn't know.
      return {
        ok: false,
        message: `broadcasting.json exists with different settings (port ${existing.updListenerPort ?? "?"}). ` +
          `Set "updListenerPort": ${EXPECTED_ACC_PORT} and "connectionPassword": "${EXPECTED_ACC_PASSWORD}" ` +
          `manually to let this app connect, or leave it if that config is for another tool.`,
      };
    } catch {
      return {
        ok: false,
        message: "broadcasting.json exists but isn't valid JSON — fix or delete it, then try again.",
      };
    }
  }

  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ updListenerPort: EXPECTED_ACC_PORT, connectionPassword: EXPECTED_ACC_PASSWORD, commandPassword: "" }, null, 2) + "\n",
      "utf-8"
    );
  } catch (err) {
    return { ok: false, message: `Couldn't create broadcasting.json: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, message: "Broadcasting configured — restart ACC for it to take effect." };
}
