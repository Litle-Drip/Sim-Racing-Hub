import { useEffect, useState } from "react";
import WindowControls from "../components/WindowControls";
import LogoMark from "../components/LogoMark";
import Button from "../components/Button";
import { IconCopy, IconCheck } from "../components/Icons";
import { theme } from "../theme";

interface Props {
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

function StepIndicator({ current, total }: { current: Step; total: number }): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? 20 : 6,
            height: 6,
            borderRadius: 3,
            background: i + 1 <= current ? theme.red : theme.borderAccent,
            transition: "all 0.2s",
          }}
        />
      ))}
    </div>
  );
}

export default function Wizard({ onComplete }: Props): React.ReactElement {
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [localIPs, setLocalIPs] = useState<string[]>([]);
  const [waitingForPacket, setWaitingForPacket] = useState(false);
  const [copiedIP, setCopiedIP] = useState(false);

  useEffect(() => {
    if (step === 2) {
      window.companion.getLocalIPs().then(setLocalIPs);
    }
    if (step === 3) {
      setWaitingForPacket(true);
      // Poll for game connection
      const interval = setInterval(async () => {
        const status = await window.companion.getStatus();
        if (status.gameConnected) {
          clearInterval(interval);
          setWaitingForPacket(false);
          // Short delay before completing
          setTimeout(onComplete, 1500);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [step, onComplete]);

  function handleCopyIP(ip: string): void {
    navigator.clipboard.writeText(ip).then(() => {
      setCopiedIP(true);
      setTimeout(() => setCopiedIP(false), 1500);
    });
  }

  async function handleVerifyKey(): Promise<void> {
    if (!apiKey.trim()) {
      setVerifyError("Please paste your API key first.");
      return;
    }
    setVerifying(true);
    setVerifyError("");
    try {
      const ok = await window.companion.verifyApiKey(apiKey.trim());
      if (ok) {
        await window.companion.setSettings({ apiKey: apiKey.trim() });
        setStep(2);
      } else {
        setVerifyError("Key not recognised — check you copied it correctly from f1simhub.com/companion.");
      }
    } catch {
      setVerifyError("Could not reach F1SimHub. Check your internet connection.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: theme.bg,
      }}
    >
      {/* Drag region */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 8px 8px 0",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <WindowControls />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 24px 32px" }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <LogoMark size={32} />
        <span style={{ fontWeight: 600, fontSize: 16, color: theme.white }}>F1SimHub Companion</span>
      </div>

      <StepIndicator current={step} total={3} />

      {step === 1 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.white, marginBottom: 8 }}>
            Paste your API Key
          </h2>
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Get your key from{" "}
            <span
              style={{ color: theme.teal, cursor: "pointer" }}
              onClick={() => window.companion.openF1SimHub()}
            >
              f1simhub.com/companion
            </span>{" "}
            under "Generate API Key".
          </p>
          <input
            type="password"
            placeholder="Paste key here…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerifyKey()}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: theme.bgElevated,
              border: `1px solid ${theme.borderAccent}`,
              borderRadius: 8,
              color: theme.white,
              fontSize: 13,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          />
          {verifyError && (
            <p style={{ color: theme.red, fontSize: 12, marginBottom: 12 }}>{verifyError}</p>
          )}
          <Button
            variant="primary"
            onClick={handleVerifyKey}
            disabled={verifying}
            style={{ width: "100%", padding: "12px", fontSize: 14, marginTop: 8 }}
          >
            {verifying ? "Verifying…" : "Verify & Continue →"}
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.white, marginBottom: 8 }}>
            Configure F1 25
          </h2>
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            In F1 25, go to <strong style={{ color: theme.grayLight }}>Settings → Telemetry Settings</strong> and set:
          </p>
          <div
            style={{
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            {[
              ["UDP Telemetry", "On"],
              ["UDP Broadcast Mode", "Off"],
              ["UDP IP Address", localIPs[0] ?? "Your PC's local IP"],
              ["UDP Port", "20777"],
              ["UDP Send Rate", "60Hz"],
              ["UDP Format", "2023"],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <span style={{ color: theme.gray, fontSize: 12 }}>{label}</span>
                {label === "UDP IP Address" && localIPs[0] ? (
                  <button
                    onClick={() => handleCopyIP(localIPs[0])}
                    title="Copy to clipboard"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: 0,
                      background: "transparent",
                      color: copiedIP ? theme.teal : theme.white,
                      fontWeight: 500,
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  >
                    {copiedIP ? (
                      <>
                        <IconCheck size={12} /> Copied
                      </>
                    ) : (
                      <>
                        {value} <IconCopy size={12} color={theme.gray} />
                      </>
                    )}
                  </button>
                ) : (
                  <span
                    style={{
                      color: value === "On" || value === "20777" ? theme.teal : theme.white,
                      fontWeight: 500,
                      fontSize: 12,
                    }}
                  >
                    {value}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div
            style={{
              background: theme.tealDim,
              border: `1px solid ${theme.tealBorder}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: theme.teal,
              marginBottom: 24,
            }}
          >
            💡 To find your IP: open Command Prompt and type <code>ipconfig</code> (Windows) or Terminal → <code>ifconfig</code> (macOS). Look for IPv4 / inet.
          </div>
          <Button variant="primary" onClick={() => setStep(3)} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
            Done — Continue →
          </Button>
        </>
      )}

      {step === 3 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.white, marginBottom: 8 }}>
            Waiting for first packet
          </h2>
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
            Start F1 25 and load into a session. The companion will detect the connection automatically.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              flex: 1,
              justifyContent: "center",
            }}
          >
            {waitingForPacket ? (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    border: `3px solid ${theme.border}`,
                    borderTopColor: theme.teal,
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p style={{ color: theme.gray, fontSize: 13 }}>Listening on port 20777…</p>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: theme.tealDim,
                    border: `3px solid ${theme.teal}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  ✓
                </div>
                <p style={{ color: theme.teal, fontSize: 14, fontWeight: 600 }}>
                  Connected — Setup complete!
                </p>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onComplete} style={{ width: "100%", padding: "12px" }}>
            Skip — I'll test later
          </Button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
