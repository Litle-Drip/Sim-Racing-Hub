import { useLocation } from 'wouter';
import Footer from '../components/Footer';
import { udpSettings, UDP_FORMAT } from '../data/udpSetup';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function DownloadPage() {
  const [, setLocation] = useLocation();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: 'var(--space-7) var(--space-5)' }}>
      <div className="page--narrow" style={{ margin: '0 auto' }}>
        {/* Back link: the app's .back-btn, not a third bespoke back control. */}
        <button className="back-btn" onClick={() => setLocation('/')}>
          ← Back to F1 Sim Hub
        </button>

        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              <div style={{ width: 5, height: 10, background: 'var(--red)' }} />
              <div style={{ width: 5, height: 16, background: 'var(--red)' }} />
              <div style={{ width: 5, height: 22, background: 'var(--red)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--teal)' }}>
              Companion App
            </div>
          </div>
          <h1 className="page-title" style={{ fontSize: 26, display: 'block', margin: '0 0 var(--space-2)' }}>
            F1 Sim Hub Companion
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)', color: 'var(--gray-mid)', lineHeight: 1.7, maxWidth: '60ch', margin: 0 }}>
            The companion app reads live telemetry from F1 25 and automatically uploads your sessions when you finish a race.
            No manual logging required — just drive.
          </p>
        </div>

        <div className="card-stack">
        {/* Download Card */}
        <div className="card card-pad">
          <div className="section-title">
            Download
          </div>
          <div className="card-text" style={{ marginBottom: 'var(--space-4)' }}>
            The companion app is a desktop app for Windows and macOS. It runs in your system tray, reads UDP telemetry from F1 25, and silently uploads sessions when you exit.
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <a
              className="btn btn-primary"
              href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              ↓ Windows (x64)
            </a>
            <a
              className="btn btn-secondary"
              href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              ↓ macOS (Universal)
            </a>
            <a
              className="btn btn-ghost"
              href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases"
              target="_blank"
              rel="noreferrer"
            >
              All releases →
            </a>
          </div>
          <div className="card-note">
            <strong style={{ color: 'var(--gray-mid)' }}>Note:</strong> Builds are currently unsigned. Windows may show a SmartScreen prompt — click <em>More info → Run anyway</em>. On macOS, right-click the DMG and choose <em>Open</em>.
          </div>
        </div>

        {/* How it works — the order a driver actually does it in, and the
            same telemetry values the in-app Companion page and the desktop
            wizard use (src/data/udpSetup.ts), so the three can't drift. */}
        <div className="card card-pad">
          <div className="section-title">
            How it works
          </div>
          <div className="card-text" style={{ marginBottom: 'var(--space-5)' }}>
            Four steps, about five minutes — then it runs itself.
          </div>
          <ol className="step-list">
            {[
              {
                step: 'Create a free account',
                detail: 'Takes under a minute. Your account is what the app uploads sessions to.',
              },
              {
                step: 'Install the app and paste your API key',
                detail: 'Generate a key on the Companion page after signing in, then paste it into the app\'s first setup screen. The app verifies it on the spot.',
              },
              {
                step: 'Turn on UDP telemetry in F1 25',
                detail: `Settings → Telemetry Settings. Set UDP Telemetry to On, Port to 20777, Send Rate to 60Hz and — this one matters — UDP Format to ${UDP_FORMAT}. Playing on this PC, set the IP to 127.0.0.1; on Xbox or PlayStation, use your PC's local IP, which the app shows you with a copy button.`,
              },
              {
                step: 'Drive',
                detail: 'Finish any practice, qualifying, race or Time Trial session and it uploads automatically — lap times, sectors, consistency and all.',
              },
            ].map((item, i) => (
              <li key={i} className="step-item">
                <div className="step-num">{i + 1}</div>
                <div>
                  <div className="step-title">{item.step}</div>
                  <div className="step-detail">{item.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* The exact settings, so a driver can set the game up before they
            have even downloaded anything. */}
        <div className="card card-pad">
          <div className="section-title">
            F1 25 telemetry settings
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {udpSettings('pc').map(s => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)', fontWeight: 600 }}>{s.value}</span>
                      {s.note && <div className="card-note" style={{ marginTop: 2 }}>{s.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-note" style={{ marginTop: 'var(--space-3)' }}>
            Playing on Xbox or PlayStation? Everything above is the same except the IP address — use your PC's
            local IP instead of 127.0.0.1. The companion app displays it for you with a copy button.
          </div>
        </div>

        {/* Sign-up nudge: the last card is the page's next step, so it carries
            the only primary action below the download buttons. */}
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 'var(--space-2)' }}>
            Ready to track every session automatically?
          </div>
          <div className="card-text" style={{ color: 'var(--gray-mid)', marginBottom: 'var(--space-5)', maxWidth: '60ch', marginLeft: 'auto', marginRight: 'auto' }}>
            Create a free F1 Sim Hub account to generate your API key and start logging sessions from the companion app.
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href={`${basePath}/sign-up`}>
              Create Free Account
            </a>
            <a className="btn btn-secondary" href={`${basePath}/sign-in`}>
              Sign In
            </a>
          </div>
        </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
