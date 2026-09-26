// Corner-by-corner lap analysis — the "analysis engine" behind driver
// coaching. Pure functions over a lap's distance trace, no React and no
// imports, so it can run in the browser today and move to the API server
// (for stored metrics and the driver profile) without changes.
//
// Everything here is derived from what the companion records: one sample
// every few metres of speed (km/h), throttle/brake (0-100), steer (-100..100)
// and gear, keyed by lap distance. There is no timestamp in a sample, so any
// time figure is integrated from the speed trace and is an estimate. At
// 60Hz UDP the trace is ~20 samples/s — roughly one every 4m at 300 km/h —
// which bounds how precise a brake point can be.
//
// Corners are auto-detected from speed dips, so they are numbered in the
// order they occur on the lap. That usually, but not always, matches the
// circuit's official turn numbers: a flat-out kink produces no dip and gets
// no number, and two official turns taken as one sweep get one.

export interface TraceSample {
  d: number;
  speed: number;
  throttle: number;
  brake: number;
  steer: number;
  gear?: number;
}

export interface CornerMetrics {
  /** 1-based, in lap order. Auto-detected — see the file header. */
  index: number;
  /** Where this corner's segment begins: brake/lift onset, or the speed
   *  peak before the corner when the driver neither braked nor lifted. */
  entryD: number;
  /** Distance of the minimum speed. */
  apexD: number;
  minSpeedKph: number;
  gearAtApex: number | null;
  /** Null for a corner taken without the brake (a lift, or flat). */
  brakeOnsetD: number | null;
  peakBrakePct: number;
  /** Metres from brake onset to 90% of peak brake — how hard the initial
   *  hit is. Limited to the trace's sample spacing. */
  brakeRampM: number | null;
  /** Where the brake is finally released (below BRAKE_ON_PCT). */
  brakeOffD: number | null;
  /** Times the brake was backed off to under half of its peak and then
   *  pressed again inside one braking zone — a lock-up recovery pattern
   *  when driving without ABS. */
  brakeReapplies: number;
  /** First point after the apex with THROTTLE_PICKUP_PCT or more. */
  throttlePickupD: number | null;
  /** First point after the apex where throttle is back at
   *  FULL_THROTTLE_PCT and stays there for FULL_THROTTLE_HOLD_M. Null when
   *  it never gets there before the next corner. */
  fullThrottleD: number | null;
  /** Lifts of THROTTLE_CORRECTION_PTS or more on the way from the apex back
   *  to full throttle — wheelspin catches and hesitations. */
  throttleCorrections: number;
  /** Speed EXIT_SPEED_OFFSET_M after the apex (or at the next corner's
   *  entry, if that comes first). */
  exitSpeedKph: number;
}

export interface CornerComparison {
  /** The reference lap's corner — comparison corners are defined by the
   *  reference so the numbering stays the same whichever lap is selected. */
  ref: CornerMetrics;
  /** The same corner on the analysed lap, when one was found near it. */
  lap: CornerMetrics | null;
  /** Estimated seconds lost (+) or gained (−) from entry to apex. */
  entryLossS: number;
  /** Estimated seconds lost (+) or gained (−) from the apex to the next
   *  corner's entry — a poor exit shows up down the following straight,
   *  so the straight is charged to the corner that caused it. */
  exitLossS: number;
  /** Metres. Positive = the analysed lap braked later. */
  brakeOnsetDiffM: number | null;
  /** km/h. Positive = the analysed lap carried more minimum speed. */
  minSpeedDiffKph: number | null;
  /** Metres. Positive = the analysed lap reached full throttle later. */
  fullThrottleDiffM: number | null;
  /** km/h. Positive = the analysed lap exited faster. */
  exitSpeedDiffKph: number | null;
}

export interface Opportunity {
  corner: number;
  phase: 'entry' | 'exit';
  lossS: number;
}

export interface LapComparison {
  corners: CornerComparison[];
  /** Time before the reference lap's first corner. On a flying lap this
   *  mostly reflects the previous lap's final corner, so it is kept apart
   *  from corner 1. */
  lapStartLossS: number;
  /** Estimated total delta over the distance both traces cover. */
  totalDeltaS: number;
  /** Corner phases that lost at least MIN_OPPORTUNITY_S, worst first. */
  opportunities: Opportunity[];
}

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Starting values, to be checked against real laps. Kept together so tuning
// never means hunting through the algorithm.

/** A speed dip must be at least this deep (km/h) to count as a corner. */
const MIN_CORNER_DROP_KPH = 15;
/** Apexes closer than this are one corner. */
const MIN_APEX_GAP_M = 60;
/** Brake counts as applied at or above this percentage. */
const BRAKE_ON_PCT = 5;
/** Throttle below this before a corner counts as a lift. */
const LIFT_BELOW_PCT = 90;
const THROTTLE_PICKUP_PCT = 20;
/** Not 100: a wheel pedal's travel often tops out a point or two short. */
const FULL_THROTTLE_PCT = 95;
const FULL_THROTTLE_HOLD_M = 100;
/** A throttle drop this large (points) counts as a correction. */
const THROTTLE_CORRECTION_PTS = 15;
/** Brake must rise this many points after backing off to count as a reapply. */
const BRAKE_REAPPLY_PTS = 15;
const EXIT_SPEED_OFFSET_M = 150;
/** Two laps' apexes further apart than this are not the same corner. */
const MATCH_TOLERANCE_M = 75;
const MIN_OPPORTUNITY_S = 0.02;
/** Samples either side averaged when looking for speed dips. */
const SMOOTH_RADIUS = 2;
/** Distance step for the time-delta integration. */
const DELTA_STEP_M = 5;

// ─── Trace helpers ───────────────────────────────────────────────────────────

/** Sorted by distance, one sample per distance, non-finite rows dropped. */
export function cleanTrace<T extends TraceSample>(trace: readonly T[]): T[] {
  const sorted = trace
    .filter(p => Number.isFinite(p.d) && Number.isFinite(p.speed))
    .sort((a, b) => a.d - b.d);
  const out: T[] = [];
  for (const p of sorted) {
    if (out.length > 0 && p.d <= out[out.length - 1].d) continue;
    out.push(p);
  }
  return out;
}

type Channel = 'speed' | 'throttle' | 'brake' | 'steer' | 'gear';

/**
 * Value of one channel at an arbitrary lap distance, linearly interpolated
 * between the two surrounding samples. Traces are recorded every Nth frame,
 * so two laps never share sample points — comparing them means resampling
 * both onto a common distance grid.
 */
export function interpAt(trace: readonly TraceSample[], key: Channel, d: number): number {
  if (trace.length === 0) return 0;
  if (d <= trace[0].d) return trace[0][key] ?? 0;
  const last = trace[trace.length - 1];
  if (d >= last.d) return last[key] ?? 0;
  // Binary search for the sample pair bracketing d.
  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].d <= d) lo = mid; else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  const span = b.d - a.d;
  const av = a[key] ?? 0;
  const bv = b[key] ?? 0;
  if (span <= 0) return av;
  return av + (bv - av) * ((d - a.d) / span);
}

/**
 * Elapsed time at each grid point, integrated from the speed trace as
 * Σ Δdistance / speed. This is an approximation — the trace is sampled
 * coarsely and speed between samples is taken as linear — so the delta it
 * produces is a guide to where time is going, not a timing-loop-accurate
 * figure. Speed is clamped above zero so a standing start or a spin can't
 * divide by zero and blow the whole curve out.
 */
export function cumulativeTime(trace: readonly TraceSample[], grid: readonly number[]): number[] {
  const out = new Array<number>(grid.length);
  out[0] = 0;
  for (let i = 1; i < grid.length; i++) {
    const dd = grid[i] - grid[i - 1];
    const v0 = Math.max(interpAt(trace, 'speed', grid[i - 1]), 5) / 3.6;
    const v1 = Math.max(interpAt(trace, 'speed', grid[i]), 5) / 3.6;
    out[i] = out[i - 1] + dd / ((v0 + v1) / 2);
  }
  return out;
}

/** Centred moving average — takes the sample-to-sample jitter out of the
 *  speed trace so noise doesn't register as a corner. */
function smooth(values: readonly number[], radius: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

// ─── Corner detection ────────────────────────────────────────────────────────

/**
 * Indices of the lap's corners, as speed minima that sit at least
 * MIN_CORNER_DROP_KPH below the lower of the two speed peaks either side of
 * them (the minimum's "prominence"). Prominence rather than a fixed speed
 * threshold is what lets a 280→260 km/h fast corner and a 300→80 km/h
 * hairpin both register, while a wobble inside one slow corner doesn't.
 */
function findApexIndices(trace: readonly TraceSample[]): number[] {
  const s = smooth(trace.map(p => p.speed), SMOOTH_RADIUS);
  const n = s.length;
  const apexes: number[] = [];

  for (let i = 1; i < n - 1; i++) {
    if (!(s[i] < s[i - 1])) continue;
    // Walk across a flat bottom so a plateau yields one candidate.
    let j = i;
    while (j + 1 < n && s[j + 1] === s[i]) j++;
    if (j + 1 >= n || !(s[j + 1] > s[i])) continue;

    let leftMax = s[i];
    for (let k = i - 1; k >= 0 && s[k] >= s[i]; k--) leftMax = Math.max(leftMax, s[k]);
    let rightMax = s[i];
    for (let k = j + 1; k < n && s[k] >= s[i]; k++) rightMax = Math.max(rightMax, s[k]);
    if (Math.min(leftMax, rightMax) - s[i] < MIN_CORNER_DROP_KPH) continue;

    // Smoothing drags the minimum toward the gentler side of an asymmetric
    // dip (hard braking in, softer traction out), so the apex is the slowest
    // raw sample within the smoothing window of the smoothed minimum.
    let at = i;
    for (let k = Math.max(0, i - SMOOTH_RADIUS); k <= Math.min(n - 1, j + SMOOTH_RADIUS); k++) {
      if (trace[k].speed < trace[at].speed) at = k;
    }

    const prev = apexes[apexes.length - 1];
    if (prev !== undefined && trace[at].d - trace[prev].d < MIN_APEX_GAP_M) {
      if (trace[at].speed < trace[prev].speed) apexes[apexes.length - 1] = at;
    } else {
      apexes.push(at);
    }
  }
  return apexes;
}

/** First index in [from, to] matching the predicate, or -1. */
function findIndex(trace: readonly TraceSample[], from: number, to: number, pred: (p: TraceSample) => boolean): number {
  for (let i = Math.max(0, from); i <= Math.min(to, trace.length - 1); i++) {
    if (pred(trace[i])) return i;
  }
  return -1;
}

/** Counts drops of at least `pts` from a running peak — each drop counted
 *  once, re-armed when the value climbs `pts` back above its low point. */
function countDrops(values: readonly number[], pts: number, minPeak: number): number {
  let count = 0;
  let peak = -Infinity;
  let low = Infinity;
  let inDrop = false;
  for (const v of values) {
    if (inDrop) {
      low = Math.min(low, v);
      if (v >= low + pts) {
        inDrop = false;
        peak = v;
      }
    } else {
      peak = Math.max(peak, v);
      if (peak >= minPeak && v <= peak - pts) {
        count++;
        inDrop = true;
        low = v;
      }
    }
  }
  return count;
}

/**
 * The lap's corners with their entry, apex and exit metrics. Expects a trace
 * from cleanTrace; returns [] for anything too short to analyse.
 */
export function detectCorners(trace: readonly TraceSample[]): CornerMetrics[] {
  if (trace.length < 10) return [];
  const apexes = findApexIndices(trace);

  // Entry points first: each corner's segment ends where the next begins.
  const entries = apexes.map((apex, k) => {
    const from = k === 0 ? 0 : apexes[k - 1];
    let peak = from;
    for (let i = from; i <= apex; i++) if (trace[i].speed > trace[peak].speed) peak = i;
    const brakeOnset = findIndex(trace, peak, apex, p => p.brake >= BRAKE_ON_PCT);
    let entry: number;
    if (brakeOnset >= 0) {
      // Include the lift that usually precedes the brake by a sample or two.
      entry = brakeOnset;
      while (entry > peak && trace[entry - 1].throttle < LIFT_BELOW_PCT) entry--;
    } else {
      const lift = findIndex(trace, peak, apex, p => p.throttle < LIFT_BELOW_PCT);
      entry = lift >= 0 ? lift : peak;
    }
    return { entry, brakeOnset };
  });

  return apexes.map((apex, k) => {
    const { entry, brakeOnset } = entries[k];
    const nextEntry = k + 1 < apexes.length ? entries[k + 1].entry : trace.length - 1;
    const apexD = trace[apex].d;

    // Braking zone: onset → final release before the apex region ends.
    let peakBrakePct = 0;
    let brakeRampM: number | null = null;
    let brakeOffD: number | null = null;
    let brakeReapplies = 0;
    if (brakeOnset >= 0) {
      let brakeEnd = brakeOnset;
      for (let i = brakeOnset; i <= Math.min(nextEntry, trace.length - 1); i++) {
        if (trace[i].brake >= BRAKE_ON_PCT) brakeEnd = i;
        else if (i > apex) break;
      }
      const zone = trace.slice(brakeOnset, brakeEnd + 1).map(p => p.brake);
      peakBrakePct = Math.max(...zone);
      const rampIdx = findIndex(trace, brakeOnset, brakeEnd, p => p.brake >= peakBrakePct * 0.9);
      if (rampIdx >= 0) brakeRampM = trace[rampIdx].d - trace[brakeOnset].d;
      brakeOffD = brakeEnd + 1 < trace.length ? trace[brakeEnd + 1].d : trace[brakeEnd].d;
      brakeReapplies = countReapplies(zone, peakBrakePct);
    }

    const pickup = findIndex(trace, apex, nextEntry, p => p.throttle >= THROTTLE_PICKUP_PCT);
    let fullThrottle = -1;
    for (let i = apex; i <= nextEntry && fullThrottle < 0; i++) {
      if (trace[i].throttle < FULL_THROTTLE_PCT) continue;
      let held = true;
      for (let j = i; j <= nextEntry && trace[j].d - trace[i].d < FULL_THROTTLE_HOLD_M; j++) {
        if (trace[j].throttle < FULL_THROTTLE_PCT) { held = false; break; }
      }
      if (held) fullThrottle = i;
    }
    // Without a return to full throttle the window stops short of the next
    // corner's entry, so lifting for that corner isn't counted against this one.
    const exitEnd = fullThrottle >= 0 ? fullThrottle : Math.max(apex, nextEntry - 1);
    const throttleCorrections = countDrops(
      trace.slice(apex, exitEnd + 1).map(p => p.throttle),
      THROTTLE_CORRECTION_PTS,
      THROTTLE_PICKUP_PCT,
    );

    const exitD = Math.min(apexD + EXIT_SPEED_OFFSET_M, trace[nextEntry].d);

    return {
      index: k + 1,
      entryD: trace[entry].d,
      apexD,
      minSpeedKph: trace[apex].speed,
      gearAtApex: trace[apex].gear ?? null,
      brakeOnsetD: brakeOnset >= 0 ? trace[brakeOnset].d : null,
      peakBrakePct,
      brakeRampM,
      brakeOffD,
      brakeReapplies,
      throttlePickupD: pickup >= 0 ? trace[pickup].d : null,
      fullThrottleD: fullThrottle >= 0 ? trace[fullThrottle].d : null,
      throttleCorrections,
      exitSpeedKph: interpAt(trace, 'speed', exitD),
    };
  });
}

/** Brake backed off below half of the zone's peak, then pressed at least
 *  BRAKE_REAPPLY_PTS harder again. */
function countReapplies(zone: readonly number[], peak: number): number {
  const floor = peak * 0.5;
  let count = 0;
  let low = Infinity;
  let armed = false;
  let reachedPeak = false;
  for (const v of zone) {
    if (!reachedPeak) {
      if (v >= peak * 0.9) reachedPeak = true;
      continue;
    }
    if (v < floor) {
      armed = true;
      low = Math.min(low, v);
    } else if (armed && v >= low + BRAKE_REAPPLY_PTS) {
      count++;
      armed = false;
      low = Infinity;
    }
  }
  return count;
}

// ─── Lap vs reference ────────────────────────────────────────────────────────

/**
 * Corner-by-corner comparison of `lapTrace` against `refTrace`. Corners are
 * the reference lap's; each is matched to the analysed lap's corner with
 * the nearest apex. Time loss is split at the reference apex into entry
 * (braking and turn-in) and exit (traction and the straight after).
 */
export function compareLaps(lapTrace: readonly TraceSample[], refTrace: readonly TraceSample[]): LapComparison | null {
  const lap = cleanTrace(lapTrace);
  const ref = cleanTrace(refTrace);
  if (lap.length < 10 || ref.length < 10) return null;

  const minD = Math.max(lap[0].d, ref[0].d);
  const maxD = Math.min(lap[lap.length - 1].d, ref[ref.length - 1].d);
  if (!(maxD > minD)) return null;

  const grid: number[] = [];
  for (let d = minD; d < maxD; d += DELTA_STEP_M) grid.push(d);
  grid.push(maxD);
  const tLap = cumulativeTime(lap, grid);
  const tRef = cumulativeTime(ref, grid);
  const deltaAt = (d: number): number => {
    const c = Math.min(Math.max(d, minD), maxD);
    const i = Math.min(Math.floor((c - minD) / DELTA_STEP_M), grid.length - 2);
    const f = (c - grid[i]) / (grid[i + 1] - grid[i] || 1);
    const di = tLap[i] - tRef[i];
    const dj = tLap[i + 1] - tRef[i + 1];
    return di + (dj - di) * f;
  };

  const refCorners = detectCorners(ref);
  const lapCorners = detectCorners(lap);

  const matches = refCorners.map(rc => {
    let match: CornerMetrics | null = null;
    for (const lc of lapCorners) {
      const gap = Math.abs(lc.apexD - rc.apexD);
      if (gap <= MATCH_TOLERANCE_M && (!match || gap < Math.abs(match.apexD - rc.apexD))) match = lc;
    }
    return match;
  });

  // A corner's segment starts where either lap began braking or lifting for
  // it. Using the reference's entry alone would charge a lap that brakes
  // earlier to the previous corner's exit instead of to the corner it was
  // braking for.
  const segStarts = refCorners.map((rc, k) => {
    const start = Math.min(rc.entryD, matches[k]?.entryD ?? rc.entryD);
    const floor = k > 0 ? refCorners[k - 1].apexD : minD;
    return Math.max(start, floor);
  });

  const diff = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null ? a - b : null;

  const corners: CornerComparison[] = refCorners.map((rc, k) => {
    const match = matches[k];
    const segEnd = k + 1 < refCorners.length ? segStarts[k + 1] : maxD;
    return {
      ref: rc,
      lap: match,
      entryLossS: deltaAt(rc.apexD) - deltaAt(segStarts[k]),
      exitLossS: deltaAt(segEnd) - deltaAt(rc.apexD),
      brakeOnsetDiffM: diff(match?.brakeOnsetD, rc.brakeOnsetD),
      minSpeedDiffKph: diff(match?.minSpeedKph, rc.minSpeedKph),
      fullThrottleDiffM: diff(match?.fullThrottleD, rc.fullThrottleD),
      exitSpeedDiffKph: diff(match?.exitSpeedKph, rc.exitSpeedKph),
    };
  });

  const opportunities: Opportunity[] = corners
    .flatMap(c => [
      { corner: c.ref.index, phase: 'entry' as const, lossS: c.entryLossS },
      { corner: c.ref.index, phase: 'exit' as const, lossS: c.exitLossS },
    ])
    .filter(o => o.lossS >= MIN_OPPORTUNITY_S)
    .sort((a, b) => b.lossS - a.lossS);

  return {
    corners,
    lapStartLossS: segStarts.length > 0 ? deltaAt(segStarts[0]) : 0,
    totalDeltaS: deltaAt(maxD),
    opportunities,
  };
}
