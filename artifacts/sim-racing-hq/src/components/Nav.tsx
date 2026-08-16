import { useState, useMemo } from 'react';
import { LayoutDashboard, ClipboardList, Map, Settings2, TrendingUp, LogOut, Menu, X, Cpu, Users, User, Zap, Headphones, Trophy, Lock, Flame } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { useGetSessions } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { useRivalNotifications } from '../lib/rivalNotifications';
import { calculateStreak, calculateRank, getRankColor, getRankProgress, estimateSeatTimeMinutes } from '../lib/engagement';

interface NavProps {
  page: string;
  setPage: (p: string) => void;
}

// Rivals is no longer its own destination — it lives as a tab inside Community,
// which already carried a 'challenges' tab covering the same head-to-head idea.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, authRequired: false },
  { id: 'tracks', label: 'Tracks', Icon: Map, authRequired: false },
  { id: 'sessions', label: 'Sessions', Icon: ClipboardList, authRequired: false },
  { id: 'progress', label: 'Progress', Icon: TrendingUp, authRequired: true },
  { id: 'setups', label: 'Setups', Icon: Settings2, authRequired: true },
  { id: 'hardware', label: 'Hardware', Icon: Cpu, authRequired: true },
  { id: 'engineer', label: 'Race Engineer', Icon: Headphones, authRequired: true },
  { id: 'companion', label: 'Companion', Icon: Zap, authRequired: true },
  { id: 'community', label: 'Community', Icon: Users, authRequired: false },
  { id: 'account', label: 'Account', Icon: User, authRequired: true },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Nav({ page, setPage }: NavProps) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: sessions = [] } = useGetSessions();
  const pendingRivalChallenges = useRivalNotifications().count;
  const [open, setOpen] = useState(false);

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

  function navigate(id: string) {
    setPage(id);
    setOpen(false);
  }

  const rawName = user?.firstName ?? user?.username ?? 'Driver';
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
  const avatarUrl = user?.imageUrl ?? null;

  // Seat time and favourite track are secondary detail — one muted line
  // spanning the card, rather than two stacked mono rows competing with the
  // name. Long circuit names still get a tooltip with the full text.
  const profileStats = [
    seatTimeHours > 0 ? `${seatTimeHours}h seat time` : null,
    favTrack ? `Fav ${favTrack}` : null,
  ].filter(Boolean).join(' · ');
  const profileStatsFull = [
    seatTimeHours > 0 ? `${seatTimeHours} hours of seat time` : null,
    favTrack ? `Most driven: ${favTrack}` : null,
  ].filter(Boolean).join(' · ');

  // Rank progress for ring
  const { pct: progressToNext } = getRankProgress(rankInfo);
  const ringCircum = 2 * Math.PI * 15;
  const ringOffset = ringCircum - (progressToNext / 100) * ringCircum;

  return (
    <>
      <div className="mobile-topbar">
        <button
          className="nav-hamburger"
          aria-label={
            pendingRivalChallenges > 0
              ? `Open navigation — ${pendingRivalChallenges} rival challenge${pendingRivalChallenges === 1 ? '' : 's'} waiting on you`
              : 'Open navigation'
          }
          onClick={() => setOpen(true)}
          style={{ position: 'relative' }}
        >
          <Menu size={20} />
          {/* The sidebar badge is invisible on mobile until the menu is
              opened, so the count rides on the hamburger too. */}
          {user && pendingRivalChallenges > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 4px',
                borderRadius: 8, background: 'var(--red)', color: 'var(--on-accent)',
                fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center',
                justifyContent: 'center', lineHeight: 1,
              }}
            >
              {pendingRivalChallenges}
            </span>
          )}
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
            // 'rivals' is Community with its Rivals tab pre-opened, so it
            // lights up the Community item rather than nothing at all.
            const isActive = page === id || (id === 'community' && page === 'rivals');
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`nav-link${isActive ? ' active' : ''}${isLocked ? ' nav-link--locked' : ''}`}
                  onClick={() => navigate(id)}
                  title={isLocked ? 'Sign in required' : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  style={isLocked ? { opacity: 0.55 } : undefined}
                >
                  <Icon className="nav-icon" size={16} />
                  {label}
                  {id === 'community' && user && pendingRivalChallenges > 0 && (
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
        <button
          type="button"
          className="nav-profile-card"
          onClick={() => navigate('account')}
          title="View your account"
        >
          <div className="nav-profile-top">
            <div className="nav-profile-avatar-ring">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="2" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={getRankColor(rankInfo.rank)} strokeWidth="2"
                  strokeDasharray={ringCircum} strokeDashoffset={ringOffset} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
              </svg>
              {avatarUrl ? (
                <img className="nav-profile-avatar" src={avatarUrl} alt="" />
              ) : (
                <div className="nav-profile-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="nav-profile-info">
              <div className="nav-profile-name">{displayName}</div>
              {/* Rank and streak share one row — two status chips stacked on
                  separate lines read as two unrelated claims about the driver. */}
              <div className="nav-profile-meta">
                <span className="nav-profile-rank" style={{ color: getRankColor(rankInfo.rank) }}>
                  {rankInfo.rank}
                </span>
                {streak > 0 && (
                  <span className="nav-profile-streak" title={`${streak} day streak`}>
                    <Flame size={10} aria-hidden="true" />
                    {streak}d
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Full card width, not the ~150px left over beside the avatar —
              beside it, "Fav Austria" clipped to "Fav Aus…". */}
          {profileStats && (
            <div className="nav-profile-stats" title={profileStatsFull}>{profileStats}</div>
          )}
        </button>

        {/* Units and theme are set-once preferences — they live in
            Account → Preferences rather than taking permanent sidebar space
            on every page. Sign Out is all that's left down here. */}
        <div className="nav-footer">
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
