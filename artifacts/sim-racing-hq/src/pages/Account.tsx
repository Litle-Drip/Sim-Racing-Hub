import { useMemo, useState } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { Flame, Sun, Moon } from 'lucide-react';
import { useUnits } from '../lib/units';
import { useTheme } from '../lib/theme';
import { SHOW_ACHIEVEMENTS, SHOW_XP } from '../lib/features';
import { useGetSessions, useGetSetups } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapToSeconds } from '../lib/storage';
import {
  calculateStreak,
  calculateRank,
  getRankColor,
  getRankProgress,
  calculateAchievements,
  sessionConsistency,
  estimateSeatTimeMinutes,
} from '../lib/engagement';
import type { DriverRank } from '../lib/engagement';
import { SessionDetailModal } from '../components/SessionDetail';
import { useRivalRecord } from '../lib/rivalNotifications';
import Friends from './Friends';

// Companion-app uploads and older imports use a wider variety of raw session
// type strings than the SESSION_TYPES a driver picks from in the log form
// (e.g. "Practice 1/2/3", "OSQ Sprint Shootout", "Unknown"). Bucket them into
// the same handful of categories so the breakdown reads as a clean summary
// instead of a dump of near-duplicate labels.
function normalizeSessionType(raw: string): string {
  const t = (raw || '').trim().toLowerCase();
  if (!t || t === 'unknown') return 'Other';
  if (t.startsWith('practice')) return 'Practice';
  if (t.startsWith('osq') || t.includes('shootout') || t.startsWith('qualifying')) return 'Qualifying';
  if (t.startsWith('race')) return 'Race';
  if (t.startsWith('hotlap')) return 'Hotlap';
  if (t.startsWith('time trial')) return 'Time Trial';
  return raw;
}

export default function Account({ setPage }: { setPage?: (p: string) => void }) {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { system, setSystem } = useUnits();
  const { theme, toggleTheme } = useTheme();
  const { data: sessions = [] } = useGetSessions();
  const { data: setups = [] } = useGetSetups();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [detailSession, setDetailSession] = useState<SessionRecord | null>(null);

  const displayName = user?.firstName ?? user?.username ?? 'Driver';
  // No email address anywhere on this page. It's the one identifier here that
  // isn't a racing handle, it adds nothing to a profile, and it's the thing
  // you least want on screen while streaming or sharing a screenshot. Clerk's
  // own account modal (Manage Account) still owns it.
  const avatarUrl = user?.imageUrl ?? null;
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  const rivalRecord = useRivalRecord();
  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);
  const achievements = useMemo(() => calculateAchievements(sessions, setups.length), [sessions, setups]);
  const earnedAchievements = achievements.filter(a => a.earned);

  const totalSessions = sessions.length;
  const tracksPracticed = new Set(sessions.map(s => s.trackId)).size;
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  // Rank progress — computed the same way as Nav and Dashboard, from the
  // shared RANK_TIERS list, so all three always agree on where a driver
  // sits and how far the next tier is.
  const { pct: progressPct } = getRankProgress(rankInfo);

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

  const sessionsThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    return sessions.filter(s => s.date >= weekStr).length;
  }, [sessions]);

  // PBs per track — keeps the underlying session id so a row can jump
  // straight to that session's full detail, same as Dashboard and Tracks.
  const trackPBs = useMemo(() => {
    const pbByTrack: Record<string, { id: string; car: string; bestLap: string; date: string }> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '' || !s.isPB) return;
      const secs = lapToSeconds(s.bestLap);
      if (!isFinite(secs) || secs <= 0) return;
      const existing = pbByTrack[s.trackId];
      if (!existing || secs < lapToSeconds(existing.bestLap)) {
        pbByTrack[s.trackId] = { id: s.id, car: s.car, bestLap: s.bestLap, date: s.date };
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

  // Session type breakdown — bucketed through normalizeSessionType so raw
  // companion-app variants (Practice 1/2/3, OSQ Sprint Shootout, Unknown…)
  // roll up into the handful of types drivers actually recognize.
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach(s => {
      const label = normalizeSessionType(s.type);
      counts[label] = (counts[label] || 0) + 1;
    });
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
        return { id, name: t?.short ?? id, flag: t?.flag ?? '', count };
      });
  }, [sessions]);

  // Older imports can carry circuit ids the current track list doesn't know
  // (e.g. "track_42"); show a readable placeholder rather than the raw id.
  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short ?? 'Unknown circuit';
  const trackFlag = (id: string) => F1_TRACKS.find(t => t.id === id)?.flag ?? '';

  return (
    <div className="page">
      {/* Every other page announces itself with a title; this one opened
          straight into a card. The driver's name is data, not the page's
          name, so the title takes the h1 and the name reads as the card's
          headline underneath it. */}
      <div className="page-header">
        <h1 className="page-title">Account</h1>
      </div>

      {/* Header / Profile */}
      <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
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
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--white)' }}>
              {displayName}
            </div>
            {memberSince && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray)', marginTop: 'var(--space-1)' }}>Member since {memberSince}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: 'var(--fs-body-sm)', fontWeight: 700, letterSpacing: '0.08em',
                color: getRankColor(rankInfo.rank), textTransform: 'uppercase',
              }}>
                {rankInfo.rank}
              </span>
              {streak > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>
                  <Flame size={12} aria-hidden="true" /> {streak} day streak
                </span>
              )}
            </div>
          </div>

          {/* Your shareable address is part of who you are here, so it sits
              with your name instead of in a card of its own at the very
              bottom of the page — which left both this card's right half and
              that card's right half empty. */}
          {user?.username && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div>
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Public Profile</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--teal)' }}>f1simhub.com/driver/{user.username}</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const url = `${window.location.origin}${basePath}/driver/${user.username}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                }}
              >
                Copy Link
              </button>
            </div>
          )}
        </div>

        {/* XP bar */}
        {SHOW_XP && rankInfo.nextRank && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--gray-light)' }}>{rankInfo.rank}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--gray-light)' }}>{rankInfo.nextRank}</span>
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
        {SHOW_XP && !rankInfo.nextRank && (
          <div style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 11, color: getRankColor(rankInfo.rank) }}>
            {rankInfo.points} XP — World Champion, the highest tier. Keep logging sessions — your XP total still climbs.
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
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
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setPage?.('setups')}
          title={setupsSaved > 0 ? 'View your Setup Vault' : 'Save your first setup'}
        >
          <div className="stat-label">Setups Saved</div>
          <div className="stat-value">{setupsSaved}</div>
          {setupsSaved === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--teal)', marginTop: 'var(--space-1)' }}>Save your first setup →</div>
          )}
        </div>
      </div>

      {/* Driving Stats + Rivals Record — four figures each, so on a desktop
          they share a row rather than each taking a full-width card with two
          thirds of it empty. */}
      <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div className="section-title">Driving Stats</div>
          <div className="metric-grid">
            <div>
              <div className="stat-label">Est. Seat Time</div>
              <div className="metric-value">
                {totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : `${remainingMinutes}m`}
              </div>
            </div>
            <div>
              <div className="stat-label">Avg Consistency</div>
              <div className="metric-value" style={{ color: avgConsistency && avgConsistency >= 96 ? 'var(--teal)' : 'var(--white)' }}>
                {avgConsistency !== null ? `${avgConsistency.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="stat-label">Avg Rating</div>
              <div className="metric-value">
                {avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'}
              </div>
            </div>
            <div>
              <div className="stat-label">Sessions This Week</div>
              <div className="metric-value">{sessionsThisWeek}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div className="section-title">Rivals Record</div>
          <div className="metric-grid">
            {[
              { label: 'Wins', value: rivalRecord.wins, color: 'var(--teal)' },
              { label: 'Losses', value: rivalRecord.losses, color: 'var(--red)' },
              { label: 'Completed', value: rivalRecord.completed, color: 'var(--white)' },
              { label: 'Drivers Faced', value: rivalRecord.opponents, color: 'var(--white)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="stat-label">{label}</div>
                <div className="metric-value" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Friends — lives here rather than in Community: it's your list, and
          this is your page. The component brings its own section headings. */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <Friends />
      </div>

      {/* Session Type Breakdown + Top Tracks */}
      <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
        {typeBreakdown.length > 0 && (
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div className="section-title">Session Types</div>
            <div className="stat-list">
              {typeBreakdown.map(([type, count]) => (
                <div key={type} className="stat-list-row">
                  <span>{type}</span>
                  <span className="stat-list-row-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {topTracks.length > 0 && (
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div className="section-title">Most Driven</div>
            <div className="stat-list">
              {topTracks.map(t => (
                <div
                  key={t.id}
                  className="stat-list-row"
                  onClick={() => setPage?.('tracks')}
                  style={{ cursor: 'pointer' }}
                  title={`View ${t.name} in the Track Bible`}
                >
                  <span>{t.flag} {t.name}</span>
                  <span className="stat-list-row-value">{t.count} sessions</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Achievements */}
      {SHOW_ACHIEVEMENTS && (
        <>
          <div className="section-title">
            Achievements — {earnedAchievements.length}/{achievements.length}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            {achievements.map(a => {
              const nearComplete = !a.earned && a.target > 1 && a.progress / a.target >= 0.6;
              const BadgeIcon = a.icon;
              return (
                <div key={a.id} className={`dash-badge${a.earned ? ' earned' : ''}${nearComplete ? ' near' : ''}`}
                  title={`${a.name}: ${a.desc}${!a.earned && a.target > 1 ? ` (${a.progress}/${a.target})` : ''}`}>
                  <span className="dash-badge-icon"><BadgeIcon size={14} aria-hidden="true" /></span>
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
        </>
      )}

      {/* Personal Bests */}
      <div className="section-title">Personal Bests</div>
      {trackPBs.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-5)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)' }}>
            No PBs set yet. Start logging sessions to track your fastest laps.
          </div>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 'var(--space-4)' }}>
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
                <tr
                  key={pb.trackId}
                  style={{ cursor: 'pointer' }}
                  title="Click to view full session details"
                  onClick={() => {
                    const session = sessions.find(s => s.id === pb.id);
                    if (session) setDetailSession(session);
                  }}
                >
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

      {/* Preferences and Account — two short cards that each left most of a
          row empty; they share one now. Units and theme both moved off the
          sidebar, where they occupied permanent space on every page for a
          choice made once. */}
      <div className="grid-2">
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div className="section-title">Preferences</div>
          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Units</div>
              <div className="units-toggle" role="group" aria-label="Unit system" style={{ minWidth: 200, marginBottom: 0 }}>
                <button
                  type="button"
                  aria-pressed={system === 'us'}
                  className={`units-toggle-btn${system === 'us' ? ' active' : ''}`}
                  onClick={() => setSystem('us')}
                >
                  US <span className="units-toggle-sub">mph · °F</span>
                </button>
                <button
                  type="button"
                  aria-pressed={system === 'uk'}
                  className={`units-toggle-btn${system === 'uk' ? ' active' : ''}`}
                  onClick={() => setSystem('uk')}
                >
                  UK <span className="units-toggle-sub">mph · °C</span>
                </button>
              </div>
            </div>
            <div>
              <div className="stat-label">Appearance</div>
              <button className="btn btn-secondary" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        </div>

        {/* Account Actions */}
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div className="section-title">Account</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => openUserProfile()}
            >
              Manage Account
            </button>
            <button
              className="btn btn-secondary nav-footer-btn--danger"
              style={{ border: '1px solid var(--red)', color: 'var(--red)' }}
              onClick={() => signOut({ redirectUrl: basePath || '/' })}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {detailSession && (
        <SessionDetailModal session={detailSession} onClose={() => setDetailSession(null)} />
      )}
    </div>
  );
}
