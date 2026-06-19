import { useLocation } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function DownloadPage() {
  const [, setLocation] = useLocation();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Back link */}
        <button
          onClick={() => setLocation('/')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--gray-mid)',
            padding: 0,
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ← Back to F1 Sim Hub
        </button>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              <div style={{ width: 5, height: 10, background: 'var(--red)' }} />
              <div style={{ width: 5, height: 16, background: 'var(--red)' }} />
              <div style={{ width: 5, height: 22, background: 'var(--red)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--teal)' }}>
              Companion App
            </div>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '0.04em', color: 'var(--white)', margin: '0 0 10px' }}>
            F1 Sim Hub Companion
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-mid)', lineHeight: 1.7, maxWidth: 560, margin: 0 }}>
            The companion app reads live telemetry from F1 25 and automatically uploads your sessions when you finish a race.
            No manual logging required — just drive.
          </p>
        </div>

        {/* Download Card */}
        <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
            Download
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 20 }}>
            The companion app is a desktop app for Windows and macOS. It runs in your system tray, reads UDP telemetry from F1 25, and silently uploads sessions when you exit.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <a
              href="https://github.com/f1simhub/companion/releases/latest"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: '0.06em',
                color: 'var(--white)',
                background: 'var(--red)',
                padding: '10px 20px',
                borderRadius: 3,
                textDecoration: 'none',
              }}
            >
              ↓ Windows (x64)
            </a>
            <a
              href="https://github.com/f1simhub/companion/releases/latest"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: '0.06em',
                color: 'var(--white)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                padding: '10px 20px',
                borderRadius: 3,
                textDecoration: 'none',
              }}
            >
              ↓ macOS (Universal)
            </a>
            <a
              href="https://github.com/f1simhub/companion/releases"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--gray-mid)',
                padding: '10px 12px',
                textDecoration: 'none',
              }}
            >
              All releases →
            </a>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--gray-mid)' }}>Note:</strong> Builds are currently unsigned. Windows may show a SmartScreen prompt — click <em>More info → Run anyway</em>. On macOS, right-click the DMG and choose <em>Open</em>.
          </div>
        </div>

        {/* F1 25 UDP Setup Guide */}
        <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
            F1 25 UDP Setup Guide
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 20 }}>
            Enable UDP telemetry in F1 25 so the companion app can read your session data in real time.
          </div>
          <ol style={{ paddingLeft: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                step: 'Open F1 25 and go to Settings',
                detail: 'From the main menu, select Settings → Telemetry Settings.',
              },
              {
                step: 'Enable UDP Telemetry',
                detail: 'Set "UDP Telemetry" to On.',
              },
              {
                step: 'Set the broadcast mode',
                detail: 'Set "UDP Broadcast Mode" to Off. Set "UDP IP Address" to 127.0.0.1 (localhost).',
              },
              {
                step: 'Configure port and format',
                detail: 'Set "UDP Port" to 20777. Set "UDP Send Rate" to 60Hz. Set "UDP Format" to 2024.',
              },
              {
                step: 'Install and launch the companion app',
                detail: 'Download and install the companion app above. Paste your API key into Settings → API Key (generate one from the Companion page after signing in). The app will appear in your system tray.',
              },
              {
                step: 'Start a session in F1 25',
                detail: 'When you finish a practice, qualifying, or race session, the companion app automatically uploads it to your F1 Sim Hub account.',
              },
            ].map((item, i) => (
              <li key={i} style={{ listStyle: 'none', display: 'flex', gap: 14 }}>
                <div style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--red)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  color: 'var(--white)',
                  fontWeight: 700,
                  marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 4 }}>
                    {item.step}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', lineHeight: 1.6 }}>
                    {item.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Sign-up nudge */}
        <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 8 }}>
            Ready to track every session automatically?
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 20 }}>
            Create a free F1 Sim Hub account to generate your API key and start logging sessions from the companion app.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={`${basePath}/sign-up`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: '0.06em',
                color: 'var(--white)',
                background: 'var(--red)',
                padding: '10px 24px',
                borderRadius: 3,
                textDecoration: 'none',
              }}
            >
              Create Free Account
            </a>
            <a
              href={`${basePath}/sign-in`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: '0.06em',
                color: 'var(--gray-light)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                padding: '10px 24px',
                borderRadius: 3,
                textDecoration: 'none',
              }}
            >
              Sign In
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '24px 0 8px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
            F1 Sim Hub — Built for the sim racing community. Not affiliated with Formula 1 or Codemasters.
          </p>
        </div>
      </div>
    </div>
  );
}
