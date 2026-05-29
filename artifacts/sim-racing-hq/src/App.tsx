import { useState, useEffect, useRef, useCallback } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { setAuthTokenGetter } from '@workspace/api-client-react';
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
import Community from './pages/Community';
import PublicSetups from './pages/PublicSetups';
import PublicTracks from './pages/PublicTracks';
import PublicLeaderboard from './pages/PublicLeaderboard';
import QuickLog from './pages/QuickLog';
import DriverProfile from './pages/DriverProfile';

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
    socialButtonsBlockButton: { backgroundColor: '#232323', border: '1px solid #3A3A3A' },
    formButtonPrimary: '!bg-[#E8002D] hover:!bg-[#c0001e]',
    formFieldInput: '!bg-[#1A1A1A] !border-[#2A2A2A] !text-[#F0F0F0]',
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
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div style={{ padding: '80px 24px 60px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <div style={{ width: 6, height: 12, background: 'var(--red)' }} />
            <div style={{ width: 6, height: 20, background: 'var(--red)' }} />
            <div style={{ width: 6, height: 28, background: 'var(--red)' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '0.12em', color: 'var(--white)', margin: 0 }}>
            F1 SIM HUB
          </h1>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 16, lineHeight: 1.4 }}>
          Your personal F1 sim racing companion
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--gray-light)', marginBottom: 8, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 8px' }}>
          Log sessions, track your PBs, build and share setups, and master every circuit on the F1 25 calendar.
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-mid)', marginBottom: 36, lineHeight: 1.6 }}>
          For F1 25 on Xbox, PlayStation, and PC — wheel or controller.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" style={{ minWidth: 280, fontSize: 16, padding: '16px 28px' }} onClick={onGuest}>
            Continue as Guest — No Sign Up Required
          </button>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" style={{ minWidth: 140, fontSize: 13 }} onClick={() => setLocation('/sign-up')}>
              Create Free Account
            </button>
            <button className="btn btn-secondary" style={{ minWidth: 140, fontSize: 13 }} onClick={() => setLocation('/sign-in')}>
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* What You Get */}
      <div style={{ padding: '48px 24px', maxWidth: 840, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gray-mid)', textAlign: 'center', marginBottom: 32 }}>
          Everything you need to get faster
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {features.map(f => (
            <div key={f.title} className="card" style={{ padding: '20px', textAlign: 'left' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Public Links */}
      <div style={{ padding: '32px 24px 48px', maxWidth: 840, margin: '0 auto', textAlign: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 20 }}>
          Browse without an account
        </h3>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setLocation('/setups')}>
            Community Setups
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setLocation('/tracks')}>
            Circuit Guide
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setLocation('/leaderboard')}>
            Leaderboard
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
          F1 Sim Hub — Built for the sim racing community. Not affiliated with Formula 1 or Codemasters.
        </p>
      </div>
    </div>
  );
}

const PROTECTED_PAGES = ['sessions', 'setups', 'hardware', 'progress'];

const PAGE_LABELS: Record<string, string> = {
  sessions: 'Session Log',
  setups: 'Setup Vault',
  hardware: 'Hardware Vault',
  progress: 'PB Progression',
};

function GuestWall({ page, onSignIn }: { page: string; onSignIn: () => void }) {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: 24,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>
        Sign In Required
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--gray-light)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
        Create a free account to access your personal {PAGE_LABELS[page] || page}.
      </div>
      <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={onSignIn}>
        Sign In / Sign Up
      </button>
    </div>
  );
}

function GuestNudge({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{
      background: 'rgba(0,210,190,0.08)',
      border: '1px solid rgba(0,210,190,0.25)',
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.5 }}>
        You're browsing as a guest — <strong>create a free account</strong> to log sessions, save setups, and track your PBs across every device.
      </span>
      <button className="btn btn-primary" style={{ fontSize: 12, padding: '8px 18px', whiteSpace: 'nowrap' }} onClick={onSignIn}>
        Create Account
      </button>
    </div>
  );
}

const SHORTCUTS: Record<string, string> = {
  d: 'dashboard', n: 'sessions', t: 'tracks', s: 'setups', h: 'hardware', p: 'progress', c: 'community',
};

function MainApp({ isGuest, onSignIn }: { isGuest?: boolean; onSignIn?: () => void }) {
  const [page, setPage] = useState('dashboard');
  const [pageViews, setPageViews] = useState(0);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleSetPage = useCallback((p: string) => {
    setPage(p);
    setPageViews(v => v + 1);
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

  const showNudge = isGuest && pageViews >= 3 && !nudgeDismissed;

  const renderPage = () => {
    if (isGuest && PROTECTED_PAGES.includes(page)) {
      return <GuestWall page={page} onSignIn={onSignIn ?? (() => {})} />;
    }
    switch (page) {
      case 'dashboard': return <Dashboard setPage={handleSetPage} />;
      case 'sessions': return <Sessions />;
      case 'tracks': return <Tracks />;
      case 'setups': return <Setups />;
      case 'hardware': return <HardwareVault />;
      case 'progress': return <Progress />;
      case 'community': return <Community />;
      default: return <Dashboard setPage={handleSetPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={handleSetPage} />
      <main className="main-content">
        {showNudge && <GuestNudge onSignIn={onSignIn ?? (() => {})} />}
        {renderPage()}
      </main>

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
    );
  }

  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
