import type { SessionRecord } from './storage';
import { lapToSeconds, isFasterLap } from './storage';

// The guest-mode mirror of the server's PB rules
// (artifacts/api-server/src/lib/personalBests.ts). The two have to agree: a
// driver who tries the app signed out and then signs in must not watch their
// PB badges move around because a different rule ran.
//
//   isPB  — holds the current personal best for its circuit. One session per
//           circuit. This is what a ★ PB badge means.
//   wasPB — was a personal best at the time it was logged, and keeps saying
//           so. This is what "personal bests set" counters mean.
//
// Grouped per circuit, not per circuit-and-car: "my best lap at Monza" is one
// number, and the car that set it travels with the session.
//
// Grouping uses trackId as-is, without the server's alias normalisation: every
// session reaching this code already carries a canonical id — the API resolves
// aliases in serializeSession, and guest sessions are logged through the app's
// own track picker, which only offers canonical ids.

export function computePBFlags(sessions: SessionRecord[]): SessionRecord[] {
  const chronological = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  const runningBest: Record<string, string> = {};
  const holder: Record<string, string> = {};
  const wasPBIds = new Set<string>();

  for (const s of chronological) {
    if (!s.bestLap || s.bestLap.trim() === '') continue;
    if (isFasterLap(s.bestLap, runningBest[s.trackId] ?? '')) {
      runningBest[s.trackId] = s.bestLap;
      holder[s.trackId] = s.id;
      wasPBIds.add(s.id);
    }
  }

  const currentPBIds = new Set(Object.values(holder));
  return sessions.map(s => ({ ...s, isPB: currentPBIds.has(s.id), wasPB: wasPBIds.has(s.id) }));
}

// The driver's current best at each circuit, with the session that set it.
// Used by the all-time PB table, which was previously rebuilding this inline
// and disagreeing with the badges on the same screen about ties.
export interface TrackPB {
  trackId: string;
  car: string;
  bestLap: string;
  date: string;
  sessionId: string;
  sessions: number;
}

export function personalBestsByTrack(sessions: SessionRecord[]): TrackPB[] {
  const chronological = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const best: Record<string, TrackPB> = {};
  const counts: Record<string, number> = {};

  for (const s of chronological) {
    if (!s.bestLap || s.bestLap.trim() === '') continue;
    counts[s.trackId] = (counts[s.trackId] || 0) + 1;
    const current = best[s.trackId];
    if (!current || lapToSeconds(s.bestLap) < lapToSeconds(current.bestLap)) {
      best[s.trackId] = {
        trackId: s.trackId,
        car: s.car,
        bestLap: s.bestLap,
        date: s.date,
        sessionId: s.id,
        sessions: counts[s.trackId],
      };
    }
  }

  for (const trackId of Object.keys(best)) {
    best[trackId].sessions = counts[trackId];
  }

  return Object.values(best).sort((a, b) => a.trackId.localeCompare(b.trackId));
}
