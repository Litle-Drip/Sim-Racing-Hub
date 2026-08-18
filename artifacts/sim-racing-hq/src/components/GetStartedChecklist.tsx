import { useState, useCallback, type ReactNode } from 'react';
import { Check, Download, KeyRound, Flag, Copy } from 'lucide-react';
import { useCompanionKeyStatus, useGenerateCompanionKey } from '../lib/companionApi';
import { UDP_FORMAT, UDP_PORT, UDP_IP_SAME_PC, UDP_SEND_RATE } from '../data/udpSetup';

// The one thing a new driver has to accomplish is: app installed, key pasted,
// lap driven. Everything else on the dashboard is meaningless until then, so
// until the first session lands this card sits at the top and carries the
// whole path — including generating the key inline, so nobody has to find the
// Companion page to get one.

const DOWNLOADED_KEY = 'f1simhub-companion-downloaded';
const DISMISSED_KEY = 'f1simhub-getstarted-dismissed';

const RELEASES_URL = 'https://github.com/Litle-Drip/Sim-Racing-Hub/releases';

function detectOS(): 'windows' | 'mac' | 'other' {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key: string): void {
  try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
}

function StepRow({
  index,
  done,
  active,
  icon,
  title,
  children,
}: {
  index: number;
  done: boolean;
  active: boolean;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderTop: index === 1 ? 'none' : '1px solid var(--border)',
        opacity: done || active ? 1 : 0.55,
      }}
    >
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
          background: done ? 'var(--teal)' : active ? 'rgba(232,0,45,0.15)' : 'var(--bg-elevated)',
          color: done ? 'var(--on-accent, #06110f)' : active ? 'var(--red)' : 'var(--gray-mid)',
          border: `1px solid ${done ? 'var(--teal)' : active ? 'var(--red)' : 'var(--border)'}`,
        }}
      >
        {done ? <Check size={14} strokeWidth={3} /> : index}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-body)',
            fontWeight: 600,
            color: done ? 'var(--gray-mid)' : 'var(--white)',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          <span style={{ display: 'inline-flex', color: done ? 'var(--teal)' : 'var(--gray-mid)' }}>{icon}</span>
          {title}
        </div>
        {!done && children && (
          <div style={{ marginTop: 'var(--space-2)' }}>{children}</div>
        )}
      </div>
    </div>
  );
}

export default function GetStartedChecklist({
  hasSession,
  setPage,
}: {
  hasSession: boolean;
  setPage: (p: string) => void;
}) {
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_KEY));
  const [downloaded, setDownloaded] = useState(() => readFlag(DOWNLOADED_KEY));
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keyStatus, isLoading: keyLoading } = useCompanionKeyStatus(!hasSession && !dismissed);
  const generate = useGenerateCompanionKey();

  const hasKey = keyStatus?.hasKey ?? false;

  const handleDownload = useCallback(() => {
    writeFlag(DOWNLOADED_KEY);
    setDownloaded(true);
  }, []);

  const handleGenerate = useCallback(() => {
    generate.mutate(undefined, { onSuccess: key => setFreshKey(key) });
  }, [generate]);

  const copyKey = useCallback(() => {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [freshKey]);

  const handleDismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY);
    setDismissed(true);
  }, []);

  // Once a session exists the loop is proven and the card has done its job.
  if (hasSession || dismissed) return null;

  const os = detectOS();
  const osLabel = os === 'mac' ? 'macOS' : os === 'windows' ? 'Windows' : 'your platform';

  const steps = [downloaded, hasKey, false];
  const doneCount = 1 + steps.filter(Boolean).length; // account creation is already done
  const total = 4;

  return (
    <div
      className="card card-accent card-accent--red"
      style={{ padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-4)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 'var(--space-1)' }}>
            Start here — {doneCount} of {total}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--white)' }}>
            Get your first lap logged automatically
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)', margin: 'var(--space-1) 0 0', maxWidth: '58ch', lineHeight: 1.6 }}>
            Three steps, about five minutes. After that every session you drive in F1 25 uploads here on its own.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleDismiss} style={{ flexShrink: 0 }}>
          Hide
        </button>
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <StepRow index={1} done active={false} icon={<Check size={13} />} title="Create your free account" />

        <StepRow
          index={2}
          done={downloaded}
          active={!downloaded}
          icon={<Download size={13} />}
          title={`Download the companion app for ${osLabel}`}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              className="btn btn-primary btn-sm"
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleDownload}
            >
              ↓ Download for {osLabel}
            </a>
            <button className="btn btn-ghost btn-sm" onClick={handleDownload}>
              Already installed
            </button>
          </div>
          <div className="card-note" style={{ marginTop: 'var(--space-2)' }}>
            Unsigned build — Windows shows a SmartScreen prompt (<em>More info → Run anyway</em>); on macOS right-click the DMG and choose <em>Open</em>.
          </div>
        </StepRow>

        <StepRow
          index={3}
          done={hasKey}
          active={downloaded && !hasKey}
          icon={<KeyRound size={13} />}
          title="Generate your API key and paste it into the app"
        >
          {freshKey ? (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div className="code-block" style={{ flex: 1, color: 'var(--white)', wordBreak: 'break-all' }}>{freshKey}</div>
                <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={copyKey}>
                  {copied ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> Copied</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Copy size={12} /> Copy</span>}
                </button>
              </div>
              <div className="card-note" style={{ marginTop: 'var(--space-2)' }}>
                Paste it into the companion app's first setup screen. It won't be shown again — you can always generate a new one.
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generate.isPending || keyLoading}>
                {generate.isPending ? 'Generating…' : 'Generate my API key'}
              </button>
              {generate.isError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--red)', marginTop: 'var(--space-2)' }}>
                  Couldn't generate a key — try again, or open the Companion page.
                </div>
              )}
            </>
          )}
        </StepRow>

        <StepRow
          index={4}
          done={false}
          active={hasKey}
          icon={<Flag size={13} />}
          title="Turn on telemetry in F1 25 and drive a lap"
        >
          <div className="card-note" style={{ lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--gray-light)' }}>Settings → Telemetry Settings:</strong>{' '}
            UDP Telemetry <strong style={{ color: 'var(--white)' }}>On</strong> ·
            Broadcast Mode <strong style={{ color: 'var(--white)' }}>Off</strong> ·
            IP <strong style={{ color: 'var(--white)' }}>{UDP_IP_SAME_PC}</strong> (playing on this PC) ·
            Port <strong style={{ color: 'var(--white)' }}>{UDP_PORT}</strong> ·
            Rate <strong style={{ color: 'var(--white)' }}>{UDP_SEND_RATE}</strong> ·
            Format <strong style={{ color: 'var(--white)' }}>{UDP_FORMAT}</strong>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage('companion')}>
              Full setup guide →
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('sessions')}>
              Or log a lap by hand
            </button>
          </div>
        </StepRow>
      </div>
    </div>
  );
}
