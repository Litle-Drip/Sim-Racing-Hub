import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp, LogOut, Menu, X, Cpu, Users, Sun, Moon, User } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { useGetSessions } from '@workspace/api-client-react';
import { calculateStreak, calculateRank, getRankColor } from '../lib/engagement';

interface NavProps {
  page: string;
  setPage: (p: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', Icon: ClipboardList },
  { id: 'tracks', label: 'Tracks', Icon: Map },
  { id: 'setups', label: 'Setups', Icon: Settings2 },
  { id: 'hardware', label: 'Hardware', Icon: Cpu },
  { id: 'progress', label: 'Progress', Icon: TrendingUp },
  { id: 'community', label: 'Community', Icon: Users },
  { id: 'account', label: 'Account', Icon: User },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Nav({ page, setPage }: NavProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: sessions = [] } = useGetSessions();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark');

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  function navigate(id: string) {
    setPage(id);
    setOpen(false);
  }

  const displayName = user?.firstName ?? user?.username ?? 'Driver';

  return (
    <>
      <button
        className="nav-hamburger"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          className="nav-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <nav className={`nav-sidebar${open ? ' nav-sidebar--open' : ''}`}>
        <div className="nav-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="nav-logo-title">F1 Sim Hub</div>
              <div className="nav-logo-sub">Driver Dashboard</div>
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
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <li key={id}>
              <div
                className={`nav-link${page === id ? ' active' : ''}`}
                onClick={() => navigate(id)}
              >
                <Icon className="nav-icon" size={16} />
                {label}
              </div>
            </li>
          ))}
        </ul>

        {/* Profile Card */}
        <div className="nav-profile-card" onClick={() => navigate('account')} style={{ cursor: 'pointer' }}>
          <div className="nav-profile-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="nav-profile-info">
            <div className="nav-profile-name">{displayName}</div>
            <div className="nav-profile-rank" style={{ color: getRankColor(rankInfo.rank) }}>
              {rankInfo.rank}
            </div>
            {streak > 0 && (
              <div className="nav-profile-streak">🔥 {streak} day streak</div>
            )}
          </div>
        </div>

        <div style={{
          padding: '10px 20px 16px',
          borderTop: '1px solid var(--border)',
        }}>
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
