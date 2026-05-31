import { useMemo, useRef, useEffect, useState } from 'react';
import { useGetSessions, useGetSetups, useGetCommunitySessions } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapToSeconds } from '../lib/storage';
import { calculateStreak, calculateRank, getRankColor, getDailyChallenge, calculateAchievements, sessionConsistency } from '../lib/engagement';
import type { DriverRank } from '../lib/engagement';

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
  'Time Trial': 'badge-hotlap',
};

const DIFF_COLORS: Record<string, string> = {
  Easy: '#4CAF50',
  Medium: '#FF9800',
  Hard: '#E8002D',
};

function RatingDots({ rating }: { rating: number }) {
  return (
    <span className="rating-dots">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`rating-dot${i <= rating ? ' filled' : ''}`} />
      ))}
    </span>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const dur = 600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setDisplay(Math.round(p * value));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display}</>;
}

function CountdownTimer() {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${h}h ${m}m`);
    };
    calc();
    const t = setInterval(calc, 60000);
    return () => clearInterval(t);
  }, []);
  return <span>{remaining}</span>;
}

function buildHeatmap(sessions: SessionRecord[]) {
  const countMap: Record<string, number> = {};
  sessions.forEach(s => {
    if (s.date) countMap[s.date] = (countMap[s.date] || 0) + 1;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const cells: { date: string; count: number; level: number }[][] = [];
  let cur = new Date(startDate);

  while (cur <= today) {
    const col: { date: string; count: number; level: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10);
      const count = countMap[dateStr] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      col.push({ date: dateStr, count, level });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    }
    cells.push(col);
  }
  return { cells, startDate };
}

function buildMonthLabels(cells: { date: string }[][]) {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  cells.forEach((col, i) => {
    const m = new Date(col[0].date).getMonth();
    if (m !== lastMonth) {
      labels.push({ label: new Date(col[0].date).toLocaleString('en', { month: 'short' }).toUpperCase(), col: i });
      lastMonth = m;
    }
  });
  return labels;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface DashboardProps {
  setPage: (p: string) => void;
}

export default function Dashboard({ setPage }: DashboardProps) {
  const { data: sessions = [] } = useGetSessions();
  const { data: setups = [] } = useGetSetups();
  const { data: communitySessions = [] } = useGetCommunitySessions();
  const { user } = useUser();

  const totalSessions = sessions.length;
  const tracksPracticed = new Set(sessions.map(s => s.trackId)).size;
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);
  const achievements = useMemo(() => calculateAchievements(sessions, setups.length), [sessions, setups]);
  const earnedCount = achievements.filter(a => a.earned).length;

  // Stat card micro-context
  const sessionsThisWeek = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    return sessions.filter(s => s.date >= weekStr).length;
  }, [sessions]);

  const mostDrivenTrack = useMemo(() => {
    if (sessions.length === 0) return null;
    const counts: Record<string, number> = {};
    sessions.forEach(s => { counts[s.trackId] = (counts[s.trackId] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const t = F1_TRACKS.find(tr => tr.id === top[0]);
    return t ? t.short : top[0];
  }, [sessions]);

  const lastPBDaysAgo = useMemo(() => {
    const pbs = sessions.filter(s => s.isPB).sort((a, b) => b.date.localeCompare(a.date));
    if (pbs.length === 0) return null;
    const diff = Math.floor((Date.now() - new Date(pbs[0].date).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff} days ago`;
  }, [sessions]);

  const daily = useMemo(() => {
    const challenge = getDailyChallenge();
    const entries = communitySessions
      .filter(s => s.trackId === challenge.track.id && s.car === challenge.car && s.bestLap && s.bestLap.trim() !== '' && s.date === challenge.date)
      .sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap))
      .slice(0, 5);
    return { ...challenge, entries };
  }, [communitySessions]);

  const recentSessions = useMemo(() => [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8), [sessions]);

  // Compute delta vs PB for each recent session
  const recentWithDelta = useMemo(() => {
    const pbByTrack: Record<string, number> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      const secs = lapToSeconds(s.bestLap);
      if (!isFinite(secs) || secs <= 0) return;
      if (!pbByTrack[s.trackId] || secs < pbByTrack[s.trackId]) {
        pbByTrack[s.trackId] = secs;
      }
    });
    return recentSessions.map(s => {
      const secs = lapToSeconds(s.bestLap);
      const pb = pbByTrack[s.trackId];
      const delta = (isFinite(secs) && pb && secs > 0) ? secs - pb : null;
      const cons = sessionConsistency(s);
      return { ...s, delta, consistency: cons };
    });
  }, [sessions, recentSessions]);

  const neglectedTracks = useMemo(() => {
    const lastDriven: Record<string, string> = {};
    sessions.forEach(s => {
      if (!lastDriven[s.trackId] || s.date > lastDriven[s.trackId]) {
        lastDriven[s.trackId] = s.date;
      }
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return F1_TRACKS
      .filter(t => lastDriven[t.id])
      .map(t => {
        const last = new Date(lastDriven[t.id]);
        const daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
        return { ...t, daysSince };
      })
      .filter(t => t.daysSince >= 14)
      .sort((a, b) => b.daysSince - a.daysSince);
  }, [sessions]);

  // Performance snapshot
  const perfSnapshot = useMemo(() => {
    if (sessions.length < 3) return null;
    // Strongest track: track with best avg consistency
    const trackScores: Record<string, { total: number; count: number }> = {};
    sessions.forEach(s => {
      const c = sessionConsistency(s);
      if (c !== null) {
        if (!trackScores[s.trackId]) trackScores[s.trackId] = { total: 0, count: 0 };
        trackScores[s.trackId].total += c;
        trackScores[s.trackId].count++;
      }
    });
    const trackAvgs = Object.entries(trackScores)
      .filter(([, v]) => v.count >= 2)
      .map(([id, v]) => ({ id, avg: v.total / v.count }));
    const strongest = trackAvgs.sort((a, b) => b.avg - a.avg)[0];
    const weakest = trackAvgs.sort((a, b) => a.avg - b.avg)[0];

    // Coaching insight: find closest track to PB improvement
    const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
    let coachingInsight = '';
    if (sorted.length >= 2) {
      const recent = sorted[0];
      const recentSecs = lapToSeconds(recent.bestLap);
      // Find PB for that track
      const trackSessions = sessions.filter(s => s.trackId === recent.trackId && s.bestLap);
      const pbSecs = Math.min(...trackSessions.map(s => lapToSeconds(s.bestLap)).filter(s => isFinite(s) && s > 0));
      if (isFinite(recentSecs) && isFinite(pbSecs) && recentSecs > pbSecs) {
        const gap = (recentSecs - pbSecs).toFixed(3);
        const name = F1_TRACKS.find(t => t.id === recent.trackId)?.short ?? recent.trackId;
        coachingInsight = `You're ${gap}s off your ${name} PB. Focus on consistency to close the gap.`;
      }
    }

    return {
      strongestTrack: strongest ? F1_TRACKS.find(t => t.id === strongest.id)?.short ?? strongest.id : null,
      strongestScore: strongest?.avg ?? null,
      weakestTrack: weakest && weakest.id !== strongest?.id ? F1_TRACKS.find(t => t.id === weakest.id)?.short ?? weakest.id : null,
      weakestScore: weakest && weakest.id !== strongest?.id ? weakest.avg : null,
      coachingInsight,
    };
  }, [sessions]);

  // Weekly summary for heatmap
  const weeklySummary = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const weekSessions = sessions.filter(s => s.date >= weekStr);
    const pbs = weekSessions.filter(s => s.isPB).length;
    const totalMinutes = weekSessions.length * 10; // estimate ~10 min per session
    return { sessions: weekSessions.length, pbs, seatTime: totalMinutes };
  }, [sessions]);

  const { cells } = useMemo(() => buildHeatmap(sessions), [sessions]);
  const monthLabels = useMemo(() => buildMonthLabels(cells), [cells]);

  const heatmapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (heatmapRef.current) heatmapRef.current.scrollLeft = heatmapRef.current.scrollWidth;
  }, [cells]);

  const trackName = (id: string) => {
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? t.short : id;
  };

  const userName = user?.firstName ?? user?.username ?? 'Driver';

  // Rank progress bar
  const rankTiers: DriverRank[] = ['Rookie', 'Amateur', 'Intermediate', 'Expert', 'Elite', 'Pro'];
  const currentTierIdx = rankTiers.indexOf(rankInfo.rank);
  const nextTier = rankInfo.nextRank;
  const progressToNext = nextTier
    ? Math.max(0, Math.min(100, ((rankInfo.points - (currentTierIdx > 0 ? [0, 30, 100, 200, 350, 500][currentTierIdx] : 0)) / (rankInfo.pointsToNext + rankInfo.points - (currentTierIdx > 0 ? [0, 30, 100, 200, 350, 500][currentTierIdx] : 0))) * 100))
    : 100;

  return (
    <div className="page" style={{ gap: 0 }}>
      {/* ── 12. Personalization Greeting ────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.04em', color: 'var(--white)' }}>
          {getGreeting()}, {userName}
        </div>
        {perfSnapshot?.coachingInsight && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 4, lineHeight: 1.5 }}>
            {perfSnapshot.coachingInsight}
          </div>
        )}
      </div>

      {/* ── 9. Quick Action Buttons ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('sessions')}>+ Session</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('setups')}>Load Setup</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('progress')}>Compare PB</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('community')}>Community</button>
      </div>

      {/* ── 1. Rank + XP Progress Bar ──────────────────────────────────── */}
      <div className="card dash-rank-card" style={{ padding: '14px 20px', marginBottom: 12, border: `1px solid ${getRankColor(rankInfo.rank)}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.06em', color: getRankColor(rankInfo.rank), textTransform: 'uppercase' }}>
              {rankInfo.rank}
            </span>
            {streak > 0 && (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.06em', color: '#FF9800' }}>
                🔥 {streak} day streak
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)' }}>
              {rankInfo.points} XP
            </span>
            {earnedCount > 0 && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>
                {earnedCount}/{achievements.length} badges
              </span>
            )}
          </div>
        </div>
        {nextTier && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--gray-mid)' }}>{rankInfo.rank}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: getRankColor(nextTier as DriverRank) }}>{nextTier}</span>
            </div>
            <div className="xp-bar-bg">
              <div className="xp-bar-fill" style={{ width: `${progressToNext}%`, background: getRankColor(rankInfo.rank) }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gray)', marginTop: 2, textAlign: 'right' }}>
              {rankInfo.pointsToNext} XP to {nextTier}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Stat Cards with micro-context ───────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card dash-stat-hover">
          <div className="stat-label">Total Sessions</div>
          <div className="stat-value"><AnimatedCounter value={totalSessions} /></div>
          {sessionsThisWeek > 0 && <div className="stat-micro" style={{ color: 'var(--teal)' }}>+{sessionsThisWeek} this week</div>}
        </div>
        <div className="stat-card dash-stat-hover">
          <div className="stat-label">Tracks Practiced</div>
          <div className="stat-value"><AnimatedCounter value={tracksPracticed} /></div>
          {mostDrivenTrack && <div className="stat-micro">Most driven: {mostDrivenTrack}</div>}
        </div>
        <div className="stat-card dash-stat-hover">
          <div className="stat-label">Personal Bests</div>
          <div className="stat-value"><AnimatedCounter value={pbsSet} /></div>
          {lastPBDaysAgo && <div className="stat-micro">Last PB: {lastPBDaysAgo}</div>}
        </div>
        <div className="stat-card dash-stat-hover" onClick={() => setPage('setups')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Setups Saved</div>
          <div className="stat-value"><AnimatedCounter value={setupsSaved} /></div>
          <div className="stat-micro stat-cta" onClick={e => { e.stopPropagation(); setPage('setups'); }}>Create Setup →</div>
        </div>
      </div>

      {/* ── 3. Daily Challenge (enhanced) ──────────────────────────────── */}
      <div className="card dash-challenge" style={{ padding: 0, marginBottom: 12, overflow: 'hidden', border: '1px solid rgba(0,210,190,0.3)' }}>
        <div style={{ background: 'rgba(0,210,190,0.06)', padding: '12px 20px', borderBottom: '1px solid rgba(0,210,190,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--teal)' }}>Daily Challenge</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.08em', padding: '1px 6px', borderRadius: 2, color: DIFF_COLORS[daily.difficulty], border: `1px solid ${DIFF_COLORS[daily.difficulty]}44`, textTransform: 'uppercase' }}>
                {daily.difficulty}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.06em', color: 'var(--white)', marginTop: 2 }}>
              {daily.track.flag} {daily.track.short} — {daily.car}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray-mid)' }}>Resets in <CountdownTimer /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--teal)', marginTop: 2 }}>+{daily.xpReward} XP</div>
          </div>
        </div>
        {daily.entries.length > 0 ? (
          <div style={{ padding: '8px 20px' }}>
            {daily.entries.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-body)', fontSize: 12, padding: '3px 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: i === 0 ? 'var(--teal)' : 'var(--gray-mid)', width: 16 }}>{i + 1}.</span>
                <span className={i === 0 ? 'pb-time' : 'lap-time'}>{s.bestLap}</span>
                <span style={{ color: 'var(--gray-light)' }}>{s.authorName}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '14px 20px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
            Be first on the board today.
          </div>
        )}
        <div style={{ padding: '6px 20px 10px', borderTop: '1px solid rgba(0,210,190,0.1)' }}>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 14px', width: '100%' }} onClick={() => setPage('sessions')}>
            Start Challenge
          </button>
        </div>
      </div>

      {/* ── 7. Performance Snapshot ─────────────────────────────────────── */}
      {perfSnapshot && (perfSnapshot.strongestTrack || perfSnapshot.weakestTrack) && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 10 }}>Performance Snapshot</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {perfSnapshot.strongestTrack && (
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Strongest Track</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--teal)', letterSpacing: '0.04em' }}>{perfSnapshot.strongestTrack}</div>
                {perfSnapshot.strongestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>{perfSnapshot.strongestScore.toFixed(1)}% consistency</div>}
              </div>
            )}
            {perfSnapshot.weakestTrack && (
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray)' }}>Needs Work</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--red)', letterSpacing: '0.04em' }}>{perfSnapshot.weakestTrack}</div>
                {perfSnapshot.weakestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>{perfSnapshot.weakestScore.toFixed(1)}% consistency</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Achievements (enhanced UX) ──────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 8, marginBottom: 8 }}>Achievements</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
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

      {/* ── 5. Activity Heatmap (with weekly summary + tooltips) ────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Activity — Last 365 Days</div>
        <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>
          <span>This week: <strong style={{ color: 'var(--white)' }}>{weeklySummary.sessions}</strong> sessions</span>
          <span><strong style={{ color: 'var(--teal)' }}>{weeklySummary.pbs}</strong> PBs</span>
          <span>~<strong style={{ color: 'var(--white)' }}>{weeklySummary.seatTime}</strong> min</span>
        </div>
      </div>
      <div className="heatmap-section" ref={heatmapRef}>
        <div className="heatmap-header">
          <div className="heatmap-legend">
            <span className="legend-dot" style={{ background: '#1E1E1E', border: '1px solid #333' }} />
            <span style={{ fontSize: 10 }}>None</span>
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.35)' }} />
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.6)' }} />
            <span className="legend-dot" style={{ background: '#E8002D' }} />
            <span style={{ fontSize: 10 }}>Active</span>
          </div>
        </div>

        <div style={{ display: 'flex', marginBottom: 4, paddingLeft: 14 }}>
          {monthLabels.map(({ label, col }, idx) => {
            const nextCol = monthLabels[idx + 1]?.col ?? cells.length;
            const spanWidth = (nextCol - col) * 13;
            return (
              <div key={`${label}-${col}`} style={{ width: spanWidth, flexShrink: 0, overflow: 'hidden' }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 8,
                  color: 'var(--gray)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>{label}</span>
              </div>
            );
          })}
        </div>

        <div className="heatmap-grid">
          <div className="heatmap-day-labels">
            {['', 'M', '', 'W', '', 'F', ''].map((d, i) => (
              <div key={i} className="heatmap-day-label">{d}</div>
            ))}
          </div>
          <div className="heatmap-cols">
            {cells.map((col, ci) => (
              <div key={ci} className="heatmap-col">
                {col.map((cell, di) => (
                  <div
                    key={di}
                    className={`heatmap-cell${cell.level > 0 ? ` l${cell.level}` : ''}`}
                    title={`${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. Recent Sessions (enhanced table) ────────────────────────── */}
      <div className="section-title" style={{ marginTop: 12 }}>Recent Sessions</div>
      {recentSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Yet</div>
            <div className="empty-state-desc">Head to the Sessions page to log your first sim racing session.</div>
          </div>
          <div style={{ textAlign: 'center', paddingBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setPage('sessions')}>Log Your First Session</button>
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
                <th>Δ PB</th>
                <th>Consistency</th>
                <th>Type</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {recentWithDelta.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td>{trackName(s.trackId)}</td>
                  <td style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                  <td>
                    <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                    {s.isPB && <span className="pb-badge">★ PB</span>}
                  </td>
                  <td>
                    {s.delta !== null && s.delta !== 0 ? (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: s.delta <= 0 ? 'var(--teal)' : s.delta < 0.5 ? '#FF9800' : 'var(--red)',
                      }}>
                        {s.delta <= 0 ? '—' : `+${s.delta.toFixed(3)}`}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--gray)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td>
                    {s.consistency !== null ? (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: s.consistency >= 98 ? 'var(--teal)' : s.consistency >= 95 ? 'var(--white)' : 'var(--gray-mid)',
                      }}>
                        {s.consistency.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--gray)' }}>—</span>
                    )}
                  </td>
                  <td><span className={`badge ${TYPE_BADGE[s.type] || 'badge-practice'}`}>{s.type}</span></td>
                  <td><RatingDots rating={s.rating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tracks needing attention */}
      {neglectedTracks.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>Needs Practice — 14+ Days</div>
          <div style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            padding: '12px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}>
            {neglectedTracks.map(t => (
              <div
                key={t.id}
                title={`${t.short} — ${t.daysSince} day${t.daysSince !== 1 ? 's' : ''} ago`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  opacity: 0.85,
                }}
                onClick={() => setPage('tracks')}
              >
                <span style={{ fontSize: 24 }}>{t.flag}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--gray-mid)' }}>{t.daysSince}d</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
