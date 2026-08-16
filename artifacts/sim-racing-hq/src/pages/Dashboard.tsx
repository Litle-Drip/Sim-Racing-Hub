import { useMemo, useRef, useEffect, useState } from 'react';
import { useGetSessions, useGetSetups, useGetCommunitySessions } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapToSeconds } from '../lib/storage';
import { calculateStreak, calculateRank, getDailyChallenge, calculateAchievements, sessionConsistency, PENDING_CHALLENGE_KEY, estimateSeatTimeMinutes } from '../lib/engagement';
import type { Achievement } from '../lib/engagement';
import { SHOW_ACHIEVEMENTS, SHOW_XP, SHOW_NEXT_TARGET } from '../lib/features';
import { SessionDetailModal, validLaps } from '../components/SessionDetail';
import { useRivalNotifications } from '../lib/rivalNotifications';
import { useUnseenSessions } from '../lib/newSessions';
import { Flame, Trophy } from 'lucide-react';

const DIFF_COLORS: Record<string, string> = {
  Easy: 'var(--green)',
  Medium: 'var(--amber)',
  Hard: 'var(--red)',
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

const GUEST_SESSIONS_KEY = 'f1simhub-guest-sessions';

interface DashboardProps {
  setPage: (p: string) => void;
  isGuest?: boolean;
}

export default function Dashboard({ setPage, isGuest }: DashboardProps) {
  const { data: apiSessions = [] } = useGetSessions(isGuest ? { query: { enabled: false } as never } : undefined);
  const { data: apiSetups = [] } = useGetSetups(isGuest ? { query: { enabled: false } as never } : undefined);
  const { data: communitySessions = [] } = useGetCommunitySessions();
  const { count: rivalNotificationCount } = useRivalNotifications();
  const { user } = useUser();

  const [guestSessions] = useState<SessionRecord[]>(() => {
    if (!isGuest) return [];
    try {
      const raw = localStorage.getItem(GUEST_SESSIONS_KEY);
      return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
    } catch { return []; }
  });

  const sessions: SessionRecord[] = isGuest ? guestSessions : apiSessions;
  const setups = isGuest ? [] : apiSetups;
  const [badgeTab, setBadgeTab] = useState('Skill');
  const [detailSession, setDetailSession] = useState<SessionRecord | null>(null);

  // Sessions that landed since the driver last looked glow here too — a live
  // session arriving should be visible from whichever page they're on.
  const { isNew, markSeen } = useUnseenSessions(sessions);

  const openSession = (s: SessionRecord) => { markSeen(s.id); setDetailSession(s); };

  const startChallenge = () => {
    try {
      sessionStorage.setItem(PENDING_CHALLENGE_KEY, JSON.stringify({ trackId: daily.track.id, car: daily.car }));
    } catch { /* ignore — Sessions page will just open the blank form */ }
    setPage('sessions');
  };

  const totalSessions = sessions.length;
  // Only circuits on the current calendar count. Companion uploads and older
  // imports can carry ids F1_TRACKS doesn't know (e.g. "track_42"), which
  // pushed this past the 24-circuit total — the dashboard read "25/24".
  // Sessions.tsx already filters its own count the same way.
  const tracksPracticed = useMemo(
    () => new Set(sessions.map(s => s.trackId).filter(id => F1_TRACKS.some(t => t.id === id))).size,
    [sessions],
  );
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  const streak = useMemo(() => calculateStreak(sessions), [sessions]);
  const rankInfo = useMemo(() => calculateRank(sessions), [sessions]);
  const achievements = useMemo(() => calculateAchievements(sessions, setups.length), [sessions, setups]);

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
    // Filtered to known circuits for the same reason as tracksPracticed above,
    // so the delta can't count a circuit the total doesn't.
    const known = (ids: string[]) => new Set(ids.filter(id => F1_TRACKS.some(t => t.id === id))).size;
    const curr = known(sessions.filter(s => s.date >= monthStr).map(s => s.trackId));
    const prev = known(sessions.filter(s => s.date >= prevStr && s.date < monthStr).map(s => s.trackId));
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

  // The Last Session card runs the full content width, and on desktop most of
  // it was empty. These are the numbers worth knowing before deciding whether
  // to open the session; CSS drops them on narrow screens so the card stays a
  // one-line summary on a phone.
  const lastSessionMetrics = useMemo(() => {
    if (!lastSession) return [];
    const out: { label: string; value: string; color?: string }[] = [];

    if (lastSession.avgLap && lastSession.avgLap.trim() !== '') {
      out.push({ label: 'Avg Lap', value: lastSession.avgLap });
    }

    const lapCount = validLaps(lastSession.laps).length;
    if (lapCount > 0) out.push({ label: 'Laps', value: String(lapCount) });

    const cons = sessionConsistency(lastSession);
    if (cons !== null) {
      out.push({
        label: 'Consistency',
        value: `${cons.toFixed(1)}%`,
        color: cons >= 98 ? 'var(--teal)' : cons >= 95 ? 'var(--white)' : 'var(--amber)',
      });
    }

    // Gap to the driver's own best at this circuit — the one number that says
    // whether the run was actually any good.
    const trackBest = sessions
      .filter(s => s.trackId === lastSession.trackId && s.bestLap && s.bestLap.trim() !== '')
      .map(s => lapToSeconds(s.bestLap))
      .filter(v => isFinite(v) && v > 0);
    const lastSecs = lapToSeconds(lastSession.bestLap);
    if (trackBest.length > 0 && isFinite(lastSecs) && lastSecs > 0) {
      const gap = lastSecs - Math.min(...trackBest);
      out.push({
        label: 'Δ PB',
        value: gap <= 0 ? 'PB' : `+${gap.toFixed(3)}`,
        color: gap <= 0 ? 'var(--teal)' : gap < 0.5 ? 'var(--amber)' : 'var(--red)',
      });
    }

    // The grid is four columns wide; the best lap always takes the first.
    return out.slice(0, 3);
  }, [lastSession, sessions]);

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
    // Fallback coaching lines. The XP-distance line is skipped while XP is
    // hidden \u2014 it quotes a number the driver has no way to see \u2014 so the
    // consistency prompt below becomes the fallback instead.
    if (!coachingInsight) {
      if (SHOW_XP && rankInfo.nextRank) {
        coachingInsight = `${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
      } else if (weakest) {
        const name = F1_TRACKS.find(t => t.id === weakest.id)?.short ?? weakest.id;
        coachingInsight = `Focus today: consistency at ${name}`;
      }
    }

    // Build sub-line with streak + rank distance
    const showRankDistance = SHOW_XP && rankInfo.nextRank;
    let subInsight = '';
    if (streak > 0 && showRankDistance) {
      subInsight = `PB streak: ${streak} day${streak !== 1 ? 's' : ''} \u2022 ${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
    } else if (streak > 0) {
      subInsight = `PB streak: ${streak} day${streak !== 1 ? 's' : ''}`;
    } else if (showRankDistance) {
      subInsight = `${rankInfo.pointsToNext} XP until ${rankInfo.nextRank}`;
    }

    // Overall consistency across every session that has both a best and an
    // average lap to compare.
    const consistencyScores = sessions
      .map(s => sessionConsistency(s))
      .filter((c): c is number => c !== null);
    const avgConsistency = consistencyScores.length > 0
      ? consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length
      : null;

    // Outright fastest lap on record, and where it was set.
    let fastestLap: { time: string; track: string } | null = null;
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      const secs = lapToSeconds(s.bestLap);
      if (!isFinite(secs) || secs <= 0) return;
      if (!fastestLap || secs < lapToSeconds(fastestLap.time)) {
        fastestLap = { time: s.bestLap, track: F1_TRACKS.find(t => t.id === s.trackId)?.short ?? s.trackId };
      }
    });

    return {
      strongestTrack: strongest ? F1_TRACKS.find(t => t.id === strongest.id)?.short ?? strongest.id : null,
      strongestScore: strongest?.avg ?? null,
      weakestTrack: weakest && weakest.id !== strongest?.id ? F1_TRACKS.find(t => t.id === weakest.id)?.short ?? weakest.id : null,
      weakestScore: weakest && weakest.id !== strongest?.id ? weakest.avg : null,
      bestSector,
      worstSector,
      avgConsistency,
      fastestLap: fastestLap as { time: string; track: string } | null,
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
    const totalMinutes = Math.round(estimateSeatTimeMinutes(weekSessions));
    return { sessions: weekSessions.length, pbs, seatTime: totalMinutes };
  }, [sessions]);

  const { cells } = useMemo(() => buildHeatmap(sessions), [sessions]);
  const monthLabels = useMemo(() => buildMonthLabels(cells), [cells]);

  // Summary rail beside the calendar — reads off the same 365-day cells the
  // grid is drawn from, so the two can't disagree. Columns are weeks and each
  // column runs Sun→Sat, so flattening in order gives chronological days.
  const heatmapStats = useMemo(() => {
    const days = cells.flat();
    let activeDays = 0;
    let totalSessions = 0;
    let pbs = 0;
    let longestStreak = 0;
    let run = 0;
    let busiest: { date: string; count: number } | null = null;

    for (const d of days) {
      totalSessions += d.count;
      pbs += d.pbs;
      if (d.count > 0) {
        activeDays++;
        run++;
        if (run > longestStreak) longestStreak = run;
        if (!busiest || d.count > busiest.count) busiest = { date: d.date, count: d.count };
      } else {
        run = 0;
      }
    }

    return { activeDays, totalSessions, pbs, longestStreak, busiest: busiest as { date: string; count: number } | null };
  }, [cells]);

  const heatmapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heatmapRef.current;
    if (!el) return;
    // Snap to the most recent whole day-column (10px cell + 3px gap = 13px
    // stride) so the leftmost visible column is never sliced mid-cell —
    // scrolling to raw scrollWidth can land on a fractional offset that
    // clips the first visible month label.
    const COLUMN_STRIDE = 13;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.floor(max / COLUMN_STRIDE) * COLUMN_STRIDE;
  }, [cells]);

  const trackName = (id: string) => {
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? t.short : id;
  };

  // #polish: capitalize name properly
  const rawName = user?.firstName ?? user?.username ?? 'Driver';
  const userName = capitalize(rawName);

  // Rank progress bar

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

  // Determine primary CTA priority. The session recommendation moved to the
  // Race Engineer, so the Daily Challenge is the fallback the pulse lands on.
  const primaryCTA = useMemo(() => {
    // If daily challenge has no entries, push that
    if (daily.entries.length === 0) return 'challenge';
    // If a next goal with close gap exists, push that — but not while the
    // Next Target card is hidden, or the pulse would mark a card that
    // never renders and no CTA would be highlighted at all.
    if (SHOW_NEXT_TARGET && nextGoal?.gap) return 'goal';
    return 'challenge';
  }, [daily.entries.length, nextGoal]);

  // Badge tab filter
  const filteredBadges: Achievement[] = useMemo(() => {
    const cat = BADGE_CATEGORIES.find(c => c.label === badgeTab);
    if (!cat) return achievements;
    return achievements.filter(a => cat.ids.includes(a.id));
  }, [achievements, badgeTab]);

  return (
    <div className="page">
      {/* ── Personalization Greeting (smarter coaching copy) ────────────── */}
      {/* The greeting is this page's title, so it uses the page header every
          other screen uses rather than its own 18px heading. The streak line
          moves opposite it, where a page's supporting figure already sits. */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{getGreeting()}, {userName}</h1>
          {perfSnapshot?.coachingInsight && (
            <div className="page-subtitle">{perfSnapshot.coachingInsight}</div>
          )}
        </div>
        {perfSnapshot?.subInsight && (
          <div className="page-header-meta" style={{ fontFamily: 'var(--font-mono)' }}>
            {perfSnapshot.subInsight}
          </div>
        )}
      </div>

      {/* ── Quick Action Buttons ────────────────────────────────────────── */}
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setPage('sessions')}>+ Session</button>
        <button className="btn btn-secondary" onClick={() => setPage('setups')}>Load Setup</button>
        <button className="btn btn-secondary" onClick={() => setPage('progress')}>Compare PB</button>
        <button className="btn btn-secondary" onClick={() => setPage('community')}>Community</button>
        {/* Rivals sits right next to Community and carries the same count as
            the sidebar, so a waiting challenge or an unread result is
            visible from the first screen you land on. */}
        <button className="btn btn-secondary" onClick={() => setPage('rivals')}>
          Rivals
          {rivalNotificationCount > 0 && (
            <span className="page-tab-count">{rivalNotificationCount}</span>
          )}
        </button>
      </div>

      {/* ── Achievements (tabbed by category) ──────────────────────────── */}
      {SHOW_ACHIEVEMENTS && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Achievements</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
            {filteredBadges.map(a => {
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
          <Sparkline data={pbSparkline} color="var(--amber)" />
        </div>
        <div className="stat-card dash-stat-hover dash-fade-in" onClick={() => setPage('setups')} style={{ cursor: 'pointer' }}>
          <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          <div className="stat-label">Setups Saved</div>
          <div className="stat-value"><AnimatedCounter value={setupsSaved} /></div>
          <div className="stat-micro stat-cta" onClick={e => { e.stopPropagation(); setPage('setups'); }}>Create Setup →</div>
        </div>
      </div>

      {/* ── Last Session Summary ─────────────────────────────────────────── */}
      {lastSession && (
        <div
          className={`card dash-stat-hover${isNew(lastSession.id) ? ' session-card--new' : ''}`}
          style={{ padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-4)', cursor: 'pointer' }}
          onClick={() => openSession(lastSession)}
          title="Click to view full session details"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div className="stat-label" style={{ marginBottom: 0 }}>Last Session</div>
              {isNew(lastSession.id) && (
                <span title="Landed since you last looked" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--teal)' }}>
                  <span className="session-new-dot" />NEW
                </span>
              )}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setPage('sessions'); }}>View All</button>
          </div>
          <div className="last-session-body">
            <div className="last-session-meta">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--white)' }}>
                {F1_TRACKS.find(t => t.id === lastSession.trackId)?.flag} {trackName(lastSession.trackId)}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)', marginTop: 'var(--space-1)' }}>
                {lastSession.car} · {lastSession.type} · {lastSession.date}
                {lastSession.createdAt && !isNaN(new Date(lastSession.createdAt).getTime()) && (
                  <> · {new Date(lastSession.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</>
                )}
              </div>
              {lastSession.notes && <div className="last-session-notes">{lastSession.notes}</div>}
            </div>
            <div className="last-session-metrics">
              {lastSession.bestLap && (
                <div className="last-session-metric">
                  <div className="last-session-metric-label">Best Lap</div>
                  <div className="last-session-metric-value" style={{ color: lastSession.isPB ? 'var(--yellow)' : 'var(--teal)' }}>
                    {lastSession.bestLap}{lastSession.isPB && <Trophy size={13} aria-label="Personal best" />}
                  </div>
                </div>
              )}
              {lastSessionMetrics.map(m => (
                <div key={m.label} className="last-session-metric last-session-metric--secondary">
                  <div className="last-session-metric-label">{m.label}</div>
                  <div className="last-session-metric-value" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Performance Snapshot — one row of measures the stat cards above
             don't already carry. Session/PB/circuit counts live up there; if a
             number is on both, it was cut from here. ──────────────────────── */}
      {perfSnapshot && (perfSnapshot.strongestTrack || perfSnapshot.weakestTrack) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="section-title">Performance Snapshot</div>
          <div className="perf-snap-grid">
            {perfSnapshot.strongestTrack && (
              <div className="card perf-snap-card">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Strongest Track</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--teal)', letterSpacing: '0.04em' }}>{perfSnapshot.strongestTrack}</div>
                {perfSnapshot.strongestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>{perfSnapshot.strongestScore.toFixed(1)}%</div>}
              </div>
            )}
            {perfSnapshot.weakestTrack && (
              <div className="card perf-snap-card">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Needs Work</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--red)', letterSpacing: '0.04em' }}>{perfSnapshot.weakestTrack}</div>
                {perfSnapshot.weakestScore !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>{perfSnapshot.weakestScore.toFixed(1)}%</div>}
              </div>
            )}
            {perfSnapshot.bestSector && (
              <div className="card perf-snap-card perf-snap-card--secondary">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Best Sector</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--white)', letterSpacing: '0.04em' }}>{perfSnapshot.bestSector}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Most consistent</div>
              </div>
            )}
            {perfSnapshot.worstSector && (
              <div className="card perf-snap-card perf-snap-card--secondary">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Biggest Time Loss</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--amber)', letterSpacing: '0.04em' }}>{perfSnapshot.worstSector}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Most variance</div>
              </div>
            )}
            {perfSnapshot.fastestLap && (
              <div className="card perf-snap-card">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Fastest Lap</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--teal)', letterSpacing: '0.02em' }}>{perfSnapshot.fastestLap.time}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>{perfSnapshot.fastestLap.track}</div>
              </div>
            )}
            {perfSnapshot.avgConsistency !== null && (
              <div className="card perf-snap-card">
                <div className="stat-label" style={{ marginBottom: 'var(--space-1)' }}>Avg Consistency</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '0.04em', color: perfSnapshot.avgConsistency >= 98 ? 'var(--teal)' : perfSnapshot.avgConsistency >= 95 ? 'var(--white)' : 'var(--amber)' }}>
                  {perfSnapshot.avgConsistency.toFixed(1)}%
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Best vs average lap</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Activity Heatmap (with rich tooltips + weekly summary) ──────── */}
      {/* #polish: tightened spacing before heatmap */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Activity — Last 365 Days</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>
          <span>This week: <strong style={{ color: 'var(--white)' }}>{weeklySummary.sessions}</strong> sessions</span>
          <span><strong style={{ color: 'var(--teal)' }}>{weeklySummary.pbs}</strong> PBs</span>
          <span>~<strong style={{ color: 'var(--white)' }}>{weeklySummary.seatTime}</strong> min</span>
        </div>
      </div>
      <div className="heatmap-section">
        <div className="heatmap-header">
          <div className="heatmap-legend">
            <span className="legend-dot" style={{ background: 'var(--border)', border: '1px solid var(--border-accent)' }} />
            <span style={{ fontSize: 'var(--fs-label)' }}>None</span>
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.35)' }} />
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.6)' }} />
            <span className="legend-dot" style={{ background: 'var(--red)' }} />
            <span style={{ fontSize: 'var(--fs-label)' }}>Active</span>
          </div>
          {/* The streak belongs against the calendar it's counted from,
              rather than in a card of its own. */}
          {streak > 0 && (
            <span className="heatmap-streak" title={`${streak} consecutive days with a logged session`}>
              <Flame size={13} aria-hidden="true" />
              {streak} day streak
            </span>
          )}
        </div>

        <div className="heatmap-body">
        <div className="heatmap-scroll" ref={heatmapRef}>
          <div style={{ display: 'flex', marginBottom: 'var(--space-1)', paddingLeft: 'var(--space-4)' }}>
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

        {/* Year summary — fills the space left over beside a 53-week grid on
            wide screens, and stacks under it on narrow ones. */}
        <div className="heatmap-stats">
          <div className="heatmap-stat">
            <div className="heatmap-stat-label">Active Days</div>
            <div className="heatmap-stat-value">{heatmapStats.activeDays}</div>
            <div className="heatmap-stat-sub">of last 365</div>
          </div>
          <div className="heatmap-stat">
            <div className="heatmap-stat-label">Longest Streak</div>
            <div className="heatmap-stat-value">{heatmapStats.longestStreak}<span className="heatmap-stat-unit">d</span></div>
            <div className="heatmap-stat-sub">{streak === heatmapStats.longestStreak && streak > 0 ? 'Current run' : 'Personal best'}</div>
          </div>
          <div className="heatmap-stat">
            <div className="heatmap-stat-label">PBs This Year</div>
            <div className="heatmap-stat-value" style={{ color: 'var(--teal)' }}>{heatmapStats.pbs}</div>
            <div className="heatmap-stat-sub">{heatmapStats.totalSessions} sessions</div>
          </div>
          <div className="heatmap-stat">
            <div className="heatmap-stat-label">Busiest Day</div>
            <div className="heatmap-stat-value">
              {heatmapStats.busiest ? heatmapStats.busiest.count : '—'}
              {heatmapStats.busiest && <span className="heatmap-stat-unit">runs</span>}
            </div>
            <div className="heatmap-stat-sub">
              {heatmapStats.busiest
                ? new Date(heatmapStats.busiest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'No sessions yet'}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Tracks needing attention — moved right after heatmap */}
      {neglectedTracks.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 'var(--space-5)' }}>Needs Practice — 14+ Days</div>
          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            marginBottom: 'var(--space-4)',
          }}>
            {neglectedTracks.map(t => (
              <div
                key={t.id}
                title={`${t.short} — ${t.daysSince} day${t.daysSince !== 1 ? 's' : ''} ago`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  cursor: 'pointer',
                  opacity: 0.85,
                }}
                onClick={() => setPage('tracks')}
              >
                <span style={{ fontSize: 24 }}>{t.flag}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>{t.daysSince}d</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* The rank card that sat here is gone. Once XP and badges were hidden
          it held nothing but the tier name and the streak, and the streak now
          lives on the heatmap it is counted from. Rank is still shown on the
          sidebar profile card. */}

      {/* ── #6 Next Goal ───────────────────────────────────────────────── */}
      {SHOW_NEXT_TARGET && nextGoal && (
        <div className="card dash-next-goal card-accent card-accent--teal" style={{ padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-4)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 'var(--space-2)' }}>Next Target</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--white)', marginBottom: 'var(--space-2)' }}>
            {nextGoal.gap ? `Beat ${nextGoal.trackName} PB by ${nextGoal.gap}s` : `Practice ${nextGoal.trackName}`}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--teal)' }}>+{nextGoal.xpReward} XP</span>
            {nextGoal.badge && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>Unlock: "{nextGoal.badge}"</span>
            )}
            <button className={`btn ${primaryCTA === 'goal' ? 'btn-primary dash-cta-pulse' : 'btn-secondary'}`} style={{ marginLeft: 'auto' }} onClick={() => setPage('sessions')}>
              Start Attempt
            </button>
          </div>
        </div>
      )}

      {/* ── Daily Challenge ─────────────────────────────────────────────── */}
      <div className="card dash-challenge card-accent card-accent--teal" style={{ padding: 0, marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)' }}>Daily Challenge</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 'var(--radius)', color: DIFF_COLORS[daily.difficulty], border: `1px solid ${DIFF_COLORS[daily.difficulty]}44`, textTransform: 'uppercase' }}>
                {daily.difficulty}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--white)', marginTop: 'var(--space-1)' }}>
              {daily.track.flag} {daily.track.short} — {daily.car}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Resets in <CountdownTimer /></div>
            {/* The reward reads off the XP system; with XP hidden it would
                point at something the driver can no longer see. */}
            {SHOW_XP && <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.05em', color: 'var(--teal)', marginTop: 2 }}>+{daily.xpReward} XP</div>}
          </div>
        </div>
        {daily.entries.length > 0 && (
          <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--border)' }}>
            {daily.entries.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', padding: '3px 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: i === 0 ? 'var(--teal)' : 'var(--gray-mid)', width: 16 }}>{i + 1}.</span>
                <span className={i === 0 ? 'pb-time' : 'lap-time'}>{s.bestLap}</span>
                <span style={{ color: 'var(--gray-light)' }}>{s.authorName}</span>
              </div>
            ))}
          </div>
        )}
        {/* The action used to sit centred in a strip of its own, with a band
            of empty card either side of it and — on an empty board — a lone
            line of text in the strip above. Hint and action share one row,
            action right, like every other card on the page. */}
        <div style={{ padding: 'var(--space-3) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {daily.entries.length === 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)' }}>
              Be first on the board today.
            </span>
          )}
          <button
            className={`btn ${primaryCTA === 'challenge' ? 'btn-primary dash-cta-pulse' : 'btn-secondary'}`}
            style={{ marginLeft: 'auto' }}
            onClick={startChallenge}
          >
            Start Challenge
          </button>
        </div>
      </div>


      {/* ── Recent Sessions (enhanced table with mini bars) ─────────────── */}
      {/* #polish: tightened spacing between heatmap and sessions */}
      <div className="section-title" style={{ marginTop: 'var(--space-5)' }}>Recent Sessions</div>
      {recentSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Yet</div>
            <div className="empty-state-desc">Head to the Sessions page to log your first session.</div>
          </div>
          <div style={{ textAlign: 'center', paddingBottom: 'var(--space-5)' }}>
            <button className="btn btn-primary" onClick={() => setPage('sessions')}>Log Your First Session</button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--stack">
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
                <tr
                  key={s.id}
                  className={isNew(s.id) ? 'session-row--new' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openSession(s)}
                  title="Click to view full session details"
                >
                  <td data-label="Date" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td data-label="Track">{trackName(s.trackId)}</td>
                  <td data-label="Car" style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                  <td data-label="Best Lap">
                    <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                    {s.isPB && <span className="pb-badge">★ PB</span>}
                  </td>
                  <td data-label="Δ PB">
                    {s.delta !== null && s.delta !== 0 ? (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: s.delta <= 0 ? 'var(--teal)' : s.delta < 0.5 ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {s.delta <= 0 ? '—' : `+${s.delta.toFixed(3)}`}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--gray)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td data-label="Consistency">
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
                  <td data-label="Type"><span className={`badge ${(['badge-practice', 'badge-qualifying', 'badge-race', 'badge-hotlap', 'badge-hotlap'] as const)[['Practice', 'Qualifying', 'Race', 'Hotlap', 'Time Trial'].indexOf(s.type)] || 'badge-practice'}`}>{s.type}</span></td>
                  <td data-label="Rating">
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

      {detailSession && (
        <SessionDetailModal session={detailSession} onClose={() => setDetailSession(null)} />
      )}
    </div>
  );
}
