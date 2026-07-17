import { useEffect, useState, useRef, type ReactNode } from 'react';

const GITHUB_STATUS_URL = 'https://www.githubstatus.com/api/v2/status.json';
const GITHUB_POLL_INTERVAL_MS = 60_000;

const HEALTH_POLL_INTERVAL_MS = 20_000;
const HEALTH_TIMEOUT_MS = 8_000;
const HEALTH_FAILURES_TO_TRIGGER = 2;
const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const HEALTH_URL = `${apiBase}/api/healthz`;

type Indicator = 'none' | 'minor' | 'major' | 'critical';

interface GithubStatus {
  indicator: Indicator;
  description: string;
}

const GITHUB_INDICATOR_STYLE: Record<Exclude<Indicator, 'none'>, { bg: string; border: string; label: string }> = {
  minor: { bg: 'rgba(255, 242, 0, 0.12)', border: 'var(--yellow)', label: 'Degraded Performance' },
  major: { bg: 'rgba(255, 149, 0, 0.14)', border: '#FF9500', label: 'Partial Outage' },
  critical: { bg: 'var(--red-dim)', border: 'var(--red)', label: 'Major Outage' },
};

function useBackendHealth(): boolean {
  const [down, setDown] = useState(false);
  const consecutiveFailures = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        // A degraded proxy/edge layer can return a 200 with an HTML error
        // page instead of the expected JSON body — treat that as down too.
        await res.json();
        consecutiveFailures.current = 0;
        if (!cancelled) setDown(false);
      } catch {
        consecutiveFailures.current += 1;
        if (!cancelled && consecutiveFailures.current >= HEALTH_FAILURES_TO_TRIGGER) {
          setDown(true);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    check();
    const id = setInterval(check, HEALTH_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return down;
}

function useGithubStatus(): GithubStatus | null {
  const [status, setStatus] = useState<GithubStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(GITHUB_STATUS_URL, { cache: 'no-store' });
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
    const id = setInterval(check, GITHUB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}

function Banner({ borderColor, bg, label, children }: { borderColor: string; bg: string; label: string; children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: bg,
        borderBottom: `1px solid ${borderColor}`,
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
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: borderColor, flexShrink: 0 }}>
        ⚠ {label}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
        {children}
      </span>
    </div>
  );
}

// Surfaces two independent outage signals so the UI never fails silently:
// our own backend health (the direct cause when features stop working) and
// GitHub's public status (since sign-in and other requests run through
// GitHub-backed infrastructure). Each clears itself automatically as soon
// as its check comes back healthy again — no manual toggling needed.
export default function ServiceStatusBanner() {
  const backendDown = useBackendHealth();
  const githubStatus = useGithubStatus();

  if (backendDown) {
    return (
      <Banner borderColor="var(--red)" bg="var(--red-dim)" label="Service Outage">
        We're experiencing technical difficulties — sessions, setups, and other features may not load right now. We're on it, and this message will clear automatically once things are back to normal.
      </Banner>
    );
  }

  if (githubStatus && githubStatus.indicator !== 'none') {
    const style = GITHUB_INDICATOR_STYLE[githubStatus.indicator];
    return (
      <Banner borderColor={style.border} bg={style.bg} label={`GitHub ${style.label}`}>
        {githubStatus.description} Sign-in and other GitHub-dependent features may be affected. This message clears automatically once resolved.
      </Banner>
    );
  }

  return null;
}
