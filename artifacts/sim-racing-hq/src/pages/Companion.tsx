import { useState, useCallback } from 'react';
import { Check, KeyRound, Copy } from 'lucide-react';
import {
  useCompanionKeyStatus,
  useGenerateCompanionKey,
  useRevokeCompanionKey,
} from '../lib/companionApi';
import { udpSettings, UDP_FORMAT, UDP_PORT } from '../data/udpSetup';

const RELEASES_URL = 'https://github.com/Litle-Drip/Sim-Racing-Hub/releases';

function detectOS(): 'windows' | 'mac' | 'other' {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button
      className="btn btn-secondary btn-sm"
      style={{ flexShrink: 0 }}
      onClick={copy}
    >
      {copied
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><Check size={12} aria-hidden="true" /> Copied</span>
        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><Copy size={12} aria-hidden="true" /> Copy</span>}
    </button>
  );
}

/** Numbered card header — the page is a sequence, so it reads as one. */
function StepHeader({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          background: 'rgba(232,0,45,0.15)',
          color: 'var(--red)',
          border: '1px solid var(--red)',
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="section-title" style={{ marginBottom: note ? 'var(--space-1)' : 0 }}>{title}</div>
        {note && <div className="card-note">{note}</div>}
      </div>
    </div>
  );
}

export default function Companion() {
  const { data: status, isLoading, isError, refetch } = useCompanionKeyStatus();
  const generate = useGenerateCompanionKey();
  const revoke = useRevokeCompanionKey();

  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [platform, setPlatform] = useState<'pc' | 'console'>('pc');

  const os = detectOS();
  const osLabel = os === 'mac' ? 'macOS' : os === 'windows' ? 'Windows' : 'your platform';

  const generateKey = useCallback(() => {
    generate.mutate(undefined, { onSuccess: key => setFreshKey(key) });
  }, [generate]);

  const revokeKey = useCallback(() => {
    setShowRevokeConfirm(false);
    revoke.mutate(undefined, { onSuccess: () => setFreshKey(null) });
  }, [revoke]);

  const busy = generate.isPending || revoke.isPending;
  const error =
    (isError && 'Failed to load API key status') ||
    (generate.isError && 'Failed to generate API key') ||
    (revoke.isError && 'Failed to revoke API key') ||
    null;

  return (
    <div className="page page--narrow">
      <div className="page-header" style={{ display: 'block' }}>
        <h1 className="page-title">Connect the Companion App</h1>
        <p className="page-subtitle" style={{ maxWidth: '60ch', lineHeight: 1.6 }}>
          Three steps, about five minutes. Once it's connected, every session you drive in F1 25
          uploads here on its own — no manual logging, ever again.
        </p>
      </div>

      <div className="card-stack">
        {/* ── 1 · Download ─────────────────────────────────────────────── */}
        <div className="card card-pad">
          <StepHeader n={1} title="Download the app" note={`Free desktop app for Windows and macOS — detected: ${osLabel}.`} />
          <div className="card-text" style={{ marginBottom: 'var(--space-4)' }}>
            It sits in your system tray, listens for telemetry from F1 25, and uploads each session when you finish it.
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <a
              className={os === 'mac' ? 'btn btn-secondary' : 'btn btn-primary'}
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
            >
              ↓ Windows (x64)
            </a>
            <a
              className={os === 'mac' ? 'btn btn-primary' : 'btn btn-secondary'}
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
            >
              ↓ macOS (Universal)
            </a>
            <a className="btn btn-ghost" href={RELEASES_URL} target="_blank" rel="noreferrer">
              All releases →
            </a>
          </div>
          <div className="card-note">
            <strong style={{ color: 'var(--gray-mid)' }}>Note:</strong> Builds are currently unsigned. Windows may show a SmartScreen prompt — click <em>More info → Run anyway</em>. On macOS, right-click the DMG and choose <em>Open</em>.
          </div>
        </div>

        {/* ── 2 · API key ──────────────────────────────────────────────── */}
        <div className="card card-pad">
          <StepHeader n={2} title="Generate your API key" note="This is what links the app to your account. Paste it into the app's first setup screen." />

          {error && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--red)', marginBottom: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(232,0,45,0.08)', border: '1px solid rgba(232,0,45,0.2)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <span>{error}</span>
              <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => refetch()}>Retry</button>
            </div>
          )}

          {isLoading && !status ? (
            <div className="card-text" style={{ color: 'var(--gray-mid)' }}>Loading…</div>
          ) : (
            <>
              {freshKey ? (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', letterSpacing: '0.08em', color: 'var(--teal)', marginBottom: 'var(--space-2)' }}>
                    <KeyRound size={12} aria-hidden="true" />
                    Your new API key — copy it now, it won't be shown again
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <div className="code-block" style={{ flex: 1, color: 'var(--white)', wordBreak: 'break-all' }}>
                      {freshKey}
                    </div>
                    <CopyButton text={freshKey} />
                  </div>
                  <div className="card-note" style={{ marginTop: 'var(--space-2)' }}>
                    In the companion app: paste it on the first setup screen, or into <em>Settings → API Key</em>. Lost it? Just generate a new one.
                  </div>
                </div>
              ) : status?.hasKey ? (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-body-sm)', color: 'var(--white)' }}>Active API key</span>
                  </div>
                  {status.createdAt && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)', marginLeft: 'var(--space-4)' }}>
                      Generated {new Date(status.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                  <div className="card-note" style={{ marginTop: 'var(--space-2)' }}>
                    Keys are only shown once. If you don't have it saved in the app, regenerate — the old one stops working.
                  </div>
                </div>
              ) : (
                <div className="card-text" style={{ color: 'var(--gray-mid)', marginBottom: 'var(--space-4)' }}>
                  No API key yet. Generate one to connect the companion app.
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={generateKey} disabled={busy}>
                  {generate.isPending ? 'Generating…' : status?.hasKey ? 'Regenerate Key' : 'Generate Key'}
                </button>
                {status?.hasKey && (
                  <button
                    className="btn btn-secondary"
                    style={{ border: '1px solid var(--red)', color: 'var(--red)' }}
                    onClick={() => setShowRevokeConfirm(true)}
                    disabled={busy}
                  >
                    Revoke Key
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {showRevokeConfirm && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowRevokeConfirm(false); }}>
            <div className="modal modal--sm">
              <div className="modal-header">
                <span className="modal-title">Revoke API Key</span>
                <button className="modal-close" onClick={() => setShowRevokeConfirm(false)}>×</button>
              </div>
              <div className="modal-body">
                <p className="card-text" style={{ margin: '0 0 var(--space-5)' }}>
                  Revoke your API key? The companion app will stop working until you generate a new one.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowRevokeConfirm(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ border: '1px solid var(--red)', color: 'var(--red)' }}
                    onClick={revokeKey}
                  >
                    Revoke Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 3 · Telemetry settings ───────────────────────────────────── */}
        <div className="card card-pad">
          <StepHeader
            n={3}
            title="Turn on telemetry in F1 25"
            note="In the game: Settings → Telemetry Settings."
          />

          {/* Where the game runs decides the IP address, and it is the setting
              people get wrong most often — so it is asked outright instead of
              being buried as a footnote under one hard-coded answer. */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', marginBottom: 'var(--space-2)' }}>
              Where do you play F1 25?
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {([['pc', 'Same PC as the app'], ['console', 'Xbox / PlayStation']] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={platform === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setPlatform(value)}
                  aria-pressed={platform === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 'var(--space-4)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {udpSettings(platform).map(s => (
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

          {platform === 'console' && (
            <div className="card-note" style={{ marginBottom: 'var(--space-4)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--gray-light)' }}>Finding your PC's local IP:</strong> the companion app
              shows it on its setup screen with a copy button — easiest route. Otherwise, on Windows open Command
              Prompt and run <code>ipconfig</code> (look for IPv4 Address); on macOS open Terminal and run
              <code>ipconfig getifaddr en0</code>. Your console and PC must be on the same router.
            </div>
          )}

          <div className="card-text">
            Then load into any session — Time Trial is the quickest way to prove it works. The companion app's
            dashboard turns green when packets arrive, and the session uploads here when you finish it.
          </div>
        </div>

        {/* ── Troubleshooting ──────────────────────────────────────────── */}
        <div className="card card-pad">
          <div className="section-title">Nothing showing up?</div>
          <ol className="step-list">
            {[
              {
                step: `Check UDP Format is ${UDP_FORMAT}`,
                detail: `This is the most common cause by far. The app reads formats 2024, 2025 and 2026 — any other value and it silently ignores every packet. The companion's dashboard tells you which format the game is sending.`,
              },
              {
                step: 'Check you were actually on track',
                detail: 'F1 25 sends nothing from the menus. Drive at least one timed lap, then return to the pits or exit the session.',
              },
              {
                step: `Check the port is ${UDP_PORT}`,
                detail: `Both the game and the companion app default to ${UDP_PORT}. If you changed it in one, change it in the other (companion: Settings → Port).`,
              },
              {
                step: 'Allow the app through your firewall',
                detail: 'Windows Firewall can block incoming UDP. When prompted, allow F1 Sim Hub Companion on private networks. On macOS, unsigned apps may be blocked from receiving UDP entirely — a known limitation.',
              },
              {
                step: 'Check your API key is still valid',
                detail: 'Regenerating a key on this page invalidates the old one. If you regenerated, paste the new key into the app under Settings → API Key.',
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

        {/* ── API reference ────────────────────────────────────────────── */}
        <div className="card card-pad">
          <div className="section-title">API Reference</div>
          <div className="card-note" style={{ marginBottom: 'var(--space-3)' }}>
            Only needed if you're building your own uploader — the companion app handles all of this for you.
          </div>
          <div className="card-text" style={{ marginBottom: 'var(--space-3)' }}>
            Authenticate requests with your API key:
          </div>
          <div className="code-block" style={{ marginBottom: 'var(--space-4)' }}>
            Authorization: Bearer &lt;your-api-key&gt;
          </div>

          {[
            {
              method: 'POST',
              path: '/api/companion/session',
              desc: 'Upload a session. Lap times are computed from the laps array if bestLap is omitted.',
            },
          ].map(e => (
            <div key={e.path} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', padding: 'var(--space-3) 0 0', borderTop: '1px solid var(--border)' }}>
              <span style={{
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-label)',
                fontWeight: 700,
                color: 'var(--teal)',
                background: 'rgba(0,210,190,0.1)',
                padding: '2px 6px',
                borderRadius: 'var(--radius)',
              }}>
                {e.method}
              </span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body-sm)', color: 'var(--white)', marginBottom: 'var(--space-1)' }}>{e.path}</div>
                <div className="card-note">{e.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
