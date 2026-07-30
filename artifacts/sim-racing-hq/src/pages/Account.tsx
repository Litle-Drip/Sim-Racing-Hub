import { useMemo } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { useGetSessions, useGetSetups } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapToSeconds } from '../lib/storage';
import {
  calculateStreak,
  calculateRank,
  getRankColor,
  calculateAchievements,
  sessionConsistency,
  estimateSeatTimeMinutes,
} from '../lib/engagement';
import type { DriverRank } from '../lib/engagement';

const RANK_ORDER: DriverRank[] = ['Rookie', 'Amateur', 'Intermediate', 'Expert', 'Elite', 'Pro'];
const RANK_THRESHOLDS = [0, 30, 100, 200, 350, 500];

export default function Account() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: sessions = [] } = useGetSessions();
  const { data: setups = [] } = useGetSetups();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const displayName = user?.firstName ?? user?.username ?? 'Driver';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const avatarUrl = user?.imageUrl ?? null;
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);
  const achievements = useMemo(() => calculateAchievements(sessions, setups.length), [sessions, setups]);
  const earnedAchievements = achievements.filter(a => a.earned);

  const totalSessions = sessions.length;
  const tracksPracticed = new Set(sessions.map(s => s.trackId)).size;
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  // Rank progress
  const currentTierIdx = RANK_ORDER.indexOf(rankInfo.rank);
  const currentMin = RANK_THRESHOLDS[currentTierIdx] ?? 0;
  const nextMin = currentTierIdx < RANK_ORDER.length - 1 ? RANK_THRESHOLDS[currentTierIdx + 1] : null;
  const progressPct = nextMin !== null
    ? Math.max(0, Math.min(100, ((rankInfo.points - currentMin) / (nextMin - currentMin)) * 100))
    : 100;

  // Total time — real lap times when logged, session-type estimate otherwise
  const totalMinutes = estimateSeatTimeMinutes(sessions);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = Math.round(totalMinutes % 60);

  // Average consistency
  const avgConsistency = useMemo(() => {
    const scores = sessions.map(s => sessionConsistency(s)).filter((c): c is number => c !== null);
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [sessions]);

  // Average rating
  const avgRating = useMemo(() => {
    const rated = sessions.filter(s => s.rating > 0);
    if (rated.length === 0) return null;
    return rated.reduce((a, s) => a + s.rating, 0) / rated.length;
  }, [sessions]);

  // PBs per track
  const trackPBs = useMemo(() => {
    const pbByTrack: Record<string, { car: string; bestLap: string; date: string }> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '' || !s.isPB) return;
      const secs = lapToSeconds(s.bestLap);
      if (!isFinite(secs) || secs <= 0) return;
      const existing = pbByTrack[s.trackId];
      if (!existing || secs < lapToSeconds(existing.bestLap)) {
        pbByTrack[s.trackId] = { car: s.car, bestLap: s.bestLap, date: s.date };
      }
    });
    return Object.entries(pbByTrack)
      .map(([trackId, data]) => ({ trackId, ...data }))
      .sort((a, b) => {
        const ta = F1_TRACKS.find(t => t.id === a.trackId)?.short ?? a.trackId;
        const tb = F1_TRACKS.find(t => t.id === b.trackId)?.short ?? b.trackId;
        return ta.localeCompare(tb);
      });
  }, [sessions]);

  // Session type breakdown
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // Most driven tracks
  const topTracks = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach(s => { counts[s.trackId] = (counts[s.trackId] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => {
        const t = F1_TRACKS.find(tr => tr.id === id);
        return { name: t?.short ?? id, flag: t?.flag ?? '', count };
      });
  }, [sessions]);

  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short ?? id;
  const trackFlag = (id: string) => F1_TRACKS.find(t => t.id === id)?.flag ?? '';

  return (
    <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header / Profile */}
      <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', border: `2px solid ${getRankColor(rankInfo.rank)}` }} />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--bg-elevated)', border: `2px solid ${getRankColor(rankInfo.rank)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontFamily: 'var(--font-display)', color: getRankColor(rankInfo.rank),
            }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--white)', margin: 0 }}>
              {displayName}
            </h1>
            {email && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 4 }}>{email}</div>
            )}
            {memberSince && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>Member since {memberSince}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.08em',
                color: getRankColor(rankInfo.rank), textTransform: 'uppercase',
              }}>
                {rankInfo.rank}
              </span>
              {streak > 0 && (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: '#FF9800' }}>
                  🔥 {streak} day streak
                </span>
              )}
            </div>
          </div>
        </div>

        {/* XP bar */}
        {rankInfo.nextRank && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: getRankColor(rankInfo.rank) }}>{rankInfo.rank}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: getRankColor(rankInfo.nextRank as DriverRank) }}>{rankInfo.nextRank}</span>
            </div>
            <div className="xp-bar-bg">
              <div className="xp-bar-fill" style={{ width: `${progressPct}%`, background: getRankColor(rankInfo.rank) }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>{rankInfo.points} XP</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray)' }}>{rankInfo.pointsToNext} XP to {rankInfo.nextRank}</span>
            </div>
          </div>
        )}
        {!rankInfo.nextRank && (
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: getRankColor(rankInfo.rank) }}>
            {rankInfo.points} XP — Max Rank Achieved
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total Sessions</div>
          <div className="stat-value">{totalSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tracks Practiced</div>
          <div className="stat-value">{tracksPracticed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Personal Bests</div>
          <div className="stat-value">{pbsSet}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Setups Saved</div>
          <div className="stat-value">{setupsSaved}</div>
        </div>
      </div>

      {/* Driving Stats */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 12 }}>Driving Stats</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Est. Seat Time</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--white)', letterSpacing: '0.04em' }}>
              {totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : `${remainingMinutes}m`}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Avg Consistency</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: avgConsistency && avgConsistency >= 96 ? 'var(--teal)' : 'var(--white)', letterSpacing: '0.04em' }}>
              {avgConsistency !== null ? `${avgConsistency.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Avg Rating</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--white)', letterSpacing: '0.04em' }}>
              {avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Day Streak</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: streak > 0 ? '#FF9800' : 'var(--white)', letterSpacing: '0.04em' }}>
              {streak > 0 ? `🔥 ${streak}` : '0'}
            </div>
          </div>
        </div>
      </div>

      {/* Session Type Breakdown + Top Tracks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {typeBreakdown.length > 0 && (
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 10 }}>Session Types</div>
            {typeBreakdown.map(([type, count]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                <span style={{ color: 'var(--gray-light)' }}>{type}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white)' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
        {topTracks.length > 0 && (
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 10 }}>Most Driven</div>
            {topTracks.map(t => (
              <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                <span style={{ color: 'var(--gray-light)' }}>{t.flag} {t.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white)' }}>{t.count} sessions</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Achievements */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 8 }}>
        Achievements — {earnedAchievements.length}/{achievements.length}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {achievements.map(a => {
          const nearComplete = !a.earned && a.target > 1 && a.progress / a.target >= 0.6;
          return (
            <div key={a.id} className={`dash-badge${a.earned ? ' earned' : ''}${nearComplete ? ' near' : ''}`}
              title={`${a.name}: ${a.desc}${!a.earned && a.target > 1 ? ` (${a.progress}/${a.target})` : ''}`}>
              <span className="dash-badge-icon">{a.icon}</span>
              <div className="dash-badge-info">
                <span className="dash-badge-name">{a.name}</span>
                {!a.earned && a.target > 1 && (
                  <div className="dash-badge-progress">
                    <div className="dash-badge-bar">
                      <div className="dash-badge-bar-fill" style={{ width: `${(a.progress / a.target) * 100}%` }} />
                    </div>
                    <span className="dash-badge-count">{a.progress}/{a.target}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Personal Bests */}
      <div className="section-title">Personal Bests</div>
      {trackPBs.length === 0 ? (
        <div className="card" style={{ padding: '20px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)' }}>
            No PBs set yet. Start logging sessions to track your fastest laps.
          </div>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Car</th>
                <th>PB Time</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {trackPBs.map(pb => (
                <tr key={pb.trackId}>
                  <td>{trackFlag(pb.trackId)} {trackName(pb.trackId)}</td>
                  <td style={{ color: 'var(--white)', fontWeight: 600 }}>{pb.car}</td>
                  <td><span className="pb-time">{pb.bestLap}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{pb.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Public Profile Link */}
      {user?.username && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 4 }}>Public Profile</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--teal)' }}>f1simhub.com/driver/{user.username}</div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '5px 14px' }}
            onClick={() => {
              const url = `${window.location.origin}${basePath}/driver/${user.username}`;
              navigator.clipboard.writeText(url).catch(() => {});
            }}
          >
            Copy Link
          </button>
        </div>
      )}

      {/* Account Actions */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 12 }}>Account</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => user?.update && window.open('https://accounts.f1simhub.com/user', '_blank')}
          >
            Manage Account
          </button>
          <button
            className="btn btn-secondary nav-footer-btn--danger"
            style={{ fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)' }}
            onClick={() => signOut({ redirectUrl: basePath || '/' })}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
