import { useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  ChevronLeft,
  Copy,
  Crown,
  Flag,
  Gauge,
  RefreshCw,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetLeagues,
  useCreateLeague,
  useJoinLeague,
  useGetLeague,
  useDeleteLeague,
  useRegenerateLeagueJoinCode,
  useUpdateLeagueMemberRole,
  useRemoveLeagueMember,
  useGetLeagueLeaderboard,
  useGetLeagueActivity,
  getGetLeaguesQueryKey,
  getGetLeagueQueryKey,
} from '@workspace/api-client-react';
import type {
  LeagueRecord,
  LeagueMemberRecord,
  LeagueActivityDriver,
} from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { formatLastActive } from '../lib/lastActive';
import { Toast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';

// Windows the two admin views offer. "All time" is leaderboard-only — an
// activity board over all time stops being a picture of who's practising now.
const LEADERBOARD_WINDOWS: Array<{ label: string; days: number | null }> = [
  { label: 'All time', days: null },
  { label: '30 days', days: 30 },
  { label: '7 days', days: 7 },
];
const ACTIVITY_WINDOWS: Array<{ label: string; days: number }> = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function trackLabel(id: string): string {
  const t = F1_TRACKS.find(t => t.id === id);
  return t ? `${t.flag} ${t.short}` : id;
}

function formatGap(gap: number | null | undefined): string {
  if (gap == null) return '—';
  if (gap === 0) return 'Leader';
  return `+${gap.toFixed(3)}`;
}

function formatSeatTime(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'owner') {
    return (
      <span className="badge badge-race" title="League owner">
        <Crown size={9} aria-hidden="true" style={{ marginRight: 3, verticalAlign: -1 }} />
        Owner
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="badge badge-qualifying" title="League admin">
        <Shield size={9} aria-hidden="true" style={{ marginRight: 3, verticalAlign: -1 }} />
        Admin
      </span>
    );
  }
  return <span className="badge badge-practice">Driver</span>;
}

function errorMessage(e: unknown, fallback: string): string {
  return (e as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

// ─── League list ─────────────────────────────────────────────────────────────

function LeagueCard({ league, onOpen }: { league: LeagueRecord; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="card card-pad"
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap',
        textAlign: 'left', cursor: 'pointer', width: '100%',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700,
            letterSpacing: '0.04em', color: 'var(--white)',
          }}>
            {league.name}
          </span>
          <RoleBadge role={league.role} />
        </div>
        {league.description && (
          <div className="card-text" style={{ marginTop: 'var(--space-1)' }}>{league.description}</div>
        )}
        <div className="card-note" style={{ marginTop: 'var(--space-1)' }}>
          {league.memberCount} driver{league.memberCount === 1 ? '' : 's'}
          {league.isStaff ? ' · Leaderboard and activity board unlocked' : ''}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--teal)', whiteSpace: 'nowrap' }}>
        {league.isStaff ? 'Open admin views →' : 'Open →'}
      </span>
    </button>
  );
}

function LeagueListPage({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: leagues = [], isLoading } = useGetLeagues();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetLeaguesQueryKey() });

  const fail = (fallback: string) => (e: unknown) => {
    setToastVariant('error');
    setToast(errorMessage(e, fallback));
  };

  const { mutate: createLeague, isPending: creating } = useCreateLeague({
    mutation: {
      onSuccess: (league) => {
        setName('');
        setDescription('');
        invalidate();
        setToastVariant('success');
        setToast(`${league.name} created — you're its owner`);
        onOpen(league.id);
      },
      onError: fail("Couldn't create that league"),
    },
  });

  const { mutate: joinLeague, isPending: joining } = useJoinLeague({
    mutation: {
      onSuccess: (league) => {
        setJoinCode('');
        invalidate();
        setToastVariant('success');
        setToast(`Joined ${league.name}`);
        onOpen(league.id);
      },
      onError: fail("Couldn't join with that code"),
    },
  });

  const staffLeagues = leagues.filter(l => l.isStaff);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leagues</h1>
          <div className="page-subtitle">
            Run a league here and you get the two views nobody else does: a league
            leaderboard, and a board showing who's actually putting in laps.
          </div>
        </div>
        {leagues.length > 0 && (
          <div className="page-header-meta">
            {leagues.length} league{leagues.length === 1 ? '' : 's'}
            {staffLeagues.length > 0 ? ` · ${staffLeagues.length} you run` : ''}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card card-pad card-text">Loading your leagues…</div>
      ) : leagues.length === 0 ? (
        <EmptyState
          icon={<Trophy size={40} />}
          headline="No leagues yet"
          subtext="Create one to get the admin leaderboard and practice-activity board for your grid, or join an existing league with its invite code."
        />
      ) : (
        <div className="card-stack" style={{ marginBottom: 'var(--space-6)' }}>
          {leagues.map(l => <LeagueCard key={l.id} league={l} onOpen={() => onOpen(l.id)} />)}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <form
          className="card card-pad"
          onSubmit={e => { e.preventDefault(); if (name.trim()) createLeague({ data: { name: name.trim(), description: description.trim() } }); }}
        >
          <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Start a league</div>
          <div className="form-stack">
            <div className="field">
              <label className="field-label" htmlFor="league-name">Name</label>
              <input
                id="league-name"
                value={name}
                maxLength={60}
                placeholder="Sunday Night GP"
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="league-desc">
                Description <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="league-desc"
                value={description}
                maxLength={300}
                placeholder="F1 25 · 50% races · Thursdays"
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create league'}
            </button>
          </div>
        </form>

        <form
          className="card card-pad"
          onSubmit={e => { e.preventDefault(); if (joinCode.trim()) joinLeague({ data: { joinCode: joinCode.trim().toUpperCase() } }); }}
        >
          <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Join with a code</div>
          <div className="form-stack">
            <div className="field">
              <label className="field-label" htmlFor="league-code">Invite code</label>
              <input
                id="league-code"
                value={joinCode}
                maxLength={20}
                placeholder="ABC123"
                style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
                onChange={e => setJoinCode(e.target.value)}
              />
            </div>
            {/* Said before joining, not buried in a settings page: the whole
                point of the league views is that staff can see this. */}
            <div className="card-note">
              League staff can see your practice activity — sessions, laps, seat
              time and your best lap per track. Your session notes, setups and
              telemetry stay private.
            </div>
            <button className="btn btn-secondary" type="submit" disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining…' : 'Join league'}
            </button>
          </div>
        </form>
      </div>

      {toast && <Toast message={toast} variant={toastVariant} onDone={() => setToast('')} />}
    </div>
  );
}

// ─── Admin view: leaderboard ─────────────────────────────────────────────────

function LeaderboardTab({ leagueId }: { leagueId: string }) {
  const [trackId, setTrackId] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);

  const { data, isLoading } = useGetLeagueLeaderboard(leagueId, {
    ...(trackId ? { trackId } : {}),
    ...(days ? { days } : {}),
  });

  const entries = data?.entries ?? [];
  const options = data?.trackOptions ?? [];
  const missing = data?.missing ?? [];
  const shownTrack = data?.trackId ?? null;

  if (isLoading) return <div className="card card-pad card-text">Loading the leaderboard…</div>;

  if (options.length === 0) {
    return (
      <EmptyState
        icon={<Flag size={40} />}
        headline="No laps logged yet"
        subtext="Once your drivers log sessions — by hand or through the companion app — their times rank here, track by track."
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label className="field-label" htmlFor="lb-track">Circuit</label>
          <select
            id="lb-track"
            value={shownTrack ?? ''}
            onChange={e => setTrackId(e.target.value)}
          >
            {options.map(o => (
              <option key={o.trackId} value={o.trackId}>
                {trackLabel(o.trackId)} — {o.drivers} driver{o.drivers === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Window</label>
          <div className="page-tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
            {LEADERBOARD_WINDOWS.map(w => (
              <button
                key={w.label}
                type="button"
                className={`page-tab${(days ?? null) === w.days ? ' page-tab--active' : ''}`}
                onClick={() => setDays(w.days)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-wrap-header">
          <span>{shownTrack ? trackLabel(shownTrack) : 'Leaderboard'}</span>
          <span className="page-header-meta">
            {entries.length} driver{entries.length === 1 ? '' : 's'} with a time
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th>Driver</th>
              <th>Best lap</th>
              <th>Gap</th>
              <th>Car</th>
              <th>Sessions</th>
              <th>Laps</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.userId}>
                <td>{i + 1}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--white)' }}>{e.username}</span>
                    {e.role !== 'member' && <RoleBadge role={e.role} />}
                  </div>
                </td>
                <td className="lap-time">{e.bestLap}</td>
                <td style={{ color: i === 0 ? 'var(--teal)' : 'var(--gray-light)' }}>{formatGap(e.gapToLeader)}</td>
                <td>{e.car}</td>
                <td>{e.sessions}</td>
                <td>{e.laps || '—'}</td>
                <td>{formatLastActive(e.lastDrivenAt)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={8} className="card-text">Nobody has set a time here in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The half of a leaderboard an organiser chasing a grid actually needs. */}
      {missing.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 'var(--space-4)' }}>
          <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>
            No time here yet — {missing.length} driver{missing.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {missing.map(m => (
              <span
                key={m.userId}
                className="badge badge-practice"
                title={`Last on ${formatLastActive(m.lastActiveAt).toLowerCase()}`}
              >
                {m.username}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Admin view: who's actually practising ───────────────────────────────────

function ActivityBars({ daily }: { daily: Array<{ date: string; sessions: number }> }) {
  const peak = Math.max(1, ...daily.map(d => d.sessions));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 72 }}>
      {daily.map(d => (
        <div
          key={d.date}
          title={`${d.date} — ${d.sessions} session${d.sessions === 1 ? '' : 's'}`}
          style={{
            flex: 1,
            minWidth: 2,
            height: `${Math.max(2, (d.sessions / peak) * 100)}%`,
            background: d.sessions > 0 ? 'var(--teal)' : 'var(--border)',
            opacity: d.sessions > 0 ? 0.35 + 0.65 * (d.sessions / peak) : 1,
          }}
        />
      ))}
    </div>
  );
}

function DriverActivityRow({ driver, days }: { driver: LeagueActivityDriver; days: number }) {
  const dormant = driver.sessions === 0;
  return (
    <tr style={dormant ? { opacity: 0.62 } : undefined}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--white)' }}>{driver.username}</span>
          {driver.role !== 'member' && <RoleBadge role={driver.role} />}
        </div>
      </td>
      <td>{dormant ? <span style={{ color: 'var(--red)' }}>No sessions</span> : driver.sessions}</td>
      <td>{driver.laps || '—'}</td>
      <td>{formatSeatTime(driver.seatTimeMinutes)}</td>
      <td>{driver.daysActive ? `${driver.daysActive}/${days}` : '—'}</td>
      <td>{driver.tracks || '—'}</td>
      <td>
        {driver.bestLap
          ? <><span className="lap-time">{driver.bestLap}</span>{driver.bestLapTrackId ? ` · ${trackLabel(driver.bestLapTrackId)}` : ''}</>
          : '—'}
      </td>
      <td>{formatLastActive(driver.lastActiveAt)}</td>
    </tr>
  );
}

function ActivityTab({ leagueId }: { leagueId: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useGetLeagueActivity(leagueId, { days });

  const drivers = data?.drivers ?? [];
  const totals = data?.totals;

  const tiles = useMemo(() => ([
    { label: 'Driving', value: totals ? `${totals.activeDrivers}/${totals.members}` : '—', micro: `drivers with a session in ${days} days` },
    { label: 'Sessions', value: totals ? String(totals.sessions) : '—', micro: 'logged across the league' },
    { label: 'Laps', value: totals ? String(totals.laps) : '—', micro: 'completed in the window' },
    { label: 'Seat time', value: totals ? formatSeatTime(totals.seatTimeMinutes) : '—', micro: 'estimated from lap times' },
  ]), [totals, days]);

  if (isLoading) return <div className="card card-pad card-text">Loading the activity board…</div>;

  return (
    <>
      <div className="page-tabs" style={{ borderBottom: 'none' }}>
        {ACTIVITY_WINDOWS.map(w => (
          <button
            key={w.days}
            type="button"
            className={`page-tab${days === w.days ? ' page-tab--active' : ''}`}
            onClick={() => setDays(w.days)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="stat-grid">
        {tiles.map(t => (
          <div key={t.label} className="stat-card">
            <div className="stat-label">{t.label}</div>
            <div className="stat-value">{t.value}</div>
            <div className="stat-micro">{t.micro}</div>
          </div>
        ))}
      </div>

      {data && data.daily.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Sessions per day</div>
          <ActivityBars daily={data.daily} />
          <div className="card-note" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
            <span>{data.daily[0]?.date}</span>
            <span>{data.daily[data.daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-wrap-header">
          <span>Practice by driver</span>
          {totals && totals.dormantDrivers > 0 && (
            <span className="page-header-meta">
              {totals.dormantDrivers} driver{totals.dormantDrivers === 1 ? '' : 's'} haven't driven in {days} days
            </span>
          )}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Sessions</th>
              <th>Laps</th>
              <th>Seat time</th>
              <th>Days on</th>
              <th>Tracks</th>
              <th>Best lap</th>
              <th>Last on</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => <DriverActivityRow key={d.userId} driver={d} days={days} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Roster ──────────────────────────────────────────────────────────────────

function RosterTab({
  league,
  members,
  onChanged,
  onToast,
}: {
  league: LeagueRecord;
  members: LeagueMemberRecord[];
  onChanged: () => void;
  onToast: (message: string, variant: 'success' | 'error') => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const isOwner = league.role === 'owner';

  const fail = (fallback: string) => (e: unknown) => {
    setBusyId(null);
    onToast(errorMessage(e, fallback), 'error');
  };

  const { mutate: updateRole } = useUpdateLeagueMemberRole({
    mutation: {
      onSuccess: () => { setBusyId(null); onChanged(); onToast('Role updated', 'success'); },
      onError: fail("Couldn't change that role"),
    },
  });

  const { mutate: removeMember } = useRemoveLeagueMember({
    mutation: {
      onSuccess: () => { setBusyId(null); onChanged(); onToast('Driver removed from the league', 'success'); },
      onError: fail("Couldn't remove that driver"),
    },
  });

  return (
    <div className="card-stack">
      {members.map(m => {
        const isTheOwner = m.userId === league.ownerId;
        const busy = busyId === m.userId;
        return (
          <div key={m.userId} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--white)' }}>{m.username}</span>
                <RoleBadge role={m.role} />
              </div>
              <div className="card-note" style={{ marginTop: 'var(--space-1)' }}>
                Joined {new Date(m.joinedAt).toLocaleDateString()}
                {league.isStaff ? ` · Last on ${formatLastActive(m.lastActiveAt).toLowerCase()}` : ''}
              </div>
            </div>
            {isOwner && !isTheOwner && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => {
                  setBusyId(m.userId);
                  updateRole({ id: league.id, userId: m.userId, data: { role: m.role === 'admin' ? 'member' : 'admin' } });
                }}
              >
                {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            )}
            {league.isStaff && !isTheOwner && (
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() => { setBusyId(m.userId); removeMember({ id: league.id, userId: m.userId }); }}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── League detail ───────────────────────────────────────────────────────────

type DetailTab = 'leaderboard' | 'activity' | 'roster';

function LeagueDetailPage({ leagueId, onBack }: { leagueId: string; onBack: () => void }) {
  const qc = useQueryClient();
  // Leaving is "remove me" — the roster is keyed by Clerk id, which is the
  // same id the API authenticates against.
  const { user } = useUser();
  const { data, isLoading } = useGetLeague(leagueId);
  const [tab, setTab] = useState<DetailTab>('leaderboard');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');

  const showToast = (message: string, variant: 'success' | 'error') => {
    setToastVariant(variant);
    setToast(message);
  };

  const refreshLeague = () => {
    qc.invalidateQueries({ queryKey: getGetLeagueQueryKey(leagueId) });
    qc.invalidateQueries({ queryKey: getGetLeaguesQueryKey() });
  };

  const { mutate: regenerateCode, isPending: regenerating } = useRegenerateLeagueJoinCode({
    mutation: {
      onSuccess: () => { refreshLeague(); showToast('New invite code issued — the old one no longer works', 'success'); },
      onError: (e) => showToast(errorMessage(e, "Couldn't issue a new code"), 'error'),
    },
  });

  const { mutate: deleteLeague, isPending: deleting } = useDeleteLeague({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeaguesQueryKey() }); onBack(); },
      onError: (e) => showToast(errorMessage(e, "Couldn't delete that league"), 'error'),
    },
  });

  const { mutate: leaveLeague, isPending: leaving } = useRemoveLeagueMember({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeaguesQueryKey() }); onBack(); },
      onError: (e) => showToast(errorMessage(e, "Couldn't leave that league"), 'error'),
    },
  });

  if (isLoading) return <div className="page"><div className="card card-pad card-text">Loading league…</div></div>;
  if (!data) {
    return (
      <div className="page">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={12} /> All leagues</button>
        <EmptyState icon={<Users size={40} />} headline="League not found" subtext="It may have been deleted, or you're no longer a member." />
      </div>
    );
  }

  const { league, members } = data;
  const staff = league.isStaff;
  const activeTab: DetailTab = staff ? tab : 'roster';
  const currentUserIsOwner = league.role === 'owner';

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 'var(--space-3)' }}>
        <ChevronLeft size={12} /> All leagues
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">{league.name}</h1>
          <div className="page-subtitle">
            {league.description || `${league.memberCount} driver${league.memberCount === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="page-header-meta">
          <RoleBadge role={league.role} />
        </div>
      </div>

      {staff && league.joinCode && (
        <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="field-label">Invite code</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-page)', letterSpacing: '0.2em', color: 'var(--white)' }}>
              {league.joinCode}
            </div>
            <div className="card-note">Drivers join with this on the Leagues page.</div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(league.joinCode ?? '')
                .then(() => showToast('Invite code copied', 'success'))
                .catch(() => showToast("Couldn't copy — select it by hand", 'error'));
            }}
          >
            <Copy size={12} /> Copy
          </button>
          <button className="btn btn-ghost btn-sm" disabled={regenerating} onClick={() => regenerateCode({ id: league.id })}>
            <RefreshCw size={12} /> {regenerating ? 'Issuing…' : 'New code'}
          </button>
        </div>
      )}

      {staff ? (
        <div className="page-tabs">
          <button type="button" className={`page-tab${activeTab === 'leaderboard' ? ' page-tab--active' : ''}`} onClick={() => setTab('leaderboard')}>
            <Gauge size={13} /> Leaderboard
          </button>
          <button type="button" className={`page-tab${activeTab === 'activity' ? ' page-tab--active' : ''}`} onClick={() => setTab('activity')}>
            <ActivityIcon size={13} /> Who's practising
          </button>
          <button type="button" className={`page-tab${activeTab === 'roster' ? ' page-tab--active' : ''}`} onClick={() => setTab('roster')}>
            <Users size={13} /> Drivers
            <span className="page-tab-count">{members.length}</span>
          </button>
        </div>
      ) : (
        <div className="card card-pad card-note" style={{ marginBottom: 'var(--space-5)' }}>
          The leaderboard and practice board in this league are for its staff.
          They can see your sessions, laps, seat time and best lap per track —
          your notes, setups and telemetry stay private.
        </div>
      )}

      {activeTab === 'leaderboard' && <LeaderboardTab leagueId={league.id} />}
      {activeTab === 'activity' && <ActivityTab leagueId={league.id} />}
      {activeTab === 'roster' && (
        <RosterTab league={league} members={members} onChanged={refreshLeague} onToast={showToast} />
      )}

      <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {currentUserIsOwner ? (
          <button
            className="btn btn-danger btn-sm"
            disabled={deleting}
            onClick={() => {
              if (window.confirm(`Delete ${league.name}? Its drivers lose access to the league immediately.`)) {
                deleteLeague({ id: league.id });
              }
            }}
          >
            {deleting ? 'Deleting…' : 'Delete league'}
          </button>
        ) : (
          <button
            className="btn btn-secondary btn-sm"
            disabled={leaving || !user?.id}
            onClick={() => {
              if (window.confirm(`Leave ${league.name}?`)) {
                if (user?.id) leaveLeague({ id: league.id, userId: user.id });
              }
            }}
          >
            {leaving ? 'Leaving…' : 'Leave league'}
          </button>
        )}
      </div>

      {toast && <Toast message={toast} variant={toastVariant} onDone={() => setToast('')} />}
    </div>
  );
}

export default function Leagues() {
  const [openId, setOpenId] = useState<string | null>(null);

  return openId
    ? <LeagueDetailPage leagueId={openId} onBack={() => setOpenId(null)} />
    : <LeagueListPage onOpen={setOpenId} />;
}
