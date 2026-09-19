import { eq, and, inArray } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { normalizeTrackId } from "./trackAlias";

// Personal bests, in one place.
//
// This used to be copy-pasted into routes/sessions.ts and routes/companion.ts,
// and the two copies had already drifted apart in how they read a missing
// entry. They have to agree: a driver who logs a session by hand and then
// uploads one from the companion must not see the badge move depending on
// which route ran last.
//
// Two flags, because "personal best" means two different things depending on
// who's asking:
//
//   isPB  — this session holds the *current* PB for its circuit. Exactly one
//           session per circuit carries it, and it moves when a faster lap
//           lands. This is what a ★ PB badge and a "your best here" figure
//           mean.
//   wasPB — this session beat everything logged before it at that circuit,
//           at the time it was logged, and keeps saying so forever. This is
//           what "personal bests set" counters and progression charts mean.
//
// Until 2026-09 there was one flag carrying the second meaning and being
// rendered with the first, which is why a driver could open the Monza page
// and find two sessions both badged ★ PB — one in a Mercedes, one in a
// generic car. Both had been records when they were set; only one still was.
//
// Grouping is per circuit, not per circuit-and-car: "my best lap at Monza" is
// one number. The car that set it travels with the session, so the PB row can
// still say what was driving.

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

export function secondsToLap(s: number): string {
  // Round to whole milliseconds first so floor/toFixed can't disagree at a
  // minute boundary (e.g. 119.99958 -> floor(1.999..)=1 but toFixed(3)
  // rounds the remainder up to "60.000", producing "1:60.000").
  const totalMs = Math.round(s * 1000);
  const m = Math.floor(totalMs / 60000);
  const remSec = (totalMs - m * 60000) / 1000;
  return `${m}:${remSec.toFixed(3).padStart(6, "0")}`;
}

export function isFasterLap(a: string, b: string): boolean {
  if (!a || a.trim() === "") return false;
  if (!b || b.trim() === "") return true;
  return lapToSeconds(a) < lapToSeconds(b);
}

function hasLap(lap: string | null | undefined): lap is string {
  return typeof lap === "string" && lap.trim() !== "";
}

export interface PBCandidate {
  id: string;
  date: string;
  createdAt: Date;
  trackId: string;
  bestLap: string;
}

export interface PBAssignment {
  /** Ids currently holding their circuit's best — at most one per circuit. */
  currentPBIds: Set<string>;
  /** Ids that beat everything before them at the time they were logged. */
  wasPBIds: Set<string>;
}

// The rule itself, with no database attached, so it can be reasoned about and
// exercised directly.
export function assignPBs(rows: PBCandidate[]): PBAssignment {
  // Sort chronologically so, among sessions logged on the same calendar date,
  // the one uploaded/created first consistently wins tie-breaking (date alone
  // doesn't distinguish same-day sessions, and without a stable secondary key
  // the winner would depend on incidental DB row order).
  const sorted = [...rows].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const runningBest: Record<string, string> = {};
  // The session id currently holding each circuit's best. First one there
  // keeps it on an exact tie, which is the same earliest-wins rule the sort
  // above establishes — a later identical lap doesn't take the badge off the
  // session that got there first.
  const holder: Record<string, string> = {};
  const wasPBIds = new Set<string>();

  for (const s of sorted) {
    if (!hasLap(s.bestLap)) continue;
    const key = normalizeTrackId(s.trackId);
    if (isFasterLap(s.bestLap, runningBest[key] ?? "")) {
      runningBest[key] = s.bestLap;
      holder[key] = s.id;
      wasPBIds.add(s.id);
    }
  }

  return { currentPBIds: new Set(Object.values(holder)), wasPBIds };
}

export async function recalcPBsForUser(userId: string): Promise<void> {
  // Only the columns the comparison below reads. This runs on every session
  // create, delete and companion upload, so pulling whole rows would
  // re-transfer the driver's entire history of per-lap telemetry traces
  // (the `laps` jsonb column) every time somebody finishes a stint.
  const rows = await db
    .select({
      id: sessionsTable.id,
      date: sessionsTable.date,
      createdAt: sessionsTable.createdAt,
      trackId: sessionsTable.trackId,
      bestLap: sessionsTable.bestLap,
      isPB: sessionsTable.isPB,
      wasPB: sessionsTable.wasPB,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));

  const { currentPBIds, wasPBIds } = assignPBs(rows);

  // Only rows whose flags actually change need writing — for a single new
  // upload that's normally the old PB (now demoted) and the new one, not
  // every session the driver has ever logged. Batching the changes into
  // IN-list updates keeps a recalc at a fixed number of round-trips instead
  // of one per session.
  const setIsPB: string[] = [];
  const clearIsPB: string[] = [];
  const setWasPB: string[] = [];
  const clearWasPB: string[] = [];

  for (const s of rows) {
    const isPB = currentPBIds.has(s.id);
    const wasPB = wasPBIds.has(s.id);
    if (isPB !== s.isPB) (isPB ? setIsPB : clearIsPB).push(s.id);
    if (wasPB !== s.wasPB) (wasPB ? setWasPB : clearWasPB).push(s.id);
  }

  const writes: Array<[string[], Partial<{ isPB: boolean; wasPB: boolean }>]> = [
    [setIsPB, { isPB: true }],
    [clearIsPB, { isPB: false }],
    [setWasPB, { wasPB: true }],
    [clearWasPB, { wasPB: false }],
  ];

  for (const [ids, values] of writes) {
    if (ids.length === 0) continue;
    await db
      .update(sessionsTable)
      .set(values)
      .where(and(eq(sessionsTable.userId, userId), inArray(sessionsTable.id, ids)));
  }
}
