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

// Where the game runs relative to this app. It decides one setting — the UDP
// IP address — but it is the setting people get wrong most often, so it is
// asked outright rather than left as a footnote. On PC the game and the
// companion share a machine and loopback always works; from a console the
// packets have to cross the network to this PC's LAN address.
type Platform = "pc" | "console";

// F1 25 offers several packet formats. The parser (src/main/udp.ts) accepts
// 2024, 2025 and 2026 and silently drops everything else, so the wizard must
// only ever name one of those three — an unlisted format looks to the driver
// like the app is broken.
const UDP_FORMAT = "2024";

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
  const [platform, setPlatform] = useState<Platform>("pc");
  const [waitingForPacket, setWaitingForPacket] = useState(false);
  const [wrongFormat, setWrongFormat] = useState<number | null>(null);
  const [waitedLong, setWaitedLong] = useState(false);
  const [copiedIP, setCopiedIP] = useState(false);

  useEffect(() => {
    if (step === 2) {
      window.companion.getLocalIPs().then(setLocalIPs);
    }
    if (step === 3) {
      setWaitingForPacket(true);
      setWaitedLong(false);
      // Poll for game connection
      const interval = setInterval(async () => {
        const status = await window.companion.getStatus();
        // Packets arriving in a format the parser rejects look identical to
        // no packets at all on a spinner, so surface it as its own answer.
        setWrongFormat(status.unsupportedFormat);
        if (status.gameConnected) {
          clearInterval(interval);
          setWaitingForPacket(false);
          // Short delay before completing
          setTimeout(onComplete, 1500);
        }
      }, 1000);
      // Nobody should stare at a spinner with no idea what to try next.
      const nudge = setTimeout(() => setWaitedLong(true), 25_000);
      return () => {
        clearInterval(interval);
        clearTimeout(nudge);
      };
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
        setVerifyError("Key not recognised — check you copied the whole key from the Companion page.");
      }
    } catch {
      setVerifyError("Could not reach F1SimHub. Check your internet connection.");
    } finally {
      setVerifying(false);
    }
  }

  // The one setting that depends on where the game runs.
  const udpIp = platform === "pc" ? "127.0.0.1" : (localIPs[0] ?? "Your PC's local IP");
  const ipIsCopyable = platform === "console" && !!localIPs[0];

  const settingsRows: [string, string][] = [
    ["UDP Telemetry", "On"],
    ["UDP Broadcast Mode", "Off"],
    ["UDP IP Address", udpIp],
    ["UDP Port", "20777"],
    ["UDP Send Rate", "60Hz"],
    ["UDP Format", UDP_FORMAT],
  ];

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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 24px 32px", overflowY: "auto" }}>
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
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Your key lives on the Companion page of your F1SimHub account. Open it, hit{" "}
            <strong style={{ color: theme.grayLight }}>Generate Key</strong>, and copy it here.
          </p>
          {/* The link is a button, not a URL to retype: it deep-links straight
              to the page holding the key. */}
          <Button
            variant="secondary"
            onClick={() => window.companion.openF1SimHub("/companion")}
            style={{ width: "100%", padding: "10px", fontSize: 13, marginBottom: 16 }}
          >
            Open my API key page ↗
          </Button>
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

          {/* Ask where the game runs before showing the settings, because it
              changes one of them. */}
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
            Where do you play F1 25?
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {([
              ["pc", "This PC"],
              ["console", "Xbox / PlayStation"],
            ] as [Platform, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPlatform(value)}
                style={{
                  flex: 1,
                  padding: "10px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: platform === value ? theme.tealDim : theme.bgElevated,
                  border: `1px solid ${platform === value ? theme.teal : theme.border}`,
                  color: platform === value ? theme.teal : theme.gray,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            In F1 25, go to <strong style={{ color: theme.grayLight }}>Settings → Telemetry Settings</strong> and set:
          </p>
          <div
            style={{
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            {settingsRows.map(([label, value]) => (
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
                {label === "UDP IP Address" && ipIsCopyable ? (
                  <button
                    onClick={() => handleCopyIP(udpIp)}
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
                      color:
                        value === "On" || value === "20777" || value === UDP_FORMAT
                          ? theme.teal
                          : theme.white,
                      fontWeight: 500,
                      fontSize: 12,
                      fontFamily: label === "UDP IP Address" ? "monospace" : undefined,
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
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            {platform === "pc" ? (
              <>
                💡 <strong>127.0.0.1</strong> is correct for playing on this PC — the game sends telemetry
                to itself and the companion picks it up. No network setup needed.
              </>
            ) : (
              <>
                💡 That IP is this PC, read off your network — type it into the console exactly as shown.
                Your console and this PC must be on the same Wi-Fi or router.
              </>
            )}
          </div>

          {/* Getting the format wrong is the single most common reason
              telemetry never arrives, so it gets called out on its own. */}
          <div
            style={{
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: theme.gray,
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: theme.grayLight }}>UDP Format matters.</strong> It must be{" "}
            <strong style={{ color: theme.white }}>{UDP_FORMAT}</strong> (2025 and 2026 also work).
            Any other value and F1 25 sends packets the companion can't read.
          </div>

          <Button variant="primary" onClick={() => setStep(3)} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
            Done — Continue →
          </Button>
        </>
      )}

      {step === 3 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.white, marginBottom: 8 }}>
            Drive your first lap
          </h2>
          <p style={{ color: theme.gray, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Start F1 25 and load into any session — Time Trial is quickest. The companion detects the
            connection automatically and uploads the session when you finish it.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              flex: 1,
              justifyContent: "center",
              minHeight: 140,
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

          {/* Packets are arriving but in a format the parser rejects — the one
              case where the driver is nearly there and just has one dropdown
              to change. */}
          {wrongFormat !== null && waitingForPacket && (
            <div
              style={{
                background: "rgba(232,0,45,0.1)",
                border: `1px solid ${theme.red}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: theme.grayLight,
                marginBottom: 12,
                lineHeight: 1.6,
              }}
            >
              Telemetry is reaching the companion, but F1 25 is sending format{" "}
              <strong style={{ color: theme.white }}>{wrongFormat}</strong>. Change{" "}
              <strong style={{ color: theme.white }}>UDP Format</strong> to{" "}
              <strong style={{ color: theme.white }}>{UDP_FORMAT}</strong> in Telemetry Settings.
            </div>
          )}

          {waitedLong && wrongFormat === null && waitingForPacket && (
            <div
              style={{
                background: theme.bgElevated,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: theme.gray,
                marginBottom: 12,
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: theme.grayLight }}>Nothing yet? Check, in order:</strong>
              <div>1. UDP Telemetry is <strong style={{ color: theme.white }}>On</strong> and Port is <strong style={{ color: theme.white }}>20777</strong>.</div>
              <div>2. UDP IP Address is <strong style={{ color: theme.white }}>{udpIp}</strong>.</div>
              <div>3. You're actually out on track — the menus send nothing.</div>
              <div>4. Windows Firewall may be blocking the app — allow it on private networks.</div>
              <div style={{ marginTop: 6 }}>
                You can finish setup now and this will keep working in the background.
              </div>
            </div>
          )}

          <Button variant="secondary" onClick={onComplete} style={{ width: "100%", padding: "12px" }}>
            Skip — I'll test later
          </Button>

          <p style={{ color: theme.gray, fontSize: 11.5, marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
            Assetto Corsa and ACC are supported too — enable them in{" "}
            <strong style={{ color: theme.grayLight }}>Settings → Game Setup</strong> once you're set up here.
          </p>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
