import { useState, useCallback, useEffect } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { useAuth } from '@clerk/react';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

interface ApiKeyStatus {
  hasKey: boolean;
  createdAt: string | null;
}

async function fetchWithAuth(token: string, path: string, opts?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
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
      {copied ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><Check size={12} aria-hidden="true" /> Copied</span> : 'Copy'}
    </button>
  );
}

export default function Companion() {
  const { getToken } = useAuth();

  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithAuth(token, '/companion/apikey');
      if (!res.ok) throw new Error('Failed to load API key status');
      const data = await res.json() as ApiKeyStatus;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const generateKey = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithAuth(token, '/companion/apikey', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate API key');
      const data = await res.json() as { key: string };
      setFreshKey(data.key);
      setStatus({ hasKey: true, createdAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const revokeKey = useCallback(async () => {
    setShowRevokeConfirm(false);
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithAuth(token, '/companion/apikey', { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to revoke API key');
      setStatus({ hasKey: false, createdAt: null });
      setFreshKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <div className="page page--narrow">
      {/* The title block now uses the app's .page-header/.page-title/.page-subtitle
          rather than its own 22px heading and teal eyebrow. */}
      <div className="page-header" style={{ display: 'block' }}>
        <h1 className="page-title">F1 Sim Hub Companion</h1>
        <p className="page-subtitle" style={{ maxWidth: '60ch', lineHeight: 1.6 }}>
          The companion app reads live telemetry from F1 25 and automatically uploads your sessions when you finish. No manual logging required.
        </p>
      </div>

      <div className="card-stack">
        {/* API Key Card */}
        <div className="card card-pad">
          <div className="section-title">
            API Key
          </div>

          {error && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--red)', marginBottom: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(232,0,45,0.08)', border: '1px solid rgba(232,0,45,0.2)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <span>{error}</span>
              <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={loadStatus}>Retry</button>
            </div>
          )}

          {status === null ? (
            <div className="card-text" style={{ color: 'var(--gray-mid)' }}>
              {loading ? 'Loading…' : (
                <button className="btn btn-secondary" onClick={loadStatus}>Load Status</button>
              )}
            </div>
          ) : (
            <>
              {freshKey ? (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', letterSpacing: '0.08em', color: 'var(--teal)', marginBottom: 'var(--space-2)' }}>
                    <KeyRound size={12} aria-hidden="true" />
                    Your new API key — copy it now, it won't be shown again
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <div className="code-block" style={{ flex: 1, color: 'var(--white)' }}>
                      {freshKey}
                    </div>
                    <CopyButton text={freshKey} />
                  </div>
                  <div className="card-note" style={{ marginTop: 'var(--space-2)' }}>
                    Paste this key into the companion app settings. It won't be displayed again.
                  </div>
                </div>
              ) : status.hasKey ? (
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
                </div>
              ) : (
                <div className="card-text" style={{ color: 'var(--gray-mid)', marginBottom: 'var(--space-4)' }}>
                  No API key yet. Generate one to connect the companion app.
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={generateKey}
                  disabled={loading}
                >
                  {status.hasKey ? 'Regenerate Key' : 'Generate Key'}
                </button>
                {status.hasKey && (
                  <button
                    className="btn btn-secondary"
                    style={{ border: '1px solid var(--red)', color: 'var(--red)' }}
                    onClick={() => setShowRevokeConfirm(true)}
                    disabled={loading}
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

        {/* Download Card */}
        <div className="card card-pad">
          <div className="section-title">
            Download
          </div>
          <div className="card-text" style={{ marginBottom: 'var(--space-4)' }}>
            The companion app is a desktop app for Windows and macOS. It runs in your system tray, reads UDP telemetry from F1 25, and silently uploads sessions when you exit.
          </div>
          {/* The three download links were hand-styled anchors; they now wear the
              app's button classes so height, radius and type match every other
              action in the app. */}
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

        {/* F1 25 UDP Setup Guide */}
        <div className="card card-pad">
          <div className="section-title">
            F1 25 UDP Setup Guide
          </div>

          <div className="card-text" style={{ marginBottom: 'var(--space-5)' }}>
            Enable UDP telemetry in F1 25 so the companion app can read your session data in real time.
          </div>

          <ol className="step-list">
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
                detail: 'Download and install the companion app (above). Paste your API key into Settings → API Key. The app will appear in your system tray.',
              },
              {
                step: 'Start a session in F1 25',
                detail: 'When you finish a practice, qualifying, or race session, the companion app automatically uploads it to your F1 Sim Hub account.',
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

        {/* API Reference */}
        <div className="card card-pad">
          <div className="section-title">
            API Reference
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
