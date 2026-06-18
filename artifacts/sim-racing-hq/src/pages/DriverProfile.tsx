import { useState, useEffect, useMemo } from 'react';
import { F1_TRACKS } from '../data/f1Tracks';
import { getRankColor } from '../lib/engagement';
import type { RankInfo, Achievement } from '../lib/engagement';

interface DriverPB {
  trackId: string;
  car: string;
  bestLap: string;
  date: string;
}

interface DriverSession {
  id: string;
  date: string;
  trackId: string;
  car: string;
  type: string;
  bestLap: string;
  conditions: string;
  platform: string;
  inputDevice: string;
}

interface DriverData {
  username: string;
  memberSince: string | null;
  avatarUrl: string | null;
  sessions: number;
  setups: number;
  tracks: number;
  pbs: DriverPB[];
  recentSessions: DriverSession[];
}

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
  'Time Trial': 'badge-hotlap',
};

export default function DriverProfile({ username }: { username: string }) {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const base = import.meta.env.VITE_API_URL || '/api';
    fetch(`${base}/community/driver/${encodeURIComponent(username)}`)
      .then(r => {
        if (!r.ok) throw new Error('Driver not found');
        return r.json();
      })
      .then(data => { setDriver(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [username]);

  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short || id;
  const trackFlag = (id: string) => F1_TRACKS.find(t => t.id === id)?.flag || '';

  // Rank computed directly from aggregate public data — no synthetic session padding.
  const RANK_TIERS = [
    { rank: 'Pro' as const, min: 500 },
    { rank: 'Elite' as const, min: 350 },
    { rank: 'Expert' as const, min: 200 },
    { rank: 'Intermediate' as const, min: 100 },
    { rank: 'Amateur' as const, min: 30 },
    { rank: 'Rookie' as const, min: 0 },
  ];

  const rankInfo = useMemo((): RankInfo | null => {
    if (!driver) return null;
    let points = Math.min(driver.sessions, 100);
    points += driver.tracks * 5;
    points += driver.pbs.length * 3;
    if (driver.tracks >= 24) points += 50;
    const tier = RANK_TIERS.find(t => points >= t.min) ?? RANK_TIERS[RANK_TIERS.length - 1];
    const nextIdx = RANK_TIERS.indexOf(tier) - 1;
    const next = nextIdx >= 0 ? RANK_TIERS[nextIdx] : null;
    return { rank: tier.rank, points, nextRank: next?.rank ?? null, pointsToNext: next ? next.min - points : 0 };
  }, [driver]);

  // Achievements computed from known public aggregate data only (no fabricated sessions).
  const achievements = useMemo((): Achievement[] => {
    if (!driver) return [];
    const pbTrackIds = new Set(driver.pbs.map(p => p.trackId));
    const n = driver.sessions;
    return [
      { id: 'podium', name: 'Podium', desc: 'Set your first PB at any track', icon: '🏆', earned: driver.pbs.length > 0, progress: Math.min(driver.pbs.length, 1), target: 1 },
      { id: 'flat_out', name: 'Flat Out', desc: 'Log 10+ sessions', icon: '💨', earned: n >= 10, progress: Math.min(n, 10), target: 10 },
      { id: 'setup_wizard', name: 'Setup Wizard', desc: 'Save 10 setups', icon: '🔧', earned: driver.setups >= 10, progress: Math.min(driver.setups, 10), target: 10 },
      { id: 'circuit_master', name: 'Circuit Master', desc: 'Log sessions at all 24 tracks', icon: '🌍', earned: driver.tracks >= 24, progress: Math.min(driver.tracks, 24), target: 24 },
      { id: 'consistent', name: 'Consistent', desc: 'Best/worst lap gap under 0.5s in a session', icon: '🎯', earned: false, progress: 0, target: 1 },
      { id: 'the_senna', name: 'The Senna', desc: 'Set a PB at Monaco', icon: '👑', earned: pbTrackIds.has('monaco'), progress: pbTrackIds.has('monaco') ? 1 : 0, target: 1 },
      { id: 'century', name: 'Century', desc: 'Log 100 sessions', icon: '💯', earned: n >= 100, progress: Math.min(n, 100), target: 100 },
      { id: 'globe_trotter', name: 'Globe Trotter', desc: 'Practice at 12 different tracks', icon: '✈️', earned: driver.tracks >= 12, progress: Math.min(driver.tracks, 12), target: 12 },
      { id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Log 5 sessions in a single day', icon: '⚡', earned: false, progress: 0, target: 5 },
      { id: 'first_share', name: 'Community Spirit', desc: 'Share a session publicly', icon: '📡', earned: driver.recentSessions.length > 0, progress: driver.recentSessions.length > 0 ? 1 : 0, target: 1 },
    ];
  }, [driver]);

  if (loading) return <div className="page" style={{ textAlign: 'center', padding: 60 }}><div style={{ color: 'var(--gray-mid)' }}>Loading...</div></div>;
  if (error || !driver) return (
    <div className="page" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '0.08em', color: 'var(--white)' }}>Driver Not Found</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginTop: 8 }}>The driver "{username}" doesn't exist or hasn't shared any data publicly.</div>
    </div>
  );

  const earnedAchievements = achievements.filter(a => a.earned);

  return (
    <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        {driver.avatarUrl ? (
          <img src={driver.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--border)' }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-elevated)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--gray-mid)' }}>
            {driver.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.06em', color: 'var(--white)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {driver.username}
            {rankInfo && (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', color: getRankColor(rankInfo.rank), textTransform: 'uppercase' }}>
                {rankInfo.rank}
              </span>
            )}
          </h1>
          {driver.memberSince && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 4 }}>
              Member since {driver.memberSince}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: 'Sessions', value: driver.sessions },
          { label: 'Tracks', value: driver.tracks },
          { label: 'PBs', value: driver.pbs.length },
          { label: 'Setups', value: driver.setups },
        ].map(({ label, value }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Achievement Badges */}
      {earnedAchievements.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 28 }}>Achievements</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {earnedAchievements.map(a => (
              <div key={a.id} title={a.desc} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4,
              }}>
                <span style={{ fontSize: 16 }}>{a.icon}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--white)' }}>{a.name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Personal Bests */}
      <div className="section-title" style={{ marginTop: 28 }}>Personal Bests</div>
      {driver.pbs.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-desc">No public PBs yet.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
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
              {driver.pbs.sort((a, b) => a.trackId.localeCompare(b.trackId)).map(pb => (
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

      {/* Recent Sessions */}
      <div className="section-title" style={{ marginTop: 28 }}>Recent Sessions</div>
      {driver.recentSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-desc">No public sessions yet.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Track</th>
                <th>Car</th>
                <th>Best Lap</th>
                <th>Type</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {driver.recentSessions.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td>{trackFlag(s.trackId)} {trackName(s.trackId)}</td>
                  <td style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                  <td><span className="lap-time">{s.bestLap || '—'}</span></td>
                  <td><span className={`badge ${TYPE_BADGE[s.type] || 'badge-practice'}`}>{s.type}</span></td>
                  <td style={{ color: 'var(--gray-mid)' }}>{[s.platform, s.inputDevice].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shareable URL */}
      <div style={{ marginTop: 32, textAlign: 'center', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
          Share this profile: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>f1simhub.com/driver/{driver.username}</span>
        </div>
      </div>
    </div>
  );
}
