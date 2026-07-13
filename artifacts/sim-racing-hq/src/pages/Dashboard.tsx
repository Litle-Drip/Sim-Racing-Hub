import { useMemo, useRef, useEffect, useState } from 'react';
import { useGetSessions, useGetSetups, useGetCommunitySessions } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapToSeconds } from '../lib/storage';
import { calculateStreak, calculateRank, getRankColor, getDailyChallenge, calculateAchievements, sessionConsistency } from '../lib/engagement';
import type { DriverRank, Achievement } from '../lib/engagement';

const DIFF_COLORS: Record<string, string> = {
  Easy: '#4CAF50',
  Medium: '#FF9800',
  Hard: '#E8002D',
};

function Sparkline({ data, color = 'var(--red)', width = 48, height = 18 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`).join(' ');
  return (
    <svg className="stat-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BADGE_CATEGORIES: { label: string; ids: string[] }[] = [
  { label: 'Skill', ids: ['podium', 'the_senna', 'consistent'] },
  { label: 'Consistency', ids: ['flat_out', 'century', 'weekend_warrior'] },
  { label: 'Exploration', ids: ['circuit_master', 'globe_trotter'] },
  { label: 'Community', ids: ['setup_wizard', 'first_share'] },
];

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

function MiniBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 20));
  const color = pct >= 80 ? 'var(--teal)' : pct >= 60 ? 'var(--white)' : 'var(--red)';
  return (
    <div className="mini-bar-row" title={`${label}: ${value}/5`}>
      <span className="mini-bar-label">{label}</span>
      <div className="mini-bar-bg">
        <div className="mini-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function buildHeatmap(sessions: SessionRecord[]) {
  const countMap: Record<string, number> = {};
  const pbMap: Record<string, number> = {};
  const bestLapMap: Record<string, { lap: string; trackId: string }> = {};
  sessions.forEach(s => {
    if (s.date) {
      countMap[s.date] = (countMap[s.date] || 0) + 1;
      if (s.isPB) pbMap[s.date] = (pbMap[s.date] || 0) + 1;
      if (s.bestLap && s.bestLap.trim()) {
        const secs = lapToSeconds(s.bestLap);
        const existing = bestLapMap[s.date];
        if (!existing || (isFinite(secs) && secs > 0 && secs < lapToSeconds(existing.lap))) {
          bestLapMap[s.date] = { lap: s.bestLap, trackId: s.trackId };
        }
      }
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const cells: { date: string; count: number; level: number; pbs: number; bestLap: string | null; bestTrack: string | null }[][] = [];
  let cur = new Date(startDate);

  while (cur <= today) {
    const col: typeof cells[0] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10);
      const count = countMap[dateStr] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      const pbs = pbMap[dateStr] || 0;
      const best = bestLapMap[dateStr];
      col.push({ date: dateStr, count, level, pbs, bestLap: best?.lap ?? null, bestTrack: best?.trackId ?? null });
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function buildHeatmapTooltip(cell: { date: string; count: number; pbs: number; bestLap: string | null; bestTrack: string | null }): string {
  const d = new Date(cell.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let tip = `${d}\n${cell.count} session${cell.count !== 1 ? 's' : ''}`;
  if (cell.pbs > 0) tip += `\n${cell.pbs} PB${cell.pbs !== 1 ? 's' : ''}`;
  if (cell.count > 0) tip += `\n~${cell.count * 10} mins`;
  if (cell.bestLap && cell.bestTrack) {
    const t = F1_TRACKS.find(tr => tr.id === cell.bestTrack);
    tip += `\nBest: ${t?.short ?? cell.bestTrack} ${cell.bestLap}`;
  }
  return tip;
}

interface DashboardProps {
  setPage: (p: string) => void;
}

export default function Dashboard({ setPage }: DashboardProps) {
  const { data: sessions = [] } = useGetSessions();
  const { data: setups = [] } = useGetSetups();
  const { data: communitySessions = [] } = useGetCommunitySessions();
  const { user } = useUser();
  const [badgeTab, setBadgeTab] = useState('Skill');

  const totalSessions = sessions.length;
  const tracksPracticed = new Set(sessions.map(s => s.trackId)).size;
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);
  const achievements = useMemo(() => calculateAchievements(sessions, setups.length), [sessions, setups]);
  const earnedCount = achievements.filter(a => a.earned).length;

  const sessionsThisWeek = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    return sessions.filter(s => s.date >= weekStr).length;
  }, [sessions]);

  const sessionsLastWeek = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const twoWeekStr = twoWeeksAgo.toISOString().slice(0, 10);
    return sessions.filter(s => s.date >= twoWeekStr && s.date < weekStr).length;
  }, [sessions]);

  const tracksThisMonth = useMemo(() => {
    const today = new Date();
    const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30);
    const monthStr = monthAgo.toISOString().slice(0, 10);
    const prevMonthAgo = new Date(today); prevMonthAgo.setDate(today.getDate() - 60);
    const prevStr = prevMonthAgo.toISOString().slice(0, 10);
    const curr = new Set(sessions.filter(s => s.date >= monthStr).map(s => s.trackId)).size;
    const prev = new Set(sessions.filter(s => s.date >= prevStr && s.date < monthStr).map(s => s.trackId)).size;
    return { current: curr, delta: curr - prev };
  }, [sessions]);

  // Sparkline data: sessions per day for last 14 days
  const sessionSparkline = useMemo(() => {
    const data: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      data.push(sessions.filter(s => s.date === ds).length);
    }
    return data;
  }, [sessions]);

  // Sparkline: tracks practiced cumulative last 14 days
  const trackSparkline = useMemo(() => {
    const data: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      data.push(new Set(sessions.filter(s => s.date <= ds).map(s => s.trackId)).size);
    }
    return data;
  }, [sessions]);

  // Sparkline: PBs cumulative last 14 days
  const pbSparkline = useMemo(() => {
    const data: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      data.push(sessions.filter(s => s.isPB && s.date <= ds).length);
    }
    return data;
  }, [sessions]);

  const lastSession = useMemo(() => {
    if (sessions.length === 0) return null;
    return [...sessions].sort((a, b) =>
      b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    )[0];
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

  // Performance snapshot — enhanced with 4 metrics
  const perfSnapshot = useMemo(() => {
    if (sessions.length < 3) return null;
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
    const strongest = [...trackAvgs].sort((a, b) => b.avg - a.avg)[0];
    const weakest = [...trackAvgs].sort((a, b) => a.avg - b.avg)[0];

    // Best sector analysis
    let bestSector = '';
    let worstSector = '';
    const s1Totals: number[] = [];
    const s2Totals: number[] = [];
    const s3Totals: number[] = [];
    sessions.forEach(s => {
      if (s.s1) { const v = lapToSeconds(s.s1); if (isFinite(v) && v > 0) s1Totals.push(v); }
      if (s.s2) { const v = lapToSeconds(s.s2); if (isFinite(v) && v > 0) s2Totals.push(v); }
      if (s.s3) { const v = lapToSeconds(s.s3); if (isFinite(v) && v > 0) s3Totals.push(v); }
    });
    if (s1Totals.length > 0 && s2Totals.length > 0 && s3Totals.length > 0) {
      const variance = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
      };
      const vars = [
        { name: 'Sector 1', v: variance(s1Totals) },
        { name: 'Sector 2', v: variance(s2Totals) },
        { name: 'Sector 3', v: variance(s3Totals) },
      ].sort((a, b) => a.v - b.v);
      bestSector = vars[0].name;
      worstSector = vars[vars.length - 1].name;
    }

    // Coaching insights — multi-variant
    const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
    let coachingInsight = '';
    if (sorted.length >= 2) {
      const recent = sorted[0];
      const recentSecs = lapToSeconds(recent.bestLap);
      const trackSessions = sessions.filter(s => s.trackId === recent.trackId && s.bestLap);
      const pbSecs = Math.min(...trackSessions.map(s => lapToSeconds(s.bestLap)).filter(s => isFinite(s) && s > 0));
      if (isFinite(recentSecs) && isFinite(pbSecs) && recentSecs > pbSecs) {
        const gap = (recentSecs - pbSecs).toFixed(3);
        const name = F1_TRACKS.find(t => t.id === recent.trackId)?.short ?? recent.trackId;
        coachingInsight = `You're ${gap}s off your ${name} PB`;
      }
    }
    // Fallback coaching lines
    if (!coachingInsight) {
      if (rankInfo.nextRank) {
        coachingInsight = `${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
      } else if (weakest) {
        const name = F1_TRACKS.find(t => t.id === weakest.id)?.short ?? weakest.id;
        coachingInsight = `Focus today: consistency at ${name}`;
      }
    }

    // Build sub-line with streak + rank distance
    let subInsight = '';
    if (streak > 0 && rankInfo.nextRank) {
      subInsight = `PB streak: ${streak} day${streak !== 1 ? 's' : ''} \u2022 ${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
    } else if (streak > 0) {
      subInsight = `PB streak: ${streak} day${streak !== 1 ? 's' : ''}`;
    } else if (rankInfo.nextRank) {
      subInsight = `${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
    }

    return {
      strongestTrack: strongest ? F1_TRACKS.find(t => t.id === strongest.id)?.short ?? strongest.id : null,
      strongestScore: strongest?.avg ?? null,
      weakestTrack: weakest && weakest.id !== strongest?.id ? F1_TRACKS.find(t => t.id === weakest.id)?.short ?? weakest.id : null,
      weakestScore: weakest && weakest.id !== strongest?.id ? weakest.avg : null,
      bestSector,
      worstSector,
      coachingInsight,
      subInsight,
    };
  }, [sessions, streak, rankInfo]);

  // Weekly summary for heatmap
  const weeklySummary = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const weekSessions = sessions.filter(s => s.date >= weekStr);
    const pbs = weekSessions.filter(s => s.isPB).length;
    const totalMinutes = weekSessions.length * 10;
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

  // #polish: capitalize name properly
  const rawName = user?.firstName ?? user?.username ?? 'Driver';
  const userName = capitalize(rawName);

  // Rank progress bar
  const rankTiers: DriverRank[] = ['Rookie', 'Amateur', 'Intermediate', 'Expert', 'Elite', 'Pro'];
  const currentTierIdx = rankTiers.indexOf(rankInfo.rank);
  const nextTier = rankInfo.nextRank;
  const progressToNext = nextTier
    ? Math.max(0, Math.min(100, ((rankInfo.points - (currentTierIdx > 0 ? [0, 30, 100, 200, 350, 500][currentTierIdx] : 0)) / (rankInfo.pointsToNext + rankInfo.points - (currentTierIdx > 0 ? [0, 30, 100, 200, 350, 500][currentTierIdx] : 0))) * 100))
    : 100;

  // #6 Next Goal
  const nextGoal = useMemo(() => {
    if (sessions.length === 0) return null;
    // Find the track with closest PB gap
    const pbByTrack: Record<string, { pb: number; name: string }> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      const secs = lapToSeconds(s.bestLap);
      if (!isFinite(secs) || secs <= 0) return;
      const name = F1_TRACKS.find(t => t.id === s.trackId)?.short ?? s.trackId;
      if (!pbByTrack[s.trackId] || secs < pbByTrack[s.trackId].pb) {
        pbByTrack[s.trackId] = { pb: secs, name };
      }
    });
    // Find a recent session where we were close to PB
    const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
    for (const s of sorted.slice(0, 10)) {
      const secs = lapToSeconds(s.bestLap);
      const entry = pbByTrack[s.trackId];
      if (!entry || !isFinite(secs) || secs <= 0) continue;
      const gap = secs - entry.pb;
      if (gap > 0 && gap < 1.0) {
        const target = Math.min(gap, 0.15);
        // Check for achievable achievement unlock
        let rewardBadge: string | null = null;
        const nearBadge = achievements.find(a => !a.earned && a.target > 1 && a.progress / a.target >= 0.6);
        if (nearBadge) rewardBadge = nearBadge.name;
        return {
          trackName: entry.name,
          gap: target.toFixed(3),
          xpReward: 25,
          badge: rewardBadge,
        };
      }
    }
    // Fallback: suggest least-practiced track
    const trackCounts: Record<string, number> = {};
    sessions.forEach(s => { trackCounts[s.trackId] = (trackCounts[s.trackId] || 0) + 1; });
    const practiced = Object.entries(trackCounts).sort((a, b) => a[1] - b[1]);
    if (practiced.length > 0) {
      const name = F1_TRACKS.find(t => t.id === practiced[0][0])?.short ?? practiced[0][0];
      return { trackName: name, gap: null, xpReward: 15, badge: null };
    }
    return null;
  }, [sessions, achievements]);

  // #10 Session Recommendation Engine
  const recommendation = useMemo(() => {
    if (sessions.length < 3) return null;
    // Find track with best consistency + most sessions (good track to improve on)
    const trackData: Record<string, { count: number; consistency: number[]; pb: number }> = {};
    sessions.forEach(s => {
      if (!trackData[s.trackId]) trackData[s.trackId] = { count: 0, consistency: [], pb: Infinity };
      trackData[s.trackId].count++;
      const c = sessionConsistency(s);
      if (c !== null) trackData[s.trackId].consistency.push(c);
      const secs = lapToSeconds(s.bestLap);
      if (isFinite(secs) && secs > 0 && secs < trackData[s.trackId].pb) trackData[s.trackId].pb = secs;
    });
    // Score each track: high consistency + enough sessions = PB opportunity
    let best: { trackId: string; score: number; avgCons: number; count: number } | null = null;
    for (const [trackId, data] of Object.entries(trackData)) {
      if (data.consistency.length < 2) continue;
      const avgCons = data.consistency.reduce((a, b) => a + b, 0) / data.consistency.length;
      const score = avgCons * 0.6 + Math.min(data.count, 10) * 4;
      if (!best || score > best.score) {
        best = { trackId, score, avgCons, count: data.count };
      }
    }
    if (!best) return null;
    const track = F1_TRACKS.find(t => t.id === best!.trackId);
    // Pick a recent car used on that track
    const trackSessions = sessions.filter(s => s.trackId === best!.trackId).sort((a, b) => b.date.localeCompare(a.date));
    const car = trackSessions[0]?.car ?? 'Any car';
    // Estimated gain: if high consistency, more likely to PB
    const gain = best.avgCons >= 96 ? '0.05–0.15' : best.avgCons >= 92 ? '0.15–0.30' : '0.30+';
    const confidence = Math.min(99, Math.round(best.avgCons * 0.85 + Math.min(best.count, 10) * 1.5));
    const lastAttempt = trackSessions[0]?.date ?? '';
    const lastDaysAgo = lastAttempt ? Math.floor((Date.now() - new Date(lastAttempt).getTime()) / 86400000) : null;
    return {
      trackName: track?.short ?? best.trackId,
      trackFlag: track?.flag ?? '',
      car,
      reason: best.avgCons >= 96 ? 'Strong consistency, PB opportunity detected' : 'Good consistency, room to improve',
      gain: `+${gain}s`,
      confidence,
      avgConsistency: best.avgCons,
      lastDaysAgo,
    };
  }, [sessions]);

  // Determine primary CTA priority
  const primaryCTA = useMemo(() => {
    // If daily challenge has no entries, push that
    if (daily.entries.length === 0) return 'challenge';
    // If a next goal with close gap exists, push that
    if (nextGoal?.gap) return 'goal';
    // Otherwise recommendation
    if (recommendation) return 'recommendation';
    return 'challenge';
  }, [daily.entries.length, nextGoal, recommendation]);

  // Badge tab filter
  const filteredBadges: Achievement[] = useMemo(() => {
    const cat = BADGE_CATEGORIES.find(c => c.label === badgeTab);
    if (!cat) return achievements;
    return achievements.filter(a => cat.ids.includes(a.id));
  }, [achievements, badgeTab]);

  return (
    <div className="page" style={{ gap: 0 }}>
      {/* ── Personalization Greeting (smarter coaching copy) ────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.04em', color: 'var(--white)' }}>
          {getGreeting()}, {userName}
        </div>
        {perfSnapshot?.coachingInsight && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 4, lineHeight: 1.5 }}>
            {perfSnapshot.coachingInsight}
          </div>
        )}
        {perfSnapshot?.subInsight && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
            {perfSnapshot.subInsight}
          </div>
        )}
      </div>

      {/* ── Quick Action Buttons ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('sessions')}>+ Session</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('setups')}>Load Setup</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('progress')}>Compare PB</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={() => setPage('community')}>Community</button>
      </div>

      {/* ── Rank + XP Progress Bar ──────────────────────────────────────── */}
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
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
                {earnedCount}/{achievements.length} badges
              </span>
            )}
          </div>
        </div>
        {nextTier && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>{rankInfo.rank}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: getRankColor(nextTier as DriverRank) }}>{nextTier}</span>
            </div>
            <div className="xp-bar-bg">
              <div className="xp-bar-fill" style={{ width: `${progressToNext}%`, background: getRankColor(rankInfo.rank) }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray)', marginTop: 2, textAlign: 'right' }}>
              {rankInfo.pointsToNext} XP to {nextTier}
            </div>
          </div>
        )}
      </div>

      {/* ── Last Session Summary ─────────────────────────────────────────── */}
      {lastSession && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Last Session</div>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setPage('sessions')}>View All</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--white)' }}>
                {F1_TRACKS.find(t => t.id === lastSession.trackId)?.flag} {trackName(lastSession.trackId)}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 2 }}>
                {lastSession.car} · {lastSession.type} · {lastSession.date}
              </div>
            </div>
            {lastSession.bestLap && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Best Lap</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: lastSession.isPB ? '#FFF200' : 'var(--teal)', fontWeight: 700 }}>
                  {lastSession.bestLap}{lastSession.isPB ? ' 🏆' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── #6 Next Goal ───────────────────────────────────────────────── */}
      {nextGoal && (
        <div className="card dash-next-goal" style={{ padding: '14px 20px', marginBottom: 12, border: '1px solid rgba(0,210,190,0.25)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 6 }}>Next Target</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 4 }}>
            {nextGoal.gap ? `Beat ${nextGoal.trackName} PB by ${nextGoal.gap}s` : `Practice ${nextGoal.trackName}`}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>+{nextGoal.xpReward} XP</span>
            {nextGoal.badge && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>Unlock: "{nextGoal.badge}"</span>
            )}
            <button className={`btn ${primaryCTA === 'goal' ? 'btn-primary dash-cta-pulse' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '5px 14px', marginLeft: 'auto' }} onClick={() => setPage('sessions')}>
              Start Attempt
            </button>
          </div>
        </div>
      )}

      {/* ── Stat Cards with micro-context ───────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card dash-stat-hover dash-fade-in">
          <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <div className="stat-label">Total Sessions</div>
          <div className="stat-value">
            <AnimatedCounter value={totalSessions} />
            {sessionsThisWeek > 0 && (
              <span className={`stat-trend ${sessionsThisWeek > sessionsLastWeek ? 'stat-trend--up' : sessionsThisWeek === sessionsLastWeek ? 'stat-trend--flat' : 'stat-trend--down'}`}>
                {sessionsThisWeek > sessionsLastWeek ? '↗' : sessionsThisWeek === sessionsLastWeek ? '→' : '↘'}
              </span>
            )}
          </div>
          {sessionsThisWeek > 0 && <div className="stat-micro" style={{ color: 'var(--teal)' }}>+{sessionsThisWeek} this week</div>}
          <Sparkline data={sessionSparkline} color="var(--red)" />
        </div>
        <div className="stat-card dash-stat-hover dash-fade-in">
          <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          <div className="stat-label">Tracks Practiced</div>
          <div className="stat-value">
            <AnimatedCounter value={tracksPracticed} />
            {tracksThisMonth.delta !== 0 && (
              <span className={`stat-trend ${tracksThisMonth.delta > 0 ? 'stat-trend--up' : 'stat-trend--down'}`}>
                {tracksThisMonth.delta > 0 ? `+${tracksThisMonth.delta}` : tracksThisMonth.delta}
              </span>
            )}
          </div>
          {mostDrivenTrack && <div className="stat-micro">Most driven: {mostDrivenTrack}</div>}
          <Sparkline data={trackSparkline} color="var(--teal)" />
        </div>
        <div className="stat-card dash-stat-hover dash-fade-in">
          <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          <div className="stat-label">Personal Bests</div>
          <div className="stat-value"><AnimatedCounter value={pbsSet} /></div>
          {lastPBDaysAgo && <div className="stat-micro">Last PB: {lastPBDaysAgo}</div>}
          <Sparkline data={pbSparkline} color="#FF9800" />
        </div>
        <div className="stat-card dash-stat-hover dash-fade-in" onClick={() => setPage('setups')} style={{ cursor: 'pointer' }}>
          <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          <div className="stat-label">Setups Saved</div>
          <div className="stat-value"><AnimatedCounter value={setupsSaved} /></div>
          <div className="stat-micro stat-cta" onClick={e => { e.stopPropagation(); setPage('setups'); }}>Create Setup →</div>
        </div>
      </div>

      {/* ── Daily Challenge ─────────────────────────────────────────────── */}
      <div className="card dash-challenge" style={{ padding: 0, marginBottom: 12, overflow: 'hidden', border: '1px solid rgba(0,210,190,0.3)' }}>
        <div style={{ background: 'rgba(0,210,190,0.06)', padding: '12px 20px', borderBottom: '1px solid rgba(0,210,190,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)' }}>Daily Challenge</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 2, color: DIFF_COLORS[daily.difficulty], border: `1px solid ${DIFF_COLORS[daily.difficulty]}44`, textTransform: 'uppercase' }}>
                {daily.difficulty}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.06em', color: 'var(--white)', marginTop: 2 }}>
              {daily.track.flag} {daily.track.short} — {daily.car}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>Resets in <CountdownTimer /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.05em', color: 'var(--teal)', marginTop: 2 }}>+{daily.xpReward} XP</div>
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
        <div style={{ padding: '8px 20px 12px', borderTop: '1px solid rgba(0,210,190,0.1)', textAlign: 'center' }}>
          <button className={`btn ${primaryCTA === 'challenge' ? 'btn-primary dash-cta-pulse' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '6px 28px' }} onClick={() => setPage('sessions')}>
            Start Challenge
          </button>
        </div>
      </div>

      {/* ── #10 Session Recommendation Engine ──────────────────────────── */}
      {recommendation && (
        <div className="card dash-stat-hover" style={{ padding: '14px 20px', marginBottom: 12, border: '1px solid rgba(232,0,45,0.2)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 6 }}>Recommended Session</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 2 }}>
            {recommendation.trackFlag} {recommendation.trackName} — {recommendation.car}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginBottom: 6 }}>
            {recommendation.reason}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>Est. gain: {recommendation.gain}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)' }}>Confidence: {recommendation.confidence}%</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)' }}>Consistency: {recommendation.avgConsistency.toFixed(1)}%</span>
            {recommendation.lastDaysAgo !== null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray)' }}>
                Last: {recommendation.lastDaysAgo === 0 ? 'Today' : recommendation.lastDaysAgo === 1 ? 'Yesterday' : `${recommendation.lastDaysAgo}d ago`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button className={`btn ${primaryCTA === 'recommendation' ? 'btn-primary dash-cta-pulse' : 'btn-secondary'}`} style={{ fontSize: 11, padding: '5px 14px' }} onClick={() => setPage('sessions')}>
              Run Session
            </button>
          </div>
        </div>
      )}

      {/* ── Performance Snapshot — 4 metric cards ──────────────────────── */}
      {perfSnapshot && (perfSnapshot.strongestTrack || perfSnapshot.weakestTrack) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 8 }}>Performance Snapshot</div>
          <div className="perf-snap-grid">
            {perfSnapshot.strongestTrack && (
              <div className="card perf-snap-card">
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strongest Track</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--teal)', letterSpacing: '0.04em', marginTop: 4 }}>{perfSnapshot.strongestTrack}</div>
                {perfSnapshot.strongestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>{perfSnapshot.strongestScore.toFixed(1)}%</div>}
              </div>
            )}
            {perfSnapshot.weakestTrack && (
              <div className="card perf-snap-card">
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Needs Work</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--red)', letterSpacing: '0.04em', marginTop: 4 }}>{perfSnapshot.weakestTrack}</div>
                {perfSnapshot.weakestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>{perfSnapshot.weakestScore.toFixed(1)}%</div>}
              </div>
            )}
            {perfSnapshot.bestSector && (
              <div className="card perf-snap-card">
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Best Sector</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--white)', letterSpacing: '0.04em', marginTop: 4 }}>{perfSnapshot.bestSector}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>Most consistent</div>
              </div>
            )}
            {perfSnapshot.worstSector && (
              <div className="card perf-snap-card">
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Biggest Time Loss</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#FF9800', letterSpacing: '0.04em', marginTop: 4 }}>{perfSnapshot.worstSector}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 2 }}>Most variance</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Achievements (tabbed by category) ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 6 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Achievements</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {BADGE_CATEGORIES.map(cat => (
            <button
              key={cat.label}
              onClick={() => setBadgeTab(cat.label)}
              className={`badge-tab${badgeTab === cat.label ? ' badge-tab-active' : ''}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {filteredBadges.map(a => {
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

      {/* ── Activity Heatmap (with rich tooltips + weekly summary) ──────── */}
      {/* #polish: tightened spacing before heatmap */}
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
                  fontSize: 11,
                  color: 'var(--gray)',
                  letterSpacing: '0.05em',
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
                    title={buildHeatmapTooltip(cell)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Sessions (enhanced table with mini bars) ─────────────── */}
      {/* #polish: tightened spacing between heatmap and sessions */}
      <div className="section-title" style={{ marginTop: 8 }}>Recent Sessions</div>
      {recentSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Yet</div>
            <div className="empty-state-desc">Head to the Sessions page to log your first session.</div>
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
                  <td><span className={`badge ${(['badge-practice', 'badge-qualifying', 'badge-race', 'badge-hotlap', 'badge-hotlap'] as const)[['Practice', 'Qualifying', 'Race', 'Hotlap', 'Time Trial'].indexOf(s.type)] || 'badge-practice'}`}>{s.type}</span></td>
                  <td>
                    <div className="mini-bars-cell">
                      <MiniBar value={Math.min(5, Math.round(s.rating * 1))} label="Pace" />
                      <MiniBar value={s.consistency !== null ? Math.min(5, Math.round(s.consistency / 20)) : 0} label="Clean" />
                      <MiniBar value={s.consistency !== null ? Math.min(5, Math.round((s.consistency - 80) / 4)) : 0} label="Consist" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tracks needing attention */}
      {neglectedTracks.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 12 }}>Needs Practice — 14+ Days</div>
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
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>{t.daysSince}d</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
