import { useState, useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import Nav from './components/Nav';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Tracks from './pages/Tracks';
import Setups from './pages/Setups';
import Progress from './pages/Progress';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
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
    colorMutedForeground: '#888888',
    colorDanger: '#E8002D',
    colorBackground: '#111111',
    colorInput: '#1A1A1A',
    colorInputForeground: '#F0F0F0',
    colorNeutral: '#2A2A2A',
    fontFamily: "'Rajdhani', sans-serif",
    borderRadius: '4px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'rounded-none w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border !border-[#1E1E1E] !bg-[#111111] !rounded-none',
    footer: '!shadow-none !border-0 !bg-[#111111] !rounded-none',
    headerTitle: 'text-[#F0F0F0] font-bold',
    headerSubtitle: 'text-[#888888]',
    socialButtonsBlockButtonText: 'text-[#F0F0F0]',
    formFieldLabel: 'text-[#AAAAAA]',
    footerActionLink: 'text-[#E8002D] hover:text-[#E8002D]',
    footerActionText: 'text-[#888888]',
    dividerText: 'text-[#555555]',
    identityPreviewEditButton: 'text-[#E8002D]',
    formFieldSuccessText: 'text-[#39B54A]',
    alertText: 'text-[#F0F0F0]',
    logoBox: 'mb-2',
    logoImage: 'h-10',
    socialButtonsBlockButton: '!border-[#2A2A2A] !bg-[#1A1A1A] hover:!bg-[#222222]',
    formButtonPrimary: '!bg-[#E8002D] hover:!bg-[#c0001e]',
    formFieldInput: '!bg-[#1A1A1A] !border-[#2A2A2A] !text-[#F0F0F0]',
    footerAction: 'bg-[#111111]',
    dividerLine: 'bg-[#1E1E1E]',
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

function LandingPage() {
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
      </div>
    </div>
  );
}

function MainApp() {
  const [page, setPage] = useState('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard setPage={setPage} />;
      case 'sessions': return <Sessions />;
      case 'tracks': return <Tracks />;
      case 'setups': return <Setups />;
      case 'progress': return <Progress />;
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
  return (
    <>
      <Show when="signed-in">
        <MainApp />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
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
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
