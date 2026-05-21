import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp, LogOut } from 'lucide-react';
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
  { id: 'progress', label: 'Progress', Icon: TrendingUp },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Nav({ page, setPage }: NavProps) {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <nav className="nav-sidebar">
      <div className="nav-logo">
        <div className="nav-logo-title">Sim Racing HQ</div>
        <div className="nav-logo-sub">Driver Dashboard</div>
      </div>
      <ul className="nav-links">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <li key={id}>
            <div
              className={`nav-link${page === id ? ' active' : ''}`}
              onClick={() => setPage(id)}
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
  );
}
