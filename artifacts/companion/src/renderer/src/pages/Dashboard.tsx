import { useEffect, useState } from "react";
import WindowControls from "../components/WindowControls";
import LogoMark from "../components/LogoMark";
import { theme } from "../theme";

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
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <span style={{ color: theme.gray, fontSize: 13 }}>{label}</span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: ok ? theme.teal : theme.gray,
          fontWeight: 500,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: ok ? theme.teal : theme.borderAccent,
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

  const sessionActive = !!status.currentSession;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: theme.bg,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 12px 14px 20px",
          borderBottom: `1px solid ${theme.border}`,
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <LogoMark />
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: theme.white,
              letterSpacing: -0.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            F1SimHub Companion
          </div>
        </div>

        <div
          style={{ marginLeft: 10, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}
        >
          <div
            title={
              status.currentSession
                ? `${status.currentSession.lapCount} lap${status.currentSession.lapCount !== 1 ? "s" : ""} on ${status.currentSession.track}`
                : undefined
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.2,
              whiteSpace: "nowrap",
              background: sessionActive ? theme.tealDim : theme.bgElevated,
              border: `1px solid ${sessionActive ? theme.tealBorder : theme.borderAccent}`,
              color: sessionActive ? theme.teal : theme.grayLight,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: sessionActive ? theme.teal : theme.gray,
                flexShrink: 0,
                animation: sessionActive ? "livePulse 1.6s ease-in-out infinite" : undefined,
              }}
            />
            {sessionActive ? "Session active" : "Waiting for session"}
          </div>
          <WindowControls />
        </div>
      </div>
      <style>{`@keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

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
              background: theme.yellowDim,
              border: `1px solid ${theme.yellowBorder}`,
              borderRadius: 8,
              marginTop: 12,
              fontSize: 12,
              color: theme.yellow,
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
          borderTop: `1px solid ${theme.border}`,
          display: "flex",
          gap: 10,
        }}
      >
        <button
          onClick={() => window.companion.openF1SimHub()}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: theme.red,
            color: "#fff",
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
            background: theme.bgElevated,
            color: theme.gray,
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 13,
            border: `1px solid ${theme.borderAccent}`,
          }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
