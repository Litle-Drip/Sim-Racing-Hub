import type { DbSession } from "@workspace/db";

export function lapToSeconds(lap: string): number {
  if (!lap || !lap.includes(":")) {
    const n = parseFloat(lap);
    return isNaN(n) ? Infinity : n;
  }
  const parts = lap.split(":");
  const mins = parseFloat(parts[0]);
  const secs = parseFloat(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return Infinity;
  return mins * 60 + secs;
}

// Metric used to decide a winner: for a 1-lap challenge it's the best lap,
// for an N-lap challenge it's the total time across the first N logged
// laps. If the session doesn't have enough individual laps recorded (e.g.
// summary-only entries), fall back to avgLap * lapCount as an estimate.
export function raceMetricSeconds(
  session: Pick<DbSession, "bestLap" | "avgLap" | "laps">,
  lapCount: number,
): number | null {
  if (lapCount <= 1) {
    return session.bestLap ? lapToSeconds(session.bestLap) : null;
  }
  const laps = (session.laps ?? []).filter((l) => l.time && l.time.trim() !== "");
  if (laps.length >= lapCount) {
    return laps.slice(0, lapCount).reduce((sum, l) => sum + lapToSeconds(l.time), 0);
  }
  if (session.avgLap) {
    return lapToSeconds(session.avgLap) * lapCount;
  }
  return null;
}

// Lower time wins; a tie or a missing metric on either side means no winner.
// Shared by the challenge list and the public profile's win/loss record so
// the two can never disagree about who won a given challenge.
export function decideWinner(
  creatorMetric: number | null,
  opponentMetric: number | null,
  creatorId: string,
  opponentId: string,
): string | null {
  if (creatorMetric === null || opponentMetric === null) return null;
  if (creatorMetric === opponentMetric) return null;
  return opponentMetric < creatorMetric ? opponentId : creatorId;
}
