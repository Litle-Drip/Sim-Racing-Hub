import { useEffect, useState } from "react";
import WindowControls from "../components/WindowControls";
import Button from "../components/Button";
import { theme } from "../theme";

type UpdateState =
  | { phase: "unsupported" }
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "not-available" }
  | { phase: "error"; message: string };

interface SettingsData {
  apiKey: string;
  apiBaseUrl: string;
  port: number;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  wizardComplete: boolean;
}

interface Props {
  onBack: () => void;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: `1px solid ${theme.border}`,
        cursor: "pointer",
      }}
      onClick={() => onChange(!checked)}
    >
      <div>
        <div style={{ fontSize: 13, color: theme.white }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: theme.gray, marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? theme.teal : theme.borderAccent,
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.15s",
          }}
        />
      </div>
    </div>
  );
}

export default function Settings({ onBack }: Props): React.ReactElement {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [version, setVersion] = useState<string | null>(null);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: "idle" });
  const [acSetup, setAcSetup] = useState<{ ok: boolean; message: string } | null>(null);
  const [accSetup, setAccSetup] = useState<{ ok: boolean; message: string } | null>(null);
  const [settingUpAc, setSettingUpAc] = useState(false);
  const [settingUpAcc, setSettingUpAcc] = useState(false);

  useEffect(() => {
    window.companion.getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    window.companion.getStatus().then((s) => setUpdateState(s.updateState));
    const unsub = window.companion.onStatusUpdate((s) => setUpdateState(s.updateState));
    return unsub;
  }, []);

  useEffect(() => {
    window.companion.getSettings().then((s) => {
      setSettings(s);
      setPortInput(String(s.port));
    });
  }, []);

  async function save(partial: Partial<SettingsData>): Promise<void> {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await window.companion.setSettings(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleSaveKey(): Promise<void> {
    if (!settings) return;
    const trimmed = settings.apiKey.trim();
    if (!trimmed) {
      setKeyError("Paste a key first.");
      return;
    }
    setVerifyingKey(true);
    setKeyError("");
    try {
      const ok = await window.companion.verifyApiKey(trimmed);
      if (ok) {
        await save({ apiKey: trimmed });
      } else {
        setKeyError("Key not recognised — check you copied it correctly.");
      }
    } catch {
      setKeyError("Could not reach F1SimHub. Check your internet connection.");
    } finally {
      setVerifyingKey(false);
    }
  }

  async function handleSetupAc(): Promise<void> {
    setSettingUpAc(true);
    setAcSetup(null);
    try {
      setAcSetup(await window.companion.setupAcTelemetry());
    } finally {
      setSettingUpAc(false);
    }
  }

  async function handleSetupAcc(): Promise<void> {
    setSettingUpAcc(true);
    setAccSetup(null);
    try {
      setAccSetup(await window.companion.setupAccTelemetry());
    } finally {
      setSettingUpAcc(false);
    }
  }

  function handleClearKey(): void {
    if (!settings?.apiKey) return;
    const confirmed = window.confirm(
      "Remove the saved API key? Session uploads will stop until you paste a key again."
    );
    if (!confirmed) return;
    setSettings({ ...settings, apiKey: "" });
    save({ apiKey: "" });
    setKeyError("");
  }

  if (!settings) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: theme.gray }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.bg }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 12px 14px 20px",
          borderBottom: `1px solid ${theme.border}`,
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <Button
          variant="icon"
          onClick={onBack}
          style={{ padding: "2px 8px", fontSize: 18, lineHeight: 1, WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          ←
        </Button>
        <span style={{ fontWeight: 600, fontSize: 15, color: theme.white }}>Settings</span>
        {saved && (
          <span style={{ marginLeft: "auto", marginRight: 4, fontSize: 12, color: theme.teal }}>
            Saved ✓
          </span>
        )}
        <WindowControls />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* API Key section */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: theme.gray, textTransform: "uppercase", letterSpacing: 1 }}>
          API Key
        </div>
        <div style={{ padding: "0 20px 14px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => {
                setSettings({ ...settings, apiKey: e.target.value });
                setKeyError("");
              }}
              placeholder="Paste your API key…"
              style={{
                flex: 1,
                padding: "10px 12px",
                background: theme.bgElevated,
                border: `1px solid ${keyError ? theme.red : theme.borderAccent}`,
                borderRadius: 7,
                color: theme.white,
                fontSize: 12,
                letterSpacing: settings.apiKey && !showKey ? 2 : 0,
              }}
            />
            <Button variant="secondary" onClick={() => setShowKey(!showKey)} style={{ padding: "10px 12px", fontSize: 12 }}>
              {showKey ? "Hide" : "Show"}
            </Button>
          </div>
          {keyError && (
            <p style={{ fontSize: 11, color: theme.red, marginTop: 6 }}>{keyError}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button
              variant="primary"
              onClick={handleSaveKey}
              disabled={verifyingKey}
              style={{ flex: 1, padding: "8px", fontSize: 12 }}
            >
              {verifyingKey ? "Verifying…" : "Save Key"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleClearKey}
              disabled={!settings.apiKey}
              style={{ padding: "8px 14px", fontSize: 12 }}
            >
              Clear
            </Button>
          </div>
          <p style={{ fontSize: 11, color: theme.gray, marginTop: 8 }}>
            Get your key at{" "}
            <span
              style={{ color: theme.teal, cursor: "pointer" }}
              onClick={() => window.companion.openF1SimHub()}
            >
              f1simhub.com/companion
            </span>
          </p>
        </div>

        {/* UDP Port */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: theme.gray, textTransform: "uppercase", letterSpacing: 1 }}>
          Connection
        </div>
        <div style={{ padding: "0 20px 14px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 13, color: theme.gray, marginBottom: 8 }}>UDP Port</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              min={1024}
              max={65535}
              style={{
                flex: 1,
                padding: "10px 12px",
                background: theme.bgElevated,
                border: `1px solid ${theme.borderAccent}`,
                borderRadius: 7,
                color: theme.white,
                fontSize: 13,
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                const port = parseInt(portInput, 10);
                if (!isNaN(port) && port >= 1024 && port <= 65535) {
                  save({ port });
                }
              }}
              style={{ padding: "10px 16px", fontSize: 12, color: theme.white }}
            >
              Apply
            </Button>
          </div>
          <p style={{ fontSize: 11, color: theme.gray, marginTop: 6 }}>Default: 20777. Must match F1 25 settings.</p>
        </div>

        {/* Game setup — AC/ACC need a config file changed before their
            telemetry protocols will talk to this app at all; these buttons
            do it automatically instead of the user hand-editing files. */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: theme.gray, textTransform: "uppercase", letterSpacing: 1 }}>
          Game Setup
        </div>
        <div style={{ padding: "0 20px 14px", borderBottom: `1px solid ${theme.border}` }}>
          <p style={{ fontSize: 11, color: theme.gray, marginBottom: 10 }}>
            F1 24/25/26 work with no setup. Assetto Corsa and ACC each need one setting enabled in-game first —
            these buttons do it for you instead of editing a config file by hand.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <Button
              variant="secondary"
              onClick={handleSetupAc}
              disabled={settingUpAc}
              style={{ flex: 1, padding: "8px", fontSize: 12 }}
            >
              {settingUpAc ? "Setting up…" : "Set up Assetto Corsa"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSetupAcc}
              disabled={settingUpAcc}
              style={{ flex: 1, padding: "8px", fontSize: 12 }}
            >
              {settingUpAcc ? "Setting up…" : "Set up ACC"}
            </Button>
          </div>
          {acSetup && (
            <p style={{ fontSize: 11, color: acSetup.ok ? theme.teal : theme.red, marginTop: 4 }}>
              AC: {acSetup.message}
            </p>
          )}
          {accSetup && (
            <p style={{ fontSize: 11, color: accSetup.ok ? theme.teal : theme.red, marginTop: 4 }}>
              ACC: {accSetup.message}
            </p>
          )}
        </div>

        {/* Behaviour toggles */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: theme.gray, textTransform: "uppercase", letterSpacing: 1 }}>
          Behaviour
        </div>
        <Toggle
          label="Launch at Startup"
          description="Start the companion when you log in"
          checked={settings.launchAtStartup}
          onChange={(v) => save({ launchAtStartup: v })}
        />
        <Toggle
          label="Minimize to Tray"
          description="Keep running in the background when window is closed"
          checked={settings.minimizeToTray}
          onChange={(v) => save({ minimizeToTray: v })}
        />

        {/* Logs & Updates */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${theme.border}`, marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
          <Button variant="secondary" onClick={() => window.companion.openLogFile()} style={{ width: "100%" }}>
            View Logs
          </Button>

          {updateState.phase === "unsupported" ? (
            <>
              <p style={{ fontSize: 11, color: theme.gray, textAlign: "center" }}>
                Auto-update isn't available on this build — download new versions manually.
              </p>
              <Button
                variant="secondary"
                onClick={() => window.companion.openReleasesPage()}
                style={{ width: "100%", fontSize: 12 }}
              >
                Open Releases Page
              </Button>
            </>
          ) : updateState.phase === "ready" ? (
            <Button
              variant="primary"
              onClick={() => window.companion.installUpdate()}
              style={{ width: "100%", fontSize: 12 }}
            >
              Restart &amp; Install v{updateState.version}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => window.companion.checkForUpdates()}
                disabled={updateState.phase === "checking" || updateState.phase === "downloading"}
                style={{ width: "100%", fontSize: 12 }}
              >
                {updateState.phase === "checking"
                  ? "Checking…"
                  : updateState.phase === "downloading"
                    ? `Downloading v${updateState.version}… ${updateState.percent}%`
                    : "Check for Updates"}
              </Button>
              {updateState.phase === "not-available" && (
                <p style={{ fontSize: 11, color: theme.gray, textAlign: "center" }}>You're up to date.</p>
              )}
              {updateState.phase === "error" && (
                <p style={{ fontSize: 11, color: theme.red, textAlign: "center" }}>
                  Update check failed: {updateState.message}
                </p>
              )}
            </>
          )}
        </div>

        {/* Version footer */}
        {version && (
          <div style={{ padding: "8px 20px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 10, color: theme.gray, fontFamily: "monospace" }}>
              v{version}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
