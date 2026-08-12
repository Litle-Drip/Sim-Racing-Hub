import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp, LogOut, Menu, X, Cpu, Users, Sun, Moon, User, Zap, Headphones, Trophy, Swords, Lock, Flame } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { useGetSessions, useGetRivalChallenges } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { calculateStreak, calculateRank, getRankColor, getRankProgress, estimateSeatTimeMinutes } from '../lib/engagement';
import { useUnits } from '../lib/units';

interface NavProps {
  page: string;
  setPage: (p: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, authRequired: false },
  { id: 'tracks', label: 'Tracks', Icon: Map, authRequired: false },
  { id: 'sessions', label: 'Sessions', Icon: ClipboardList, authRequired: false },
  { id: 'progress', label: 'Progress', Icon: TrendingUp, authRequired: true },
  { id: 'setups', label: 'Setups', Icon: Settings2, authRequired: true },
  { id: 'hardware', label: 'Hardware', Icon: Cpu, authRequired: true },
  { id: 'engineer', label: 'Race Engineer', Icon: Headphones, authRequired: true },
  { id: 'rivals', label: 'Rivals', Icon: Swords, authRequired: true },
  { id: 'companion', label: 'Companion', Icon: Zap, authRequired: true },
  { id: 'community', label: 'Community', Icon: Users, authRequired: false },
  { id: 'account', label: 'Account', Icon: User, authRequired: true },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Nav({ page, setPage }: NavProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: sessions = [] } = useGetSessions();
  const { data: rivalChallenges = [] } = useGetRivalChallenges();
  const pendingRivalChallenges = useMemo(
    () => rivalChallenges.filter(c => c.status === 'pending' && c.opponent.isMe).length,
    [rivalChallenges],
  );
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark');
  const { system, setSystem } = useUnits();

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);

  const seatTimeHours = useMemo(() => Math.floor(estimateSeatTimeMinutes(sessions) / 60), [sessions]);
  const favTrack = useMemo(() => {
    if (sessions.length === 0) return null;
    const counts: Record<string, number> = {};
    sessions.forEach(s => { counts[s.trackId] = (counts[s.trackId] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return F1_TRACKS.find(t => t.id === top[0])?.short ?? top[0];
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  function navigate(id: string) {
    setPage(id);
    setOpen(false);
  }

  const rawName = user?.firstName ?? user?.username ?? 'Driver';
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

  // Rank progress for ring
  const { pct: progressToNext } = getRankProgress(rankInfo);
  const ringCircum = 2 * Math.PI * 15;
  const ringOffset = ringCircum - (progressToNext / 100) * ringCircum;

  return (
    <>
      <div className="mobile-topbar">
        <button
          className="nav-hamburger"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
      </div>

      {open && (
        <div
          className="nav-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <nav className={`nav-sidebar${open ? ' nav-sidebar--open' : ''}`}>
        <div className="nav-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Trophy size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <div>
                <div className="nav-logo-title">F1 Sim Hub</div>
                <div className="nav-logo-sub">Telemetry &amp; Performance</div>
              </div>
            </div>
            <button
              className="nav-close"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <ul className="nav-links">
          {NAV_ITEMS.map(({ id, label, Icon, authRequired }) => {
            const isLocked = !user && authRequired;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`nav-link${page === id ? ' active' : ''}${isLocked ? ' nav-link--locked' : ''}`}
                  onClick={() => navigate(id)}
                  title={isLocked ? 'Sign in required' : undefined}
                  aria-current={page === id ? 'page' : undefined}
                  style={isLocked ? { opacity: 0.55 } : undefined}
                >
                  <Icon className="nav-icon" size={16} />
                  {label}
                  {id === 'rivals' && !isLocked && pendingRivalChallenges > 0 && (
                    <span style={{
                      marginLeft: 'auto', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                      background: 'var(--red)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}>
                      {pendingRivalChallenges}
                    </span>
                  )}
                  {isLocked && <Lock className="nav-lock" size={12} aria-label="Sign in required" />}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Profile Card */}
        <div className="nav-profile-card" onClick={() => navigate('account')} style={{ cursor: 'pointer' }}>
          <div className="nav-profile-avatar-ring">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="2" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={getRankColor(rankInfo.rank)} strokeWidth="2"
                strokeDasharray={ringCircum} strokeDashoffset={ringOffset} strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            </svg>
            <div className="nav-profile-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="nav-profile-info">
            <div className="nav-profile-name">{displayName}</div>
            <div className="nav-profile-rank" style={{ color: getRankColor(rankInfo.rank) }}>
              {rankInfo.rank}
            </div>
            {streak > 0 && (
              <div className="nav-profile-streak">
                <Flame size={11} aria-hidden="true" />
                {streak} day streak
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gray)', marginTop: 1, lineHeight: 1.3 }}>
              {seatTimeHours > 0 && <span>{seatTimeHours}h seat time</span>}
              {favTrack && <span style={{ display: 'block' }}>Fav: {favTrack}</span>}
            </div>
          </div>
        </div>

        <div style={{
          padding: '6px 20px 14px',
        }}>
          <div
            className="units-toggle"
            role="group"
            aria-label="Unit system"
            title="Switch speed/temperature units"
          >
            <button
              className={`units-toggle-btn${system === 'us' ? ' active' : ''}`}
              onClick={() => setSystem('us')}
            >
              US <span className="units-toggle-sub">mph · °F</span>
            </button>
            <button
              className={`units-toggle-btn${system === 'uk' ? ' active' : ''}`}
              onClick={() => setSystem('uk')}
            >
              UK <span className="units-toggle-sub">mph · °C</span>
            </button>
          </div>
          <button
            onClick={toggleTheme}
            className="nav-footer-btn"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={() => signOut({ redirectUrl: basePath || '/' })}
            className="nav-footer-btn nav-footer-btn--danger"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}
