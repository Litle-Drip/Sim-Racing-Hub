import { useEffect, useState } from "react";

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
        borderBottom: "1px solid #1e1e1e",
        cursor: "pointer",
      }}
      onClick={() => onChange(!checked)}
    >
      <div>
        <div style={{ fontSize: 13, color: "#e5e5e5" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? "#00d4b1" : "#2a2a2a",
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

  if (!settings) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "#555" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0f0f" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid #1e1e1e",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            color: "#666",
            fontSize: 18,
            lineHeight: 1,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          ←
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>Settings</span>
        {saved && <span style={{ marginLeft: "auto", fontSize: 12, color: "#00d4b1" }}>Saved ✓</span>}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* API Key section */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
          API Key
        </div>
        <div style={{ padding: "0 20px 14px", borderBottom: "1px solid #1e1e1e" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="Paste your API key…"
              style={{
                flex: 1,
                padding: "10px 12px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 7,
                color: "#e5e5e5",
                fontSize: 12,
                letterSpacing: settings.apiKey && !showKey ? 2 : 0,
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                padding: "10px 12px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 7,
                color: "#666",
                fontSize: 12,
              }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => save({ apiKey: settings.apiKey })}
              style={{
                flex: 1,
                padding: "8px",
                background: "#00d4b1",
                color: "#000",
                borderRadius: 7,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Save Key
            </button>
            <button
              onClick={() => {
                setSettings({ ...settings, apiKey: "" });
                save({ apiKey: "" });
              }}
              style={{
                padding: "8px 14px",
                background: "#1e1e1e",
                color: "#666",
                borderRadius: 7,
                fontSize: 12,
                border: "1px solid #2a2a2a",
              }}
            >
              Clear
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
            Get your key at{" "}
            <span
              style={{ color: "#00d4b1", cursor: "pointer" }}
              onClick={() => window.companion.openF1SimHub()}
            >
              f1simhub.com/companion
            </span>
          </p>
        </div>

        {/* UDP Port */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
          Connection
        </div>
        <div style={{ padding: "0 20px 14px", borderBottom: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>UDP Port</div>
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
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 7,
                color: "#e5e5e5",
                fontSize: 13,
              }}
            />
            <button
              onClick={() => {
                const port = parseInt(portInput, 10);
                if (!isNaN(port) && port >= 1024 && port <= 65535) {
                  save({ port });
                }
              }}
              style={{
                padding: "10px 16px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 7,
                color: "#e5e5e5",
                fontSize: 12,
              }}
            >
              Apply
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#444", marginTop: 6 }}>Default: 20777. Must match F1 25 settings.</p>
        </div>

        {/* Behaviour toggles */}
        <div style={{ padding: "14px 20px 8px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
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

        {/* Logs */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #1e1e1e", marginTop: 4 }}>
          <button
            onClick={() => window.companion.openLogFile()}
            style={{
              width: "100%",
              padding: "10px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              color: "#666",
              fontSize: 13,
            }}
          >
            View Logs
          </button>
        </div>
      </div>
    </div>
  );
}
