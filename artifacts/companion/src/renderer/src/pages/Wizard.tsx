import { useEffect, useState } from "react";

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
            background: i + 1 <= current ? "#00d4b1" : "#2a2a2a",
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

  useEffect(() => {
    if (step === 2) {
      // Get local IPs via the OS
      setLocalIPs(["Check your network settings for your local IP"]);
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
        background: "#0f0f0f",
        padding: "32px 24px",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
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
        <span style={{ fontWeight: 600, fontSize: 16, color: "#fff" }}>F1SimHub Companion</span>
      </div>

      <StepIndicator current={step} total={3} />

      {step === 1 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Paste your API Key
          </h2>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Get your key from{" "}
            <span
              style={{ color: "#00d4b1", cursor: "pointer" }}
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
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              color: "#e5e5e5",
              fontSize: 13,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          />
          {verifyError && (
            <p style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{verifyError}</p>
          )}
          <button
            onClick={handleVerifyKey}
            disabled={verifying}
            style={{
              width: "100%",
              padding: "12px",
              background: verifying ? "#1a1a1a" : "#00d4b1",
              color: verifying ? "#555" : "#000",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              marginTop: 8,
              transition: "background 0.15s",
            }}
          >
            {verifying ? "Verifying…" : "Verify & Continue →"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Configure F1 25
          </h2>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            In F1 25, go to <strong style={{ color: "#ccc" }}>Settings → Telemetry Settings</strong> and set:
          </p>
          <div
            style={{
              background: "#141414",
              border: "1px solid #1e1e1e",
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
                  padding: "10px 16px",
                  borderBottom: "1px solid #1e1e1e",
                }}
              >
                <span style={{ color: "#888", fontSize: 12 }}>{label}</span>
                <span
                  style={{
                    color: value === "On" || value === "20777" ? "#00d4b1" : "#e5e5e5",
                    fontWeight: 500,
                    fontSize: 12,
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              background: "#0d1a16",
              border: "1px solid #0a3028",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: "#00d4b1",
              marginBottom: 24,
            }}
          >
            💡 To find your IP: open Command Prompt and type <code>ipconfig</code> (Windows) or Terminal → <code>ifconfig</code> (macOS). Look for IPv4 / inet.
          </div>
          <button
            onClick={() => setStep(3)}
            style={{
              width: "100%",
              padding: "12px",
              background: "#00d4b1",
              color: "#000",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Done — Continue →
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Waiting for first packet
          </h2>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
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
                    border: "3px solid #1e1e1e",
                    borderTopColor: "#00d4b1",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <p style={{ color: "#555", fontSize: 13 }}>Listening on port 20777…</p>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "#0d1a16",
                    border: "3px solid #00d4b1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  ✓
                </div>
                <p style={{ color: "#00d4b1", fontSize: 14, fontWeight: 600 }}>
                  Connected — Setup complete!
                </p>
              </>
            )}
          </div>
          <button
            onClick={onComplete}
            style={{
              width: "100%",
              padding: "12px",
              background: "#1a1a1a",
              color: "#666",
              borderRadius: 8,
              fontWeight: 500,
              fontSize: 13,
              border: "1px solid #2a2a2a",
            }}
          >
            Skip — I'll test later
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
