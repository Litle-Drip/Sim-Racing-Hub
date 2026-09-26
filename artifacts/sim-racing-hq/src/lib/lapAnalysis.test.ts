// Run with: node --test artifacts/sim-racing-hq/src/lib/lapAnalysis.test.ts
// (Node 22.18+ strips the TypeScript types itself; nothing to install.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCorners, compareLaps, cleanTrace, type TraceSample } from './lapAnalysis.ts';

interface CornerSpec {
  apexD: number;
  minKph: number;
  /** Braking deceleration, m/s². */
  decel?: number;
  /** Traction-limited acceleration out of the corner, m/s². */
  accel?: number;
  /** Throttle lifts (to 40%) at these metres past the apex. */
  throttleDipsAt?: number[];
  /** Brake released to 20% and reapplied this many metres after onset. */
  brakeReleaseAt?: number;
}

/**
 * A lap built from the textbook speed envelope: at every point the car is
 * as fast as the nearest corner's braking and traction limits allow, capped
 * at top speed. Brake is 100% on the braking branches, throttle 100%
 * everywhere else, so the expected analysis is known exactly.
 */
function syntheticLap(corners: CornerSpec[], lengthM = 3000, stepM = 4, vmaxKph = 300): TraceSample[] {
  const vmax = vmaxKph / 3.6;
  const out: TraceSample[] = [];
  for (let d = 0; d <= lengthM; d += stepM) {
    let v = vmax;
    let braking = false;
    let governing: CornerSpec | null = null;
    for (const c of corners) {
      const vmin = c.minKph / 3.6;
      const vc = d < c.apexD
        ? Math.sqrt(vmin * vmin + 2 * (c.decel ?? 40) * (c.apexD - d))
        : Math.sqrt(vmin * vmin + 2 * (c.accel ?? 10) * (d - c.apexD));
      if (vc < v) {
        v = vc;
        braking = d < c.apexD;
        governing = c;
      }
    }
    let brake = braking ? 100 : 0;
    let throttle = braking ? 0 : 100;
    if (braking && governing?.brakeReleaseAt != null) {
      // Onset is where this corner's braking parabola meets top speed.
      const vmin = governing.minKph / 3.6;
      const onset = governing.apexD - (vmax * vmax - vmin * vmin) / (2 * (governing.decel ?? 40));
      const since = d - onset;
      if (since >= governing.brakeReleaseAt && since < governing.brakeReleaseAt + 12) brake = 20;
    }
    if (!braking && governing) {
      for (const dip of governing.throttleDipsAt ?? []) {
        if (d - governing.apexD >= dip && d - governing.apexD < dip + 8) throttle = 40;
      }
    }
    out.push({ d, speed: v * 3.6, throttle, brake, steer: 0, gear: 5 });
  }
  return out;
}

const BASE: CornerSpec[] = [
  { apexD: 600, minKph: 90 },
  { apexD: 1500, minKph: 150 },
  { apexD: 2400, minKph: 70 },
];

test('finds one corner per speed dip, in lap order', () => {
  const corners = detectCorners(syntheticLap(BASE));
  assert.equal(corners.length, 3);
  corners.forEach((c, i) => {
    assert.equal(c.index, i + 1);
    assert.ok(Math.abs(c.apexD - BASE[i].apexD) <= 4, `apex ${i + 1} at ${c.apexD}`);
    assert.ok(Math.abs(c.minSpeedKph - BASE[i].minKph) < 2);
  });
});

test('brake onset is where the braking curve meets top speed', () => {
  const [c1] = detectCorners(syntheticLap(BASE));
  const vmax = 300 / 3.6;
  const vmin = 90 / 3.6;
  const expected = 600 - (vmax * vmax - vmin * vmin) / (2 * 40);
  assert.ok(c1.brakeOnsetD != null && Math.abs(c1.brakeOnsetD - expected) <= 4, `onset ${c1.brakeOnsetD}, expected ≈${expected}`);
  assert.equal(c1.peakBrakePct, 100);
  assert.equal(c1.brakeReapplies, 0);
  assert.equal(c1.throttleCorrections, 0);
});

test('a speed wobble smaller than the corner threshold is not a corner', () => {
  const trace = syntheticLap(BASE).map(p =>
    p.d > 1000 && p.d < 1040 ? { ...p, speed: p.speed - 8 } : p);
  assert.equal(detectCorners(trace).length, 3);
});

test('counts throttle corrections on exit and brake reapplies on entry', () => {
  const spec: CornerSpec[] = [
    { ...BASE[0], throttleDipsAt: [40, 90] },
    { ...BASE[1], brakeReleaseAt: 40 },
    BASE[2],
  ];
  const [c1, c2] = detectCorners(syntheticLap(spec));
  assert.equal(c1.throttleCorrections, 2);
  assert.equal(c2.brakeReapplies, 1);
});

test('comparing a lap with itself shows no loss anywhere', () => {
  const lap = syntheticLap(BASE);
  const cmp = compareLaps(lap, lap)!;
  assert.equal(cmp.corners.length, 3);
  assert.ok(Math.abs(cmp.totalDeltaS) < 1e-9);
  assert.equal(cmp.opportunities.length, 0);
  for (const c of cmp.corners) {
    assert.equal(c.brakeOnsetDiffM, 0);
    assert.equal(c.minSpeedDiffKph, 0);
  }
});

test('a slower corner 2 is found, and its loss split into entry and exit', () => {
  const ref = syntheticLap(BASE);
  // Brakes earlier and softer, 20 km/h less min speed, and a weaker exit.
  const lap = syntheticLap([BASE[0], { ...BASE[1], minKph: 130, decel: 30, accel: 8 }, BASE[2]]);
  const cmp = compareLaps(lap, ref)!;
  const c2 = cmp.corners[1];

  assert.ok(c2.brakeOnsetDiffM != null && c2.brakeOnsetDiffM < -20, `brake diff ${c2.brakeOnsetDiffM}`);
  assert.ok(c2.minSpeedDiffKph != null && Math.abs(c2.minSpeedDiffKph + 20) < 2);
  assert.ok(c2.entryLossS > 0.02, `entry loss ${c2.entryLossS}`);
  assert.ok(c2.exitLossS > 0.02, `exit loss ${c2.exitLossS}`);

  // Untouched corners lose nothing, and the opportunities are corner 2's.
  assert.ok(Math.abs(cmp.corners[0].entryLossS) < 1e-6);
  assert.ok(Math.abs(cmp.corners[2].exitLossS) < 1e-6);
  assert.ok(cmp.opportunities.length > 0);
  assert.ok(cmp.opportunities.every(o => o.corner === 2));

  // Corner losses plus the lap-start segment account for the whole delta.
  const summed = cmp.lapStartLossS + cmp.corners.reduce((a, c) => a + c.entryLossS + c.exitLossS, 0);
  assert.ok(Math.abs(summed - cmp.totalDeltaS) < 1e-9);
});

test('a lap that is faster through a corner shows a gain, not an opportunity', () => {
  const ref = syntheticLap(BASE);
  const lap = syntheticLap([BASE[0], BASE[1], { ...BASE[2], minKph: 80 }]);
  const cmp = compareLaps(lap, ref)!;
  assert.ok(cmp.corners[2].entryLossS < 0);
  assert.ok(cmp.totalDeltaS < 0);
  assert.equal(cmp.opportunities.length, 0);
});

test('sample noise does not create extra corners or throttle corrections', () => {
  // Deterministic jitter: ±3 km/h on speed, and a pedal reading 96-100 at full.
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noisy = syntheticLap(BASE).map(p => ({
    ...p,
    speed: p.speed + rand() * 3,
    throttle: p.throttle === 100 ? Math.round(98 + rand() * 2) : p.throttle,
  }));
  const corners = detectCorners(noisy);
  assert.equal(corners.length, 3);
  assert.ok(corners.every(c => c.throttleCorrections === 0));
});

test('lifting for the next corner is not a correction on this one', () => {
  // Never back to full throttle after corner 1, so its exit window runs up
  // to corner 2's braking — which must not count as a lift on corner 1.
  const trace = syntheticLap(BASE).map(p =>
    p.d >= 600 && p.d < 1440 && p.throttle === 100 ? { ...p, throttle: 85 } : p);
  const [c1] = detectCorners(trace);
  assert.equal(c1.fullThrottleD, null);
  assert.equal(c1.throttleCorrections, 0);
});

test('unsorted and duplicated samples are cleaned before analysis', () => {
  const lap = syntheticLap(BASE);
  const messy = [...lap].reverse().concat(lap.slice(0, 20));
  assert.equal(cleanTrace(messy).length, lap.length);
  assert.equal(detectCorners(cleanTrace(messy)).length, 3);
});

test('too-short traces are rejected rather than guessed at', () => {
  assert.deepEqual(detectCorners(syntheticLap(BASE).slice(0, 5)), []);
  assert.equal(compareLaps([], syntheticLap(BASE)), null);
});
