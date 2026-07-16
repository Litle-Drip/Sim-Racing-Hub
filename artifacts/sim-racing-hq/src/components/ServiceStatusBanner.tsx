import { useEffect, useState } from 'react';

const STATUS_URL = 'https://www.githubstatus.com/api/v2/status.json';
const POLL_INTERVAL_MS = 60_000;

type Indicator = 'none' | 'minor' | 'major' | 'critical';

interface GithubStatus {
  indicator: Indicator;
  description: string;
}

const INDICATOR_STYLE: Record<Exclude<Indicator, 'none'>, { bg: string; border: string; label: string }> = {
  minor: { bg: 'rgba(255, 242, 0, 0.12)', border: 'var(--yellow)', label: 'Degraded Performance' },
  major: { bg: 'rgba(255, 149, 0, 0.14)', border: '#FF9500', label: 'Partial Outage' },
  critical: { bg: 'var(--red-dim)', border: 'var(--red)', label: 'Major Outage' },
};

// GitHub's own infrastructure backs sign-in and other requests this app depends
// on. When GitHub is degraded, some of those requests fail even though our own
// servers are fine — this banner surfaces that instead of leaving the UI to
// silently misbehave. It polls the public GitHub status API and clears itself
// as soon as GitHub reports normal service.
export default function ServiceStatusBanner() {
  const [status, setStatus] = useState<GithubStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(STATUS_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const indicator: Indicator = data?.status?.indicator ?? 'none';
        const description: string = data?.status?.description ?? '';
        if (!cancelled) setStatus({ indicator, description });
      } catch {
        // Network hiccup or blocked request — leave the last known state
        // alone rather than flashing a false alarm.
      }
    }

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status || status.indicator === 'none') return null;

  const style = INDICATOR_STYLE[status.indicator];

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: style.bg,
        borderBottom: `1px solid ${style.border}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        flexWrap: 'wrap',
        textAlign: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: style.border, flexShrink: 0 }}>
        ⚠ GitHub {style.label}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
        {status.description} Sign-in and other GitHub-dependent features may be affected. This message clears automatically once resolved.
      </span>
    </div>
  );
}
