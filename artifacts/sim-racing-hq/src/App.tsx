import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { setAuthTokenGetter, createSession as apiCreateSessionRaw, getGetSessionsQueryKey } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { dark } from '@clerk/themes';
import { Settings2, Map, Trophy, Activity, Bot, LayoutDashboard } from 'lucide-react';
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { UnitsProvider } from './lib/units';
import { ThemeProvider } from './lib/theme';
import { SHOW_ACHIEVEMENTS } from './lib/features';
import Nav from './components/Nav';
import { OPEN_LOG_KEY } from './lib/storage';
import Footer from './components/Footer';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Tracks from './pages/Tracks';
import Setups from './pages/Setups';
import HardwareVault from './pages/HardwareVault';
import Progress from './pages/Progress';
import RaceEngineer from './pages/RaceEngineer';
import Community from './pages/Community';
import Leagues from './pages/Leagues';
import DriverProfile from './pages/DriverProfile';
import Account from './pages/Account';
import Companion from './pages/Companion';
import DownloadPage from './pages/DownloadPage';
import ServiceStatusBanner from './components/ServiceStatusBanner';
import { buildSampleSessions } from './data/sampleSessions';
import { enterDemoMode, exitDemoMode } from './lib/demoStore';

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

// Applied to every Clerk surface — sign-in, sign-up, and the Manage Account
// modal. Keep this to design tokens plus overrides that are safe everywhere.
// Card-shaped element overrides belong in authCardAppearance below: when they
// lived here they also hit <UserProfile/>, which is why the Manage Account
// modal rendered a 22px "Profile details" over 13px field labels.
//
// Rajdhani is a condensed face, so Clerk's 13px default reads a size smaller
// than it measures. 15px is the root every other Clerk size scales from and
// lines the modal up with the app's own body text.
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
    fontSize: '15px',
    borderRadius: '4px',
  },
  elements: {
    formFieldLabel: { color: '#C8C8C8', fontSize: '14px' },
    formFieldSuccessText: { color: '#39B54A' },
    alertText: { color: '#F0F0F0' },
    alert: { borderColor: '#2A2A2A' },
    dividerLine: { backgroundColor: '#2A2A2A' },
    dividerText: { color: '#AAAAAA' },
    // Manage Account modal — a contained panel rather than a full-bleed
    // sheet. Everything else about its layout is Clerk's own and now that
    // our reset no longer overrides it (see index.css) it needs no help;
    // only the type scale is nudged to match the app.
    modalContent: { width: '100%', maxWidth: '800px' },
    navbar: { borderRight: '1px solid #2A2A2A' },
    navbarButton: { fontSize: '15px', fontWeight: '600' },
    navbarTitle: { fontSize: '20px', fontWeight: '700', letterSpacing: '0.02em' },
    navbarSubtitle: { fontSize: '13px', color: '#BBBBBB' },
    profileSectionTitleText: { fontSize: '15px', fontWeight: '600', color: '#E8E8E8' },
    profileSectionPrimaryButton: { fontSize: '14px', fontWeight: '600' },
    userPreviewMainIdentifier: { fontSize: '15px' },
    userPreviewSecondaryIdentifier: { fontSize: '13px', color: '#BBBBBB' },
    badge: { fontSize: '12px' },
  },
};

// Sign-in / sign-up card only — the squared-off, red-topped panel. Scoped to
// those two components so it can't reshape the account modal.
//
// Style objects, not Tailwind class strings: this app never imports
// Tailwind's stylesheet into index.css, so the plugin emits no utilities and
// every `!bg-[#E8002D]`/`w-[440px]` here was dead text that styled nothing.
// Anything the `variables` above already cover (primary/danger colour, input
// and card background, radius) is left to them rather than restated.
const authCardAppearance = {
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: {
      width: '440px',
      maxWidth: '100%',
      borderRadius: 0,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)',
    },
    card: {
      boxShadow: 'none',
      border: '1px solid #2A2A2A',
      borderTop: '2px solid #E8002D',
      borderRadius: 0,
      padding: 'var(--space-6)',
    },
    footer: { boxShadow: 'none', border: 0, borderRadius: 0 },
    headerTitle: { fontWeight: '700', fontSize: '22px' },
    headerSubtitle: { color: '#BBBBBB', fontSize: '14px' },
    socialButtonsBlockButtonText: { color: '#E8E8E8', fontWeight: '600' },
    socialButtonsBlockButtonArrow: { color: '#E8E8E8' },
    footerActionText: { color: '#BBBBBB' },
    logoBox: { marginBottom: 'var(--space-4)' },
    logoImage: { height: '48px' },
    socialButtons: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
    socialButtonsBlockButton: { backgroundColor: '#232323', border: '1px solid #3A3A3A', minHeight: '48px' },
    socialButtonsProviderIcon: { width: '20px', height: '20px' },
    formButtonPrimary: { minHeight: '48px' },
    formFieldInput: { minHeight: '48px', fontSize: '16px' },
  },
};

function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="dot-grid" style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 'var(--space-4)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 560,
        height: 560,
        background: 'radial-gradient(circle, var(--red-glow) 0%, transparent 70%)',
        opacity: 0.45,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthPageShell>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={authCardAppearance}
      />
    </AuthPageShell>
  );
}

function SignUpPage() {
  return (
    <AuthPageShell>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        appearance={authCardAppearance}
      />
    </AuthPageShell>
  );
}

function LandingPage({ onGuest, onDemo }: { onGuest?: () => void; onDemo?: () => void }) {
  const [, setLocation] = useLocation();

  const featureCategories = [
    {
      Icon: Activity,
      title: 'Session & Performance Tracking',
      items: [
        { title: 'Companion App Auto-Logging', desc: 'Free desktop app reads live F1 25 telemetry and uploads sessions automatically.' },
        { title: 'Session History', desc: 'Searchable log of every session with automatic PB detection.' },
        { title: 'Progress Dashboard', desc: 'Activity heatmap plus stats on sessions, tracks, and PBs.' },
        { title: 'Progress Analytics', desc: 'PB progression charts and lap-time consistency graphs.' },
      ],
    },
    {
      Icon: Map,
      title: 'Track Knowledge',
      items: [
        { title: 'Track Bible', desc: 'All 24 F1 circuits with your stats and autosaving corner-by-corner notes.' },
      ],
    },
    {
      Icon: Settings2,
      title: 'Setup & Hardware',
      items: [
        { title: 'Setup Vault', desc: 'Save, organize, and compare car setups side-by-side.' },
        { title: 'Hardware Vault', desc: 'Store your wheel, pedal, and FFB hardware profiles.' },
      ],
    },
    {
      Icon: Bot,
      title: 'AI Coaching',
      items: [
        { title: 'AI Race Engineer', desc: 'Chat assistant that analyzes your sessions and coaches you — 3 free messages.' },
      ],
    },
    {
      Icon: Trophy,
      title: 'Community & Competition',
      items: [
        { title: 'Community Leaderboards', desc: 'Compare lap times against the community, per circuit.' },
        { title: 'Shared Setups', desc: 'Browse and import car setups shared by other drivers.' },
        { title: 'Rivals & Challenges', desc: 'Challenge players head-to-head to beat a lap time.' },
        // The landing page only advertises what a new driver will actually
        // find inside, so the achievement entries follow the flag.
        {
          title: 'Driver Profiles',
          desc: SHOW_ACHIEVEMENTS
            ? 'Public pages showing your PBs, achievements, and recent sessions.'
            : 'Public pages showing your PBs and recent sessions.',
        },
        ...(SHOW_ACHIEVEMENTS
          ? [{ title: 'Achievements', desc: 'Badges and milestones for consistency and progress.' }]
          : []),
      ],
    },
    {
      Icon: LayoutDashboard,
      title: 'Account',
      items: [
        {
          title: 'Account Dashboard',
          desc: SHOW_ACHIEVEMENTS
            ? 'Setups, PBs, and achievement progress, synced across devices.'
            : 'Setups and PBs, synced across devices.',
        },
      ],
    },
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
          Everything you need to log sessions, chase PBs, and master every circuit — all in one place.
        </p>
        <p className="landing-hero-platform">
          For F1 25 on Xbox, PlayStation, and PC — wheel or controller.
        </p>
        <div className="landing-cta-group">
          <button className="btn btn-primary" style={{ minWidth: 320, fontSize: 13, padding: '15px 28px' }} onClick={onDemo}>
            Try the Live Demo — Sample Data, No Sign Up →
          </button>
          <div className="landing-cta-row">
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onGuest}>
              Continue as Guest
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setLocation('/sign-up')}>
              Create Free Account
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setLocation('/sign-in')}>
              Sign In
            </button>
          </div>
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 'var(--space-2)', letterSpacing: '0.01em' }}>
          The demo loads a real sample race weekend — dashboard, session log, lap history — right in your browser. Nothing is saved to an account.
        </p>
      </div>

      {/* Feature Categories */}
      <div className="landing-features">
        <div className="landing-section-label">Everything you get, live today</div>
        <div className="landing-feature-categories">
          {featureCategories.map(cat => (
            <div key={cat.title} className="landing-feature-category">
              <div className="landing-feature-category-title">
                <cat.Icon size={16} aria-hidden="true" />
                {cat.title}
              </div>
              <ul className="landing-feature-list">
                {cat.items.map(item => (
                  <li key={item.title} className="landing-feature-item">
                    <span className="landing-feature-item-title">{item.title}</span>
                    <span className="landing-feature-item-desc"> — {item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Browse Links */}
      <div className="landing-browse">
        <div className="landing-section-label">Browse without an account</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/community')}>
            Community
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/tracks')}>
            Circuit Guide
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setLocation('/download')}>
            ↓ Download Companion App
          </button>
        </div>
      </div>

      <div className="landing-footer">
        <Footer />
      </div>
    </div>
  );
}

const PROTECTED_PAGES = ['setups', 'hardware', 'progress', 'engineer', 'companion', 'account', 'leagues'];

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
  companion: 'Companion App Sync',
  account: 'Account',
  leagues: 'League Admin',
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
  companion: {
    bullets: [
      'Auto-upload sessions straight from F1 24/25/26 and Assetto Corsa',
      'Generate an API key to connect the desktop companion app',
      'Never manually log a lap time again',
    ],
  },
  leagues: {
    bullets: [
      'Run a league and get a leaderboard across your whole grid',
      "See who's actually practising between rounds — sessions, laps, seat time",
      'Invite drivers with a code and manage the roster',
    ],
  },
  account: {
    bullets: [
      'Manage your profile and connected devices',
      'See your usage across the Race Engineer and companion app',
      'Keep everything synced across your devices',
    ],
  },
};

function GuestWall({ page, onSignIn }: { page: string; onSignIn: () => void }) {
  const unlocks = PAGE_UNLOCKS[page];
  return (
    <div className="guest-wall">
      <div className="guest-wall-card">
        <div className="guest-wall-eyebrow">Free Account Required</div>
        <div className="guest-wall-title">Unlock your {PAGE_LABELS[page] || page}</div>
        <p className="guest-wall-lede">
          Create a free account — no credit card, no waiting. Everything syncs across your devices automatically.
        </p>
        {unlocks && (
          <div className="guest-wall-bullets">
            {unlocks.bullets.map(b => (
              <div key={b} className="guest-wall-bullet">
                <span>✓</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}
        <div className="guest-wall-actions">
          <button className="btn btn-primary btn-lg" onClick={onSignIn}>
            Create Free Account
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onSignIn}>
            Already have an account? Sign in →
          </button>
        </div>
      </div>
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
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--teal)',
      boxShadow: 'var(--shadow-pop)',
      padding: 'var(--space-4) var(--space-5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      flexWrap: 'wrap',
      zIndex: 800,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', letterSpacing: '0.12em', color: 'var(--teal)', marginBottom: 'var(--space-1)', textTransform: 'uppercase' }}>
          You've been exploring F1 Sim Hub
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', lineHeight: 1.5 }}>
          Create a free account to <strong style={{ color: 'var(--white)' }}>log sessions, save setups, and track your PBs</strong> across every device.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
        <button
          className="btn btn-ghost"
          onClick={onDismiss}
        >
          Maybe Later
        </button>
        <button
          className="btn btn-primary"
          onClick={onSignIn}
          style={{ whiteSpace: 'nowrap' }}
        >
          Create Free Account
        </button>
      </div>
    </div>
  );
}

function DemoBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="demo-banner">
      <span>
        <strong>Live Demo</strong> — you're viewing sample telemetry, not a real account. Nothing you do here is saved.
      </span>
      <button
        className="btn btn-secondary btn-sm"
        onClick={onSignIn}
        style={{ whiteSpace: 'nowrap' }}
      >
        Create Free Account →
      </button>
    </div>
  );
}

function MainApp({ isGuest, isDemo, onSignIn, initialPage, initialTrackId }: { isGuest?: boolean; isDemo?: boolean; onSignIn?: () => void; initialPage?: string; initialTrackId?: string }) {
  const [page, setPage] = useState(initialPage ?? 'dashboard');

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

  const showNudge = isGuest && !isDemo && (pageViews >= 3 || timeReached) && !nudgeDismissed;

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
      case 'dashboard': return <Dashboard setPage={handleSetPage} isGuest={isGuest} />;
      case 'sessions': return <Sessions isGuest={isGuest} />;
      case 'tracks': return <Tracks isGuest={isGuest} initialTrackId={initialTrackId} />;
      case 'setups': return <Setups />;
      case 'hardware': return <HardwareVault />;
      case 'progress': return <Progress setPage={handleSetPage} />;
      case 'engineer': return <RaceEngineer />;
      case 'community': return <Community isGuest={isGuest} />;
      // 'rivals' is Community opened straight onto its Rivals tab, so the
      // Dashboard shortcut and the notification badge have somewhere to go
      // without Rivals becoming a second page that duplicates the tab.
      case 'rivals': return <Community isGuest={isGuest} initialTab="rivals" />;
      case 'leagues': return <Leagues />;
      case 'companion': return <Companion />;
      case 'account': return <Account setPage={handleSetPage} />;
      default: return <Dashboard setPage={handleSetPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={handleSetPage} />
      <main className="main-content">
        {isDemo && <DemoBanner onSignIn={onSignIn ?? (() => {})} />}
        {renderPage()}
      </main>
      {showNudge && (
        <GuestNudge
          onSignIn={onSignIn ?? (() => {})}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}

// `initialPage` is how the public deep links (/community, /tracks, /log) land
// directly on a page instead of on the landing screen. They used to be separate
// standalone components with their own trimmed-down copies of the same data;
// now they're just entry points into the one app shell.
function HomeRoute({ initialPage, initialTrackId }: { initialPage?: string; initialTrackId?: string }) {
  const [isGuest, setIsGuest] = useState(!!initialPage);
  const [isDemo, setIsDemo] = useState(false);
  const [, setLocation] = useLocation();

  const handleDemo = () => {
    enterDemoMode(buildSampleSessions());
    setIsDemo(true);
    setIsGuest(true);
  };

  const handleSignIn = () => {
    exitDemoMode();
    setIsDemo(false);
    setIsGuest(false);
    setLocation('/sign-in');
  };

  return (
    <>
      <Show when="signed-in">
        <GuestSessionMigrator />
        <MainApp initialPage={initialPage} initialTrackId={initialTrackId} />
      </Show>
      <Show when="signed-out">
        {isGuest
          ? <MainApp isGuest isDemo={isDemo} onSignIn={handleSignIn} initialPage={initialPage} initialTrackId={initialTrackId} />
          : <LandingPage onGuest={() => setIsGuest(true)} onDemo={handleDemo} />
        }
      </Show>
    </>
  );
}

// /log used to be its own Quick Log screen with a parallel, cut-down copy of
// the session form. It now opens the real log form on the Sessions page, so
// there is exactly one way to log a lap.
function LogRedirect() {
  useState(() => {
    try { sessionStorage.setItem(OPEN_LOG_KEY, '1'); } catch { /* storage unavailable — form just opens blank */ }
  });
  return <HomeRoute initialPage="sessions" />;
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
          <Route path="/">{() => <HomeRoute />}</Route>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          {/* /setups and /leaderboard were standalone public pages duplicating
              what Community already showed signed-in. They now land on the one
              Community surface. */}
          <Route path="/community">{() => <HomeRoute initialPage="community" />}</Route>
          <Route path="/leagues">{() => <HomeRoute initialPage="leagues" />}</Route>
          <Route path="/setups">{() => <Redirect to="/community" />}</Route>
          <Route path="/leaderboard">{() => <Redirect to="/community" />}</Route>
          <Route path="/tracks">{() => <HomeRoute initialPage="tracks" />}</Route>
          {/* Every circuit has its own address so track pages can be linked
              and shared. */}
          <Route path="/tracks/:trackId">{(params) => <HomeRoute initialPage="tracks" initialTrackId={params.trackId} />}</Route>
          <Route path="/download">{() => <DownloadPage />}</Route>
          <Route path="/log">{() => <LogRedirect />}</Route>
          <Route path="/driver/:username">{(params) => <DriverProfile username={params.username} />}</Route>
          <Route>{() => <HomeRoute />}</Route>
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
          padding: 'var(--space-5)',
          fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#111',
            border: '1px solid #E8002D',
            padding: 'var(--space-6) var(--space-7)',
            maxWidth: 520,
            width: '100%',
          }}>
            <div style={{ color: '#E8002D', fontSize: 12, letterSpacing: '0.12em', marginBottom: 'var(--space-4)' }}>
              CONFIGURATION ERROR
            </div>
            <div style={{ color: '#F0F0F0', fontSize: 15, marginBottom: 'var(--space-5)', lineHeight: 1.6 }}>
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
      <ThemeProvider>
        <UnitsProvider>
          <ClerkProviderWithRoutes />
        </UnitsProvider>
      </ThemeProvider>
    </WouterRouter>
  );
}
