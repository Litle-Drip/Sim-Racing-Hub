import type { SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, F1_25_CARS } from '../data/f1Tracks';
import { lapToSeconds } from './storage';

// ─── Daily Challenge ─────────────────────────────────────────────────────────

export type ChallengeDifficulty = 'Easy' | 'Medium' | 'Hard';

/** sessionStorage key used to hand off the Daily Challenge's track/car from
 * the Dashboard's "Start Challenge" button to the Sessions page's log form —
 * page switches in this app are plain state changes with no route params. */
export const PENDING_CHALLENGE_KEY = 'f1simhub-pending-challenge';

export function getDailyChallenge(forDate: Date = new Date()) {
  const dayOfYear = Math.floor((forDate.getTime() - new Date(forDate.getFullYear(), 0, 0).getTime()) / 86400000);
  const trackIdx = dayOfYear % F1_TRACKS.length;
  const carIdx = Math.floor(dayOfYear / F1_TRACKS.length) % F1_25_CARS.length;
  const track = F1_TRACKS[trackIdx];
  const hardTracks = ['monaco', 'jeddah', 'marina_bay', 'baku', 'suzuka', 'spa'];
  const easyTracks = ['monza', 'red_bull_ring', 'albert_park', 'bahrain'];
  const difficulty: ChallengeDifficulty = hardTracks.includes(track.id) ? 'Hard' : easyTracks.includes(track.id) ? 'Easy' : 'Medium';
  const xpReward = difficulty === 'Hard' ? 30 : difficulty === 'Medium' ? 20 : 10;
  return { track, car: F1_25_CARS[carIdx], date: forDate.toISOString().slice(0, 10), difficulty, xpReward };
}

/** Whether a logged session happens to match that day's Daily Challenge (same track + car, on the challenge's date). */
export function isDailyChallengeSession(session: Pick<SessionRecord, 'trackId' | 'car' | 'date'>): boolean {
  if (!session.date) return false;
  // Parsing as UTC noon avoids the date rolling back a day in negative-offset timezones.
  const d = new Date(`${session.date}T12:00:00`);
  if (isNaN(d.getTime())) return false;
  const challenge = getDailyChallenge(d);
  return session.trackId === challenge.track.id && session.car === challenge.car;
}

// ─── Streak ──────────────────────────────────────────────────────────────────

export function calculateStreak(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0;
  const dates = new Set(sessions.map(s => s.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let check = new Date(today);
  // If no session today, start from yesterday
  if (!dates.has(check.toISOString().slice(0, 10))) {
    check.setDate(check.getDate() - 1);
  }
  while (dates.has(check.toISOString().slice(0, 10))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

// ─── Consistency Score ───────────────────────────────────────────────────────

export function sessionConsistency(session: SessionRecord): number | null {
  const best = lapToSeconds(session.bestLap);
  const avg = lapToSeconds(session.avgLap);
  if (!isFinite(best) || !isFinite(avg) || best <= 0 || avg <= 0) return null;
  return Math.max(0, Math.min(100, (best / avg) * 100));
}

export function trackConsistency(sessions: SessionRecord[], trackId: string): number | null {
  const trackSessions = sessions.filter(s => s.trackId === trackId);
  const scores = trackSessions.map(s => sessionConsistency(s)).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─── Seat Time ───────────────────────────────────────────────────────────────
// Flat per-type minutes are only a fallback for sessions with no logged lap
// data — whenever real lap times (or an avg lap x total laps) are available,
// use those instead of guessing.

const SESSION_TYPE_MINUTES: Record<string, number> = {
  Practice: 30, Qualifying: 20, Race: 60, Hotlap: 15, 'Time Trial': 20,
};

export function estimateSessionMinutes(session: SessionRecord): number {
  const lapSeconds: number[] = (session.laps ?? [])
    .map((l: { time: string }) => lapToSeconds(l.time))
    .filter((t: number): t is number => isFinite(t) && t > 0);
  if (lapSeconds.length > 0) {
    return lapSeconds.reduce((a: number, b: number) => a + b, 0) / 60;
  }

  const avg = lapToSeconds(session.avgLap ?? '');
  if (isFinite(avg) && avg > 0 && session.totalLaps) {
    return (avg * session.totalLaps) / 60;
  }

  return SESSION_TYPE_MINUTES[session.type] ?? 25;
}

export function estimateSeatTimeMinutes(sessions: SessionRecord[]): number {
  return sessions.reduce((acc, s) => acc + estimateSessionMinutes(s), 0);
}

// ─── Driver Rank ─────────────────────────────────────────────────────────────
//
// Single source of truth for rank tiers, thresholds, and colors — Nav,
// Dashboard, and Account all read RANK_TIERS/getRankColor instead of keeping
// their own copies, so a tier list change (like adding Legend/World
// Champion below) can't silently drift out of sync between screens.

export type DriverRank = 'Rookie' | 'Amateur' | 'Intermediate' | 'Expert' | 'Elite' | 'Pro' | 'Legend' | 'World Champion';

export interface RankInfo {
  rank: DriverRank;
  points: number;
  nextRank: DriverRank | null;
  pointsToNext: number;
}

// Ascending order — the last entry is the ceiling. Pro (500) was previously
// the top tier, which meant any driver with a few hundred logged sessions
// maxed out and stopped seeing rank progress entirely. Legend and World
// Champion give long-term players somewhere left to climb.
export const RANK_TIERS: { rank: DriverRank; min: number }[] = [
  { rank: 'Rookie', min: 0 },
  { rank: 'Amateur', min: 30 },
  { rank: 'Intermediate', min: 100 },
  { rank: 'Expert', min: 200 },
  { rank: 'Elite', min: 350 },
  { rank: 'Pro', min: 500 },
  { rank: 'Legend', min: 800 },
  { rank: 'World Champion', min: 1300 },
];

const RANK_COLORS: Record<DriverRank, string> = {
  Rookie: '#888',
  Amateur: '#4CAF50',
  Intermediate: '#2196F3',
  Expert: '#9C27B0',
  Elite: '#FF9800',
  Pro: '#E8002D',
  Legend: '#FFD700',
  'World Champion': '#00E5FF',
};

export function getRankColor(rank: DriverRank): string {
  return RANK_COLORS[rank];
}

/** Progress toward the next tier, derived the same way everywhere a rank progress bar is drawn. */
export function getRankProgress(info: RankInfo): { currentMin: number; nextMin: number | null; pct: number } {
  const currentTierIdx = RANK_TIERS.findIndex(t => t.rank === info.rank);
  const currentMin = RANK_TIERS[currentTierIdx]?.min ?? 0;
  const nextMin = info.nextRank ? RANK_TIERS.find(t => t.rank === info.nextRank)?.min ?? null : null;
  const pct = nextMin !== null
    ? Math.max(0, Math.min(100, ((info.points - currentMin) / (nextMin - currentMin)) * 100))
    : 100;
  return { currentMin, nextMin, pct };
}

export function calculateRank(sessions: SessionRecord[]): RankInfo {
  let points = 0;
  // Sessions logged (1pt each, max 150 — long-term activity keeps counting
  // for longer before this term caps out).
  points += Math.min(sessions.length, 150);
  // Tracks practiced (5pts each)
  const tracks = new Set(sessions.map(s => s.trackId));
  points += tracks.size * 5;
  // PBs set (3pts each) — naturally self-limiting, since you can only PB
  // once per track/car combination, so this is left uncapped.
  points += sessions.filter(s => s.isPB).length * 3;
  // Consistency bonus: sessions with >96% consistency are worth 2pts each,
  // capped at 20 qualifying sessions (40pts) so grinding easy hotlaps can't
  // dwarf the session-count, track-coverage, and PB terms above — those
  // reflect real breadth of play, this is meant as a bonus, not the driver.
  const consistentSessions = sessions.filter(s => {
    const c = sessionConsistency(s);
    return c !== null && c > 96;
  }).length;
  points += Math.min(consistentSessions, 20) * 2;
  // All 24 tracks bonus
  if (tracks.size >= 24) points += 50;

  return resolveRankTier(points);
}

/**
 * Looks up which tier a raw point total falls into against RANK_TIERS.
 * Split out from calculateRank so callers that can't build a full
 * SessionRecord[] (e.g. the public driver profile, which only gets
 * aggregate counts back from the API) still resolve rank against the same
 * tier list instead of keeping their own copy that can drift out of sync.
 */
export function resolveRankTier(points: number): RankInfo {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (points >= t.min) tier = t;
    else break;
  }
  const tierIdx = RANK_TIERS.indexOf(tier);
  const nextTier = tierIdx < RANK_TIERS.length - 1 ? RANK_TIERS[tierIdx + 1] : null;

  return {
    rank: tier.rank,
    points,
    nextRank: nextTier?.rank ?? null,
    pointsToNext: nextTier ? nextTier.min - points : 0,
  };
}

// ─── Achievements ────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  earned: boolean;
  progress: number;
  target: number;
}

export function calculateAchievements(sessions: SessionRecord[], setupCount: number): Achievement[] {
  const tracks = new Set(sessions.map(s => s.trackId));
  const pbCount = sessions.filter(s => s.isPB).length;
  const hasMonacoPB = sessions.some(s => s.isPB && s.trackId === 'monaco');
  const consistentSession = sessions.some(s => {
    const best = lapToSeconds(s.bestLap);
    const worst = lapToSeconds(s.worstLap);
    return isFinite(best) && isFinite(worst) && best > 0 && worst > 0 && (worst - best) < 0.5;
  });
  const maxSessionsPerDay = (() => {
    const byDate: Record<string, number> = {};
    sessions.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + 1; });
    return Math.max(0, ...Object.values(byDate));
  })();

  return [
    { id: 'podium', name: 'Podium', desc: 'Set your first PB at any track', icon: '🏆', earned: pbCount > 0, progress: Math.min(pbCount, 1), target: 1 },
    { id: 'flat_out', name: 'Flat Out', desc: 'Log 10+ sessions', icon: '💨', earned: sessions.length >= 10, progress: Math.min(sessions.length, 10), target: 10 },
    { id: 'setup_wizard', name: 'Setup Wizard', desc: 'Save 10 setups', icon: '🔧', earned: setupCount >= 10, progress: Math.min(setupCount, 10), target: 10 },
    { id: 'circuit_master', name: 'Circuit Master', desc: 'Log sessions at all 24 tracks', icon: '🌍', earned: tracks.size >= 24, progress: Math.min(tracks.size, 24), target: 24 },
    { id: 'consistent', name: 'Consistent', desc: 'Best/worst lap gap under 0.5s in a session', icon: '🎯', earned: consistentSession, progress: consistentSession ? 1 : 0, target: 1 },
    { id: 'the_senna', name: 'The Senna', desc: 'Set a PB at Monaco', icon: '👑', earned: hasMonacoPB, progress: hasMonacoPB ? 1 : 0, target: 1 },
    { id: 'century', name: 'Century', desc: 'Log 100 sessions', icon: '💯', earned: sessions.length >= 100, progress: Math.min(sessions.length, 100), target: 100 },
    { id: 'globe_trotter', name: 'Globe Trotter', desc: 'Practice at 12 different tracks', icon: '✈️', earned: tracks.size >= 12, progress: Math.min(tracks.size, 12), target: 12 },
    { id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Log 5 sessions in a single day', icon: '⚡', earned: maxSessionsPerDay >= 5, progress: Math.min(maxSessionsPerDay, 5), target: 5 },
    { id: 'first_share', name: 'Community Spirit', desc: 'Share a session publicly', icon: '📡', earned: sessions.some(s => s.isPublic), progress: sessions.some(s => s.isPublic) ? 1 : 0, target: 1 },
  ];
}

// ─── Lap Time Delta ──────────────────────────────────────────────────────────

export function lapTimeDelta(time1: string, time2: string): { diffMs: number; diffPercent: number; faster: 1 | 2 } | null {
  const s1 = lapToSeconds(time1);
  const s2 = lapToSeconds(time2);
  if (!isFinite(s1) || !isFinite(s2) || s1 <= 0 || s2 <= 0) return null;
  const diffMs = Math.round(Math.abs(s1 - s2) * 1000);
  const slower = Math.max(s1, s2);
  const diffPercent = (Math.abs(s1 - s2) / slower) * 100;
  return { diffMs, diffPercent, faster: s1 <= s2 ? 1 : 2 };
}

// ─── Tyre Compound Guide ─────────────────────────────────────────────────────

export interface TyreGuide {
  compounds: string;
  strategy: string;
  notes: string;
}

export const TYRE_GUIDES: Record<string, TyreGuide> = {
  bahrain: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H) or 2 stop (S→M→S)', notes: 'High rear degradation. Medium compound often the race stint tyre.' },
  jeddah: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Low deg street circuit. Soft viable for longer stints than expected.' },
  albert_park: { compounds: 'C2, C3, C4', strategy: '2 stop (S→M→S) or 1 stop (M→H)', notes: 'Bumpy surface eats tyres unevenly. Safety car likely affects strategy.' },
  suzuka: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H) or 2 stop (S→M→S)', notes: 'High-speed corners stress fronts. Consistency matters more than outright pace.' },
  shanghai: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Long back straight rewards low drag. Tyre warm-up can be tricky.' },
  miami: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H) or 2 stop (S→M→M)', notes: 'Hot surface increases deg. Soft can grain quickly.' },
  imola: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Narrow track makes overtaking hard — track position is king.' },
  monaco: { compounds: 'C3, C4, C5', strategy: '1 stop (S→H) or 0 stop', notes: 'Overtaking nearly impossible. Pit stop loses ~25s. Softest compounds.' },
  barcelona: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H) or 2 stop', notes: 'High degradation, especially left front through final sector.' },
  montreal: { compounds: 'C3, C4, C5', strategy: '2 stop (S→M→S) or 1 stop (S→H)', notes: 'Stop-start layout. Heavy braking wears fronts. Safety cars common.' },
  red_bull_ring: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Short lap, low degradation. Uphill braking stresses rears.' },
  silverstone: { compounds: 'C1, C2, C3', strategy: '2 stop (S→M→M) or 1 stop (M→H)', notes: 'High-speed corners eat front left. Copse and Maggots-Becketts key.' },
  hungaroring: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Twisty track, no straights. Tyre temps stay high. Overtaking very difficult.' },
  spa: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H) or 2 stop', notes: 'Longest lap. Rain always a factor. Blanchimont and Eau Rouge punish worn tyres.' },
  zandvoort: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H)', notes: 'Banked corners add unique loading. Short DRS zone limits overtaking.' },
  monza: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Lowest downforce circuit. Chicane kerbs punish tyres. Speed is everything.' },
  baku: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Safety car almost guaranteed. Strategy flexibility critical.' },
  marina_bay: { compounds: 'C3, C4, C5', strategy: '2 stop (S→M→S) or 1 stop (M→H)', notes: 'Night race. 23 corners, physical. Safety cars common.' },
  cota: { compounds: 'C2, C3, C4', strategy: '2 stop (S→M→M) or 1 stop (M→H)', notes: 'Elevation changes, bumpy. Turn 1 is key for strategy — long run to T1.' },
  rodriguez: { compounds: 'C3, C4, C5', strategy: '1 stop (M→H) or 2 stop', notes: 'High altitude reduces downforce and cooling. Softest compounds used.' },
  interlagos: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H) or 2 stop', notes: 'Anti-clockwise loads right front. Sprint weekend intensity.' },
  las_vegas: { compounds: 'C2, C3, C4', strategy: '1 stop (M→H)', notes: 'Night race. Cold temperatures make warm-up critical. Long straights.' },
  losail: { compounds: 'C1, C2, C3', strategy: '1 stop (M→H) or 2 stop', notes: 'Fast and flowing. Medium-speed corners stress all four tyres evenly.' },
  yas_marina: { compounds: 'C3, C4, C5', strategy: '1 stop (S→H) or 2 stop', notes: 'Season finale. Day-to-night transition changes grip levels.' },
};
