import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/react';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

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
      className="btn btn-secondary"
      style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
      onClick={copy}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

export default function Companion() {
  const { getToken } = useAuth();

  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm('Revoke your API key? The companion app will stop working until you generate a new one.')) return;
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
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 6 }}>
          Companion App
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--white)', margin: 0 }}>
          F1 Sim Hub Companion
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginTop: 8, lineHeight: 1.6, maxWidth: 560 }}>
          The companion app reads live telemetry from F1 25 and automatically uploads your sessions when you finish. No manual logging required.
        </p>
      </div>

      {/* API Key Card */}
      <div className="card" style={{ padding: '20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
          API Key
        </div>

        {error && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--red)', marginBottom: 12, padding: '8px 12px', background: 'rgba(232,0,45,0.08)', border: '1px solid rgba(232,0,45,0.2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>{error}</span>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }} onClick={loadStatus}>Retry</button>
          </div>
        )}

        {status === null ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)' }}>
            {loading ? 'Loading…' : (
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={loadStatus}>Load Status</button>
            )}
          </div>
        ) : (
          <>
            {freshKey ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--teal)', marginBottom: 8 }}>
                  ⚡ Your new API key — copy it now, it won't be shown again
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--white)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    padding: '8px 12px',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}>
                    {freshKey}
                  </div>
                  <CopyButton text={freshKey} />
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>
                  Paste this key into the companion app settings. It won't be displayed again.
                </div>
              </div>
            ) : status.hasKey ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--white)' }}>Active API key</span>
                </div>
                {status.createdAt && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginLeft: 16 }}>
                    Generated {new Date(status.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginBottom: 16 }}>
                No API key yet. Generate one to connect the companion app.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={generateKey}
                disabled={loading}
              >
                {status.hasKey ? 'Regenerate Key' : 'Generate Key'}
              </button>
              {status.hasKey && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)' }}
                  onClick={revokeKey}
                  disabled={loading}
                >
                  Revoke Key
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Download Card */}
      <div className="card" style={{ padding: '20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
          Download
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 16 }}>
          The companion app is a desktop app for Windows and macOS. It runs in your system tray, reads UDP telemetry from F1 25, and silently uploads sessions when you exit.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <a
            href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases/latest"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              letterSpacing: '0.06em',
              color: 'var(--white)',
              background: 'var(--red)',
              padding: '8px 16px',
              borderRadius: 3,
              textDecoration: 'none',
            }}
          >
            ↓ Windows (x64)
          </a>
          <a
            href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases/latest"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              letterSpacing: '0.06em',
              color: 'var(--white)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: 3,
              textDecoration: 'none',
            }}
          >
            ↓ macOS (Universal)
          </a>
          <a
            href="https://github.com/Litle-Drip/Sim-Racing-Hub/releases"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--gray-mid)',
              padding: '8px 12px',
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
      <div className="card" style={{ padding: '20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
          F1 25 UDP Setup Guide
        </div>

        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 16 }}>
          Enable UDP telemetry in F1 25 so the companion app can read your session data in real time.
        </div>

        <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <li key={i} style={{ listStyle: 'none', display: 'flex', gap: 14 }}>
              <div style={{
                flexShrink: 0,
                width: 22,
                height: 22,
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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 3 }}>
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

      {/* API Reference */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 14 }}>
          API Reference
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 12 }}>
          Authenticate requests with your API key:
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--teal)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          Authorization: Bearer &lt;your-api-key&gt;
        </div>

        {[
          {
            method: 'POST',
            path: '/api/companion/session',
            desc: 'Upload a session. Lap times are computed from the laps array if bestLap is omitted.',
          },
        ].map(e => (
          <div key={e.path} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{
              flexShrink: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--teal)',
              background: 'rgba(0,210,190,0.1)',
              padding: '2px 6px',
              borderRadius: 2,
            }}>
              {e.method}
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white)', marginBottom: 2 }}>{e.path}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>{e.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
