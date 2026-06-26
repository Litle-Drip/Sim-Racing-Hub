import { useEffect, useState } from "react";

interface Status {
  signedIn: boolean;
  gameConnected: boolean;
  telemetryReceiving: boolean;
  lastUpload: { track: string; lapTime: string; at: string } | null;
  currentSession: { lapCount: number; track: string } | null;
  pendingUploads: number;
}

interface Props {
  onOpenSettings: () => void;
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid #1e1e1e",
      }}
    >
      <span style={{ color: "#999", fontSize: 13 }}>{label}</span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: ok ? "#00d4b1" : "#555",
          fontWeight: 500,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: ok ? "#00d4b1" : "#333",
            flexShrink: 0,
          }}
        />
        {value}
      </span>
    </div>
  );
}

function formatAgo(iso: string): string {
  const delta = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export default function Dashboard({ onOpenSettings }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>({
    signedIn: false,
    gameConnected: false,
    telemetryReceiving: false,
    lastUpload: null,
    currentSession: null,
    pendingUploads: 0,
  });

  useEffect(() => {
    window.companion.getStatus().then(setStatus);
    const unsub = window.companion.onStatusUpdate(setStatus);
    return unsub;
  }, []);

  const lastUploadLabel = status.lastUpload
    ? `${status.lastUpload.track} — ${status.lastUpload.lapTime} (${formatAgo(status.lastUpload.at)})`
    : "—";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f0f0f",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid #1e1e1e",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "linear-gradient(135deg, #00d4b1 0%, #007aff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            F1
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>
              F1SimHub Companion
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
              {status.currentSession
                ? `Session active — ${status.currentSession.lapCount} lap${status.currentSession.lapCount !== 1 ? "s" : ""} on ${status.currentSession.track}`
                : "Waiting for session…"}
            </div>
          </div>
        </div>
      </div>

      {/* Status rows */}
      <div style={{ flex: 1 }}>
        <StatusRow
          label="Signed In"
          value={status.signedIn ? "API key active" : "No API key"}
          ok={status.signedIn}
        />
        <StatusRow
          label="Game Connected"
          value={status.gameConnected ? "F1 25 detected" : "Waiting…"}
          ok={status.gameConnected}
        />
        <StatusRow
          label="Telemetry Receiving"
          value={status.telemetryReceiving ? "Live data" : "No packets"}
          ok={status.telemetryReceiving}
        />
        <StatusRow
          label="Last Upload"
          value={lastUploadLabel}
          ok={!!status.lastUpload}
        />
        {status.pendingUploads > 0 && (
          <div
            style={{
              margin: "0 20px",
              padding: "10px 14px",
              background: "#1a1200",
              border: "1px solid #3a2a00",
              borderRadius: 8,
              marginTop: 12,
              fontSize: 12,
              color: "#f59e0b",
            }}
          >
            ⚠ {status.pendingUploads} pending upload{status.pendingUploads > 1 ? "s" : ""} — will retry automatically
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #1e1e1e",
          display: "flex",
          gap: 10,
        }}
      >
        <button
          onClick={() => window.companion.openF1SimHub()}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "#00d4b1",
            color: "#000",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: -0.2,
          }}
        >
          Open F1SimHub ↗
        </button>
        <button
          onClick={onOpenSettings}
          style={{
            padding: "10px 16px",
            background: "#1a1a1a",
            color: "#999",
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 13,
            border: "1px solid #2a2a2a",
          }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
