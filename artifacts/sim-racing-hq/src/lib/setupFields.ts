import type { SetupRecord } from '@workspace/api-client-react';

// Setup parameters, grouped the way the game's own setup screen groups them,
// with the slider bounds needed to draw a fill bar next to each value.
//
// `range: null` means "we don't draw a bar for this one". The wing, ARB,
// spring, differential and brake sliders have stable bounds across F1 24/25,
// but ride height bounds move between game versions and between axles, and a
// bar drawn against the wrong bounds is worse than no bar at all — it reads
// as a confident claim about how aggressive a setting is. Those fields render
// the number alone.

export type SetupFieldGroup = 'Aerodynamics' | 'Transmission' | 'Suspension' | 'Brakes';

export interface SetupFieldMeta {
  key: keyof SetupRecord;
  label: string;
  /** Inclusive in-game slider bounds, or null when they're version-dependent. */
  range: [number, number] | null;
  suffix?: string;
}

export const SETUP_FIELD_GROUPS: { group: SetupFieldGroup; fields: SetupFieldMeta[] }[] = [
  {
    group: 'Aerodynamics',
    fields: [
      { key: 'frontWing', label: 'Front Wing', range: [0, 50] },
      { key: 'rearWing', label: 'Rear Wing', range: [0, 50] },
    ],
  },
  {
    group: 'Transmission',
    fields: [
      { key: 'onThrottle', label: 'Differential On Throttle', range: [50, 100], suffix: '%' },
      { key: 'offThrottle', label: 'Differential Off Throttle', range: [50, 100], suffix: '%' },
    ],
  },
  {
    group: 'Suspension',
    fields: [
      { key: 'frontSprings', label: 'Front Suspension', range: [1, 41] },
      { key: 'rearSprings', label: 'Rear Suspension', range: [1, 41] },
      { key: 'frontARB', label: 'Front Anti-Roll Bar', range: [1, 11] },
      { key: 'rearARB', label: 'Rear Anti-Roll Bar', range: [1, 11] },
      { key: 'frontRideHeight', label: 'Front Ride Height', range: null },
      { key: 'rearRideHeight', label: 'Rear Ride Height', range: null },
    ],
  },
  {
    group: 'Brakes',
    fields: [
      { key: 'brakePressure', label: 'Brake Pressure', range: [80, 100], suffix: '%' },
      { key: 'brakeBias', label: 'Front Brake Bias', range: [50, 70], suffix: '%' },
    ],
  },
];

/** Every setup field in group order — the display order for spec sheets. */
export const SETUP_FIELDS: SetupFieldMeta[] = SETUP_FIELD_GROUPS.flatMap(g => g.fields);

/**
 * How far along its slider a value sits, 0–1, or null when the value is
 * blank/non-numeric or the field has no fixed range. Values outside the
 * declared bounds clamp rather than overflowing the bar — setups imported
 * from other game versions can legitimately sit outside F1 25's range.
 */
export function setupFieldFill(meta: SetupFieldMeta, raw: unknown): number | null {
  if (!meta.range) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!isFinite(n)) return null;
  const [min, max] = meta.range;
  if (max === min) return null;
  return Math.min(1, Math.max(0, (n - min) / (max - min)));
}

/** Display string for a setup value — the number plus its unit, or an em dash. */
export function setupFieldValue(meta: SetupFieldMeta, raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (s === '') return '—';
  return meta.suffix ? `${s}${meta.suffix}` : s;
}
