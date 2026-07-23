import { useState, useEffect, useRef, useCallback } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { setAuthTokenGetter, createSession as apiCreateSessionRaw, getGetSessionsQueryKey } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { dark } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import Nav from './components/Nav';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Tracks from './pages/Tracks';
import Setups from './pages/Setups';
import HardwareVault from './pages/HardwareVault';
import Progress from './pages/Progress';
import RaceEngineer from './pages/RaceEngineer';
import Community from './pages/Community';
import PublicSetups from './pages/PublicSetups';
import PublicTracks from './pages/PublicTracks';
import PublicLeaderboard from './pages/PublicLeaderboard';
import QuickLog from './pages/QuickLog';
import DriverProfile from './pages/DriverProfile';
import Account from './pages/Account';
import Companion from './pages/Companion';
import DownloadPage from './pages/DownloadPage';
import ServiceStatusBanner from './components/ServiceStatusBanner';

// publishableKeyFromHost is Replit-specific — it derives a key + proxy from
// the hostname (clerk.<hostname>). On external hosts like Vercel that proxy
// subdomain doesn't exist, so we fall straight through to the env var key.
const isReplitHost =
  window.location.hostname.endsWith('.replit.app') ||
  window.location.hostname.endsWith('.replit.dev') ||
  window.location.hostname.endsWith('.repl.co') ||
  window.location.hostname.endsWith('.picard.replit.dev');

const clerkPubKey = isReplitHost
  ? publishableKeyFromHost(
      window.location.hostname,
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    )
  : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Only use the Replit-managed proxy when actually on Replit.
const clerkProxyUrl = isReplitHost
  ? import.meta.env.VITE_CLERK_PROXY_URL
  : undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#E8002D',
    colorForeground: '#F0F0F0',
    colorMutedForeground: '#BBBBBB',
    colorDanger: '#E8002D',
    colorBackground: '#111111',
    colorInput: '#1A1A1A',
    colorInputForeground: '#F0F0F0',
    colorNeutral: '#3A3A3A',
    fontFamily: "'Rajdhani', sans-serif",
    borderRadius: '4px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'rounded-none w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border !border-[#2A2A2A] !bg-[#111111] !rounded-none',
    footer: '!shadow-none !border-0 !bg-[#111111] !rounded-none',
    headerTitle: { color: '#F0F0F0', fontWeight: '700' },
    headerSubtitle: { color: '#BBBBBB' },
    socialButtonsBlockButtonText: { color: '#E8E8E8', fontWeight: '600' },
    socialButtonsBlockButtonArrow: { color: '#E8E8E8' },
    formFieldLabel: { color: '#C8C8C8' },
    footerActionLink: { color: '#E8002D' },
    footerActionText: { color: '#BBBBBB' },
    dividerText: { color: '#AAAAAA' },
    identityPreviewEditButton: { color: '#E8002D' },
    formFieldSuccessText: { color: '#39B54A' },
    alertText: { color: '#F0F0F0' },
    logoBox: 'mb-2',
    logoImage: 'h-10',
    socialButtons: 'grid grid-cols-2 gap-2',
    socialButtonsBlockButton: { backgroundColor: '#232323', border: '1px solid #3A3A3A', minHeight: '48px' },
    socialButtonsProviderIcon: { width: '20px', height: '20px' },
    formButtonPrimary: '!bg-[#E8002D] hover:!bg-[#c0001e] !min-h-[48px]',
    formFieldInput: '!bg-[#1A1A1A] !border-[#2A2A2A] !text-[#F0F0F0] !min-h-[48px] !text-base',
    footerAction: { backgroundColor: '#111111' },
    dividerLine: { backgroundColor: '#2A2A2A' },
    alert: '!border-[#2A2A2A]',
    otpCodeFieldInput: '!bg-[#1A1A1A] !border-[#2A2A2A]',
    formFieldRow: '',
    main: '',
  },
};

function SignInPage() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '16px',
    }}>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '16px',
    }}>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function LandingPage({ onGuest }: { onGuest?: () => void }) {
  const [, setLocation] = useLocation();

  const features = [
    { icon: '🏁', title: 'Session Log', desc: 'Track every practice, qualifying, and race. Log lap times, tires, weather, and conditions in 30 seconds.' },
    { icon: '⚙️', title: 'Setup Vault', desc: 'Save and share car setups per track. Tag by game version so nothing goes stale after a patch.' },
    { icon: '📊', title: 'PB Progression', desc: 'See your personal bests across every circuit. Variance charts show your consistency improving over time.' },
    { icon: '🗺️', title: 'Track Bible', desc: 'All 24 circuits with real corner names, gear suggestions, braking points, and your personal notes.' },
    { icon: '👥', title: 'Community', desc: 'Browse shared setups and sessions. Rate setups, filter by car and track, and see how you compare.' },
    { icon: '🏆', title: 'Leaderboard', desc: 'Fastest lap times per circuit from the community. Compete and see your name on the board.' },
  ];

  return (
    <div className="landing-page dot-grid">
      {/* Top bar */}
      <div className="landing-nav-bar">
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          <div style={{ width: 4, height: 10, background: 'var(--red)' }} />
          <div style={{ width: 4, height: 16, background: 'var(--red)' }} />
          <div style={{ width: 4, height: 22, background: 'var(--red)' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.16em', color: 'var(--white)', textTransform: 'uppercase' }}>
          F1 Sim Hub
        </span>
      </div>

      {/* Hero */}
      <div className="landing-hero">
        <h1 className="landing-hero-headline">
          Your Personal<br />
          F1 Sim <span className="accent">Racing</span><br />
          Companion
        </h1>
        <p className="landing-hero-sub">
          Log sessions, track your PBs, build and share setups, and master every circuit on the F1 25 calendar.
        </p>
        <p className="landing-hero-platform">
          For F1 25 on Xbox, PlayStation, and PC — wheel or controller.
        </p>
        <div className="landing-cta-group">
          <button className="btn btn-primary" style={{ minWidth: 320, fontSize: 13, padding: '15px 28px' }} onClick={onGuest}>
            Continue as Guest — No Sign Up Required →
          </button>
          <div className="landing-cta-row">
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setLocation('/sign-up')}>
              Create Free Account
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setLocation('/sign-in')}>
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="landing-features">
        <div className="landing-section-label">Everything you need to get faster</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {features.map(f => (
            <div key={f.title} className="landing-card">
              <div className="landing-card-icon">{f.icon}</div>
              <div className="landing-card-title">{f.title}</div>
              <div className="landing-card-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Browse Links */}
      <div className="landing-browse">
        <div className="landing-section-label">Browse without an account</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/setups')}>
            Community Setups
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/tracks')}>
            Circuit Guide
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/leaderboard')}>
            Leaderboard
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/download')}>
            ↓ Download Companion App
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="landing-footer">
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
          F1 Sim Hub — Built for the sim racing community. Not affiliated with Formula 1 or Codemasters.
        </p>
      </div>
    </div>
  );
}

const PROTECTED_PAGES = ['setups', 'hardware', 'progress', 'engineer'];

const GUEST_SESSIONS_KEY = 'f1simhub-guest-sessions';

function GuestSessionMigrator() {
  const qc = useQueryClient();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const raw = localStorage.getItem(GUEST_SESSIONS_KEY);
    if (!raw) return;
    let sessions: SessionRecord[];
    try { sessions = JSON.parse(raw); } catch { localStorage.removeItem(GUEST_SESSIONS_KEY); return; }
    if (!sessions.length) { localStorage.removeItem(GUEST_SESSIONS_KEY); return; }

    (async () => {
      const failed: SessionRecord[] = [];
      for (const s of sessions) {
        try {
          await apiCreateSessionRaw({
            id: s.id,
            date: s.date,
            trackId: s.trackId,
            car: s.car,
            type: s.type,
            bestLap: s.bestLap,
            avgLap: s.avgLap,
            worstLap: s.worstLap,
            s1: s.s1,
            s2: s.s2,
            s3: s.s3,
            tires: s.tires,
            fuelLoad: s.fuelLoad,
            conditions: s.conditions,
            timeOfDay: s.timeOfDay ?? undefined,
            assists: s.assists,
            rating: s.rating,
            notes: s.notes,
            penalty: s.penalty ?? undefined,
            gameVersion: s.gameVersion ?? undefined,
            platform: s.platform ?? undefined,
            inputDevice: s.inputDevice ?? undefined,
            laps: (s.laps ?? undefined) as import('@workspace/api-client-react').LapRecord[] | undefined,
            position: s.position,
          });
        } catch {
          failed.push(s);
        }
      }
      if (failed.length === 0) {
        localStorage.removeItem(GUEST_SESSIONS_KEY);
      } else {
        // Keep the sessions that failed to upload — they will be retried on
        // the next sign-in so the user never loses data.
        try { localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(failed)); } catch {}
      }
      qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
    })();
  }, [qc]);

  return null;
}

const PAGE_LABELS: Record<string, string> = {
  sessions: 'Session Log',
  setups: 'Setup Vault',
  hardware: 'Hardware Vault',
  progress: 'PB Progression',
  engineer: 'Race Engineer',
};

const PAGE_UNLOCKS: Record<string, { bullets: string[] }> = {
  sessions: {
    bullets: [
      'Log every practice, qualifying, and race session',
      'Track your personal bests per circuit — auto-detected',
      'See your consistency and lap variance improve over time',
    ],
  },
  setups: {
    bullets: [
      'Save car setups per track, tagged by game version',
      'Share to the community or keep them private',
      'Never lose a setup that works — yours forever',
    ],
  },
  hardware: {
    bullets: [
      'Build a profile of your wheel, pedals, and rig',
      'Share your hardware setup with the community',
      'Track which gear you had when you set your PBs',
    ],
  },
  progress: {
    bullets: [
      'Chart your personal bests across every circuit',
      'Lap variance chart shows how consistent you are',
      'Filter by car and session type to spot trends',
    ],
  },
  engineer: {
    bullets: [
      'AI coaching built from your actual session data',
      'Get specific, data-driven feedback after every debrief',
      'Ask follow-up questions about your pace and consistency',
    ],
  },
};

function GuestWall({ page, onSignIn }: { page: string; onSignIn: () => void }) {
  const unlocks = PAGE_UNLOCKS[page];
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      padding: '40px 24px',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 12 }}>
        Free Account Required
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 8 }}>
        Unlock your {PAGE_LABELS[page] || page}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-mid)', textAlign: 'center', maxWidth: 380, lineHeight: 1.6, marginBottom: 24 }}>
        Create a free account — no credit card, no waiting. Everything syncs across your devices automatically.
      </div>
      {unlocks && (
        <div style={{ marginBottom: 28, textAlign: 'left', maxWidth: 340 }}>
          {unlocks.bullets.map(b => (
            <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ color: 'var(--teal)', fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-primary" style={{ minWidth: 200, fontSize: 15, padding: '14px 28px' }} onClick={onSignIn}>
        Create Free Account
      </button>
      <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12, color: 'var(--gray-mid)' }} onClick={onSignIn}>
        Already have an account? Sign in →
      </button>
    </div>
  );
}

function GuestNudge({ onSignIn, onDismiss }: { onSignIn: () => void; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(10,10,10,0.97)',
      borderTop: '1px solid rgba(0,210,190,0.30)',
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      zIndex: 800,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--teal)', marginBottom: 3, textTransform: 'uppercase' }}>
          You've been exploring F1 Sim Hub
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.5 }}>
          Create a free account to <strong style={{ color: 'var(--white)' }}>log sessions, save setups, and track your PBs</strong> across every device.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button
          className="btn btn-ghost"
          onClick={onDismiss}
          style={{ fontSize: 12, color: 'var(--gray-mid)', padding: '8px 14px' }}
        >
          Maybe Later
        </button>
        <button
          className="btn btn-primary"
          onClick={onSignIn}
          style={{ fontSize: 13, padding: '9px 20px', whiteSpace: 'nowrap' }}
        >
          Create Free Account
        </button>
      </div>
    </div>
  );
}

const SHORTCUTS: Record<string, string> = {
  d: 'dashboard', n: 'sessions', t: 'tracks', s: 'setups', h: 'hardware', p: 'progress', e: 'engineer', c: 'community', x: 'companion', a: 'account',
};

function MainApp({ isGuest, onSignIn }: { isGuest?: boolean; onSignIn?: () => void }) {
  const [page, setPage] = useState('dashboard');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Persist guest activity across same-session refreshes
  const [pageViews, setPageViews] = useState<number>(() => {
    if (!isGuest) return 0;
    return parseInt(sessionStorage.getItem('guestPageViews') ?? '0', 10);
  });
  const [nudgeDismissed, setNudgeDismissed] = useState<boolean>(() => {
    if (!isGuest) return false;
    return sessionStorage.getItem('guestNudgeDismissed') === '1';
  });
  const [timeReached, setTimeReached] = useState<boolean>(() => {
    if (!isGuest) return false;
    return sessionStorage.getItem('guestTimeReached') === '1';
  });

  const handleSetPage = useCallback((p: string) => {
    setPage(p);
    if (isGuest) {
      setPageViews(v => {
        const next = v + 1;
        sessionStorage.setItem('guestPageViews', String(next));
        return next;
      });
    }
  }, [isGuest]);

  // 60-second timer — fires once per session
  useEffect(() => {
    if (!isGuest || timeReached || nudgeDismissed) return;
    const timer = setTimeout(() => {
      setTimeReached(true);
      sessionStorage.setItem('guestTimeReached', '1');
    }, 60_000);
    return () => clearTimeout(timer);
  }, [isGuest, timeReached, nudgeDismissed]);

  const handleDismiss = useCallback(() => {
    setNudgeDismissed(true);
    sessionStorage.setItem('guestNudgeDismissed', '1');
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { setShowShortcuts(v => !v); return; }
      const dest = SHORTCUTS[e.key.toLowerCase()];
      if (dest) handleSetPage(dest);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSetPage]);

  const showNudge = isGuest && (pageViews >= 3 || timeReached) && !nudgeDismissed;

  // Allow child pages to trigger top-level navigation via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const dest = (e as CustomEvent<string>).detail;
      if (dest) handleSetPage(dest);
    };
    window.addEventListener('nav', handler);
    return () => window.removeEventListener('nav', handler);
  }, [handleSetPage]);

  // Allow guest pages to trigger sign-in via custom event
  useEffect(() => {
    if (!isGuest) return;
    const handler = () => { if (onSignIn) onSignIn(); };
    window.addEventListener('guestSignIn', handler);
    return () => window.removeEventListener('guestSignIn', handler);
  }, [isGuest, onSignIn]);

  const renderPage = () => {
    if (isGuest && PROTECTED_PAGES.includes(page)) {
      return <GuestWall page={page} onSignIn={onSignIn ?? (() => {})} />;
    }
    switch (page) {
      case 'dashboard': return <Dashboard setPage={handleSetPage} />;
      case 'sessions': return <Sessions isGuest={isGuest} />;
      case 'tracks': return <Tracks isGuest={isGuest} />;
      case 'setups': return <Setups />;
      case 'hardware': return <HardwareVault />;
      case 'progress': return <Progress setPage={handleSetPage} />;
      case 'engineer': return <RaceEngineer />;
      case 'community': return <Community />;
      case 'companion': return <Companion />;
      case 'account': return <Account />;
      default: return <Dashboard setPage={handleSetPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={handleSetPage} />
      <main className="main-content">
        {renderPage()}
      </main>
      {showNudge && (
        <GuestNudge
          onSignIn={onSignIn ?? (() => {})}
          onDismiss={handleDismiss}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowShortcuts(false)}>
          <div className="card" style={{ padding: '24px 32px', maxWidth: 360, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--white)', marginBottom: 16, textTransform: 'uppercase' }}>Keyboard Shortcuts</div>
            {Object.entries(SHORTCUTS).map(([key, dest]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                <span style={{ color: 'var(--gray-light)', textTransform: 'capitalize' }}>{dest}</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 3, color: 'var(--teal)' }}>{key.toUpperCase()}</kbd>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontFamily: 'var(--font-body)', fontSize: 13, borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <span style={{ color: 'var(--gray-light)' }}>Toggle this panel</span>
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 3, color: 'var(--teal)' }}>?</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeRoute() {
  const [isGuest, setIsGuest] = useState(false);
  const [, setLocation] = useLocation();

  const handleSignIn = () => {
    setIsGuest(false);
    setLocation('/sign-in');
  };

  return (
    <>
      <Show when="signed-in">
        <GuestSessionMigrator />
        <MainApp />
      </Show>
      <Show when="signed-out">
        {isGuest
          ? <MainApp isGuest onSignIn={handleSignIn} />
          : <LandingPage onGuest={() => setIsGuest(true)} />
        }
      </Show>
    </>
  );
}

function ClerkAuthTokenRegistrar() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to access your F1 Sim Hub dashboard',
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: 'Start tracking your sim racing performance',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenRegistrar />
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/setups">{() => <PublicSetups onBack={() => window.location.href = basePath || '/'} />}</Route>
          <Route path="/tracks">{() => <PublicTracks onBack={() => window.location.href = basePath || '/'} />}</Route>
          <Route path="/leaderboard">{() => <PublicLeaderboard onBack={() => window.location.href = basePath || '/'} />}</Route>
          <Route path="/download">{() => <DownloadPage />}</Route>
          <Route path="/log">{() => <QuickLog onDone={() => window.location.href = basePath || '/'} />}</Route>
          <Route path="/driver/:username">{(params) => <DriverProfile username={params.username} />}</Route>
          <Route component={HomeRoute} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  if (!clerkPubKey) {
    return (
      <>
        <ServiceStatusBanner />
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          padding: 24,
          fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#111',
            border: '1px solid #E8002D',
            padding: '32px 40px',
            maxWidth: 520,
            width: '100%',
          }}>
            <div style={{ color: '#E8002D', fontSize: 12, letterSpacing: '0.12em', marginBottom: 16 }}>
              CONFIGURATION ERROR
            </div>
            <div style={{ color: '#F0F0F0', fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
              <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> is not set.
            </div>
            <div style={{ color: '#A8A8A8', fontSize: 13, lineHeight: 1.7 }}>
              In Vercel → Settings → Environment Variables, add:<br />
              <span style={{ color: '#00D2BE' }}>VITE_CLERK_PUBLISHABLE_KEY</span> = your <code>pk_live_...</code> or <code>pk_test_...</code> key<br /><br />
              Then redeploy for the change to take effect.
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <ServiceStatusBanner />
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
