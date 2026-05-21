import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp } from 'lucide-react';

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

export default function Nav({ page, setPage }: NavProps) {
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
    </nav>
  );
}
