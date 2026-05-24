import { useState } from 'react';
import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp, LogOut, Menu, X, Cpu, Users } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';

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
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Nav({ page, setPage }: NavProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  function navigate(id: string) {
    setPage(id);
    setOpen(false);
  }

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
        <div style={{
          marginTop: 'auto',
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
        }}>
          {user && (
            <div style={{
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              color: 'var(--gray-mid)',
              marginBottom: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {user.primaryEmailAddress?.emailAddress ?? user.firstName ?? 'Driver'}
            </div>
          )}
          <button
            onClick={() => signOut({ redirectUrl: basePath || '/' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              color: 'var(--gray)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              padding: 0,
              width: '100%',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray)')}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}
