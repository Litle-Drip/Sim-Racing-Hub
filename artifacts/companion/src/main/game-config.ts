// Writes the in-game config AC and ACC each require before their telemetry
// protocols will talk to us at all (see ac-udp.ts / acc-udp.ts file
// headers) — so a user never has to hand-edit an .ini or .json file
// themselves to use this app.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { app } from "electron";

export interface SetupPathResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface SetupResult {
  // True if at least one candidate location ended up correctly configured.
  ok: boolean;
  results: SetupPathResult[];
}

// A OneDrive-redirected (or otherwise custom-relocated) "Documents" folder
// means Electron's resolved path and the actual folder a game reads from
// can silently be two different physical locations — Windows itself
// reports the redirected one, but not every game respects that redirect.
// Checking/writing both the resolved path and the plain, non-redirected
// default covers that mismatch instead of guessing wrong and reporting
// false success.
function candidateDocumentsRoots(): string[] {
  const roots = new Set<string>();
  roots.add(app.getPath("documents"));
  roots.add(join(homedir(), "Documents"));
  return [...roots];
}

function acRaceIniPaths(): string[] {
  return candidateDocumentsRoots().map((root) => join(root, "Assetto Corsa", "cfg", "race.ini"));
}

function accBroadcastingJsonPaths(): string[] {
  return candidateDocumentsRoots().map((root) => join(root, "Assetto Corsa Competizione", "Config", "broadcasting.json"));
}

function patchAcRaceIni(path: string): SetupPathResult {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (err) {
    return { path, ok: false, message: `Couldn't read: ${err instanceof Error ? err.message : String(err)}` };
  }

  const sectionMatch = /\[REMOTE_TELEMETRY\]([^[]*)/i.exec(text);
  let updated: string;

  if (!sectionMatch) {
    const sep = text.endsWith("\n") ? "" : "\n";
    updated = `${text}${sep}\n[REMOTE_TELEMETRY]\nACTIVE=1\n`;
  } else {
    const body = sectionMatch[1];
    if (/^\s*ACTIVE\s*=\s*1\s*$/im.test(body)) {
      return { path, ok: true, message: "Already enabled" };
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
    return { path, ok: false, message: `Couldn't write: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { path, ok: true, message: "Enabled — restart Assetto Corsa for it to take effect" };
}

// race.ini holds dozens of unrelated settings from the user's last-driven
// session — this only ever touches the one [REMOTE_TELEMETRY] section,
// never rewrites the file wholesale, so nothing else in it is disturbed.
// Only patches locations where race.ini already exists (AC itself must
// have created it there) rather than creating a bare-bones one from
// scratch, which would be missing everything else AC expects.
export function setupAcTelemetry(): SetupResult {
  const paths = acRaceIniPaths();
  const existing = paths.filter((p) => existsSync(p));

  if (existing.length === 0) {
    return {
      ok: false,
      results: paths.map((path) => ({
        path,
        ok: false,
        message: "race.ini not found here — launch Assetto Corsa at least once first",
      })),
    };
  }

  const results = existing.map(patchAcRaceIni);
  return { ok: results.some((r) => r.ok), results };
}

// Matches acc-udp.ts's DEFAULT_CONNECTION_PASSWORD and ACC_DEFAULT_PORT.
const EXPECTED_ACC_PORT = 9000;
const EXPECTED_ACC_PASSWORD = "asd";

// Unlike race.ini, broadcasting.json holds nothing but these three keys —
// safe to write wholesale when it doesn't exist yet, since there's no
// unrelated content to preserve. Written to every candidate location
// (rather than just the first) since, unlike race.ini, there's no existing
// file to tell us which one the game actually uses.
function ensureAccBroadcastingJson(path: string): SetupPathResult {
  if (existsSync(path)) {
    try {
      const existingConfig = JSON.parse(readFileSync(path, "utf-8")) as {
        updListenerPort?: number;
        connectionPassword?: string;
      };
      if (existingConfig.updListenerPort === EXPECTED_ACC_PORT && existingConfig.connectionPassword === EXPECTED_ACC_PASSWORD) {
        return { path, ok: true, message: "Already configured correctly" };
      }
      // Don't silently overwrite — this file may already be configured for
      // a different broadcasting client (race control software, another
      // dashboard app) with a port/password this app doesn't know.
      return {
        path,
        ok: false,
        message: `Exists with different settings (port ${existingConfig.updListenerPort ?? "?"}) — left alone`,
      };
    } catch {
      return { path, ok: false, message: "Exists but isn't valid JSON — left alone" };
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
    return { path, ok: false, message: `Couldn't create: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { path, ok: true, message: "Created — restart ACC for it to take effect" };
}

export function setupAccTelemetry(): SetupResult {
  const results = accBroadcastingJsonPaths().map(ensureAccBroadcastingJson);
  return { ok: results.some((r) => r.ok), results };
}
