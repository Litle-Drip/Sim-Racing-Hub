import { useState, useEffect, useRef } from 'react';
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
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <div style={{ width: 5, height: 10, background: 'var(--red)' }} />
            <div style={{ width: 5, height: 16, background: 'var(--red)' }} />
            <div style={{ width: 5, height: 22, background: 'var(--red)' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.12em', color: 'var(--white)', margin: 0 }}>
            SIM RACING HQ
          </h1>
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--gray-light)', marginBottom: 12, lineHeight: 1.6 }}>
          Your personal sim racing performance hub.
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-mid)', marginBottom: 40, lineHeight: 1.6 }}>
          Log sessions, track your PBs, store setups, and analyze your progress — all in one place, synced across every device.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            style={{ minWidth: 140, fontSize: 14 }}
            onClick={() => setLocation('/sign-up')}
          >
            Get Started
          </button>
          <button
            className="btn btn-secondary"
            style={{ minWidth: 140, fontSize: 14 }}
            onClick={() => setLocation('/sign-in')}
          >
            Sign In
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--gray-mid)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            onClick={onGuest}
          >
            Browse as Guest
          </button>
        </div>
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

function MainApp({ isGuest, onSignIn }: { isGuest?: boolean; onSignIn?: () => void }) {
  const [page, setPage] = useState('dashboard');

  const renderPage = () => {
    if (isGuest && PROTECTED_PAGES.includes(page)) {
      return <GuestWall page={page} onSignIn={onSignIn ?? (() => {})} />;
    }
    switch (page) {
      case 'dashboard': return <Dashboard setPage={setPage} />;
      case 'sessions': return <Sessions />;
      case 'tracks': return <Tracks />;
      case 'setups': return <Setups />;
      case 'hardware': return <HardwareVault />;
      case 'progress': return <Progress />;
      case 'community': return <Community />;
      default: return <Dashboard setPage={setPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={setPage} />
      <main className="main-content">
        {renderPage()}
      </main>
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
            subtitle: 'Sign in to access your driver dashboard',
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
