import type { SetupRecord } from '@workspace/api-client-react';

// Setup parameters, grouped the way the game's own setup screen groups them,
// with the slider bounds needed to draw a fill bar next to each value.
//
// `range: null` means "we don't draw a bar for this one" — a bar drawn
// against the wrong bounds is worse than no bar, since it reads as a
// confident claim about how aggressive a setting is. Everything here has
// bounds we're confident of for F1 25; the escape hatch stays for fields
// added later whose bounds we don't pin down.
//
// Values outside their declared bounds clamp rather than overflow (see
// setupFieldFill), which matters for setups carried over from another game
// version whose sliders ran to different limits.

export type SetupFieldGroup =
  | 'Aerodynamics'
  | 'Transmission'
  | 'Suspension Geometry'
  | 'Suspension'
  | 'Brakes'
  | 'Tyres';

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
    // Camber is negative and runs from least to most negative, so the bar
    // fills as the wheel leans further in — the direction a driver thinks of
    // as "more camber". setupFieldFill handles the inverted bounds.
    group: 'Suspension Geometry',
    fields: [
      { key: 'frontCamber', label: 'Front Camber', range: [-2.5, -3.5], suffix: '°' },
      { key: 'rearCamber', label: 'Rear Camber', range: [-1.0, -2.0], suffix: '°' },
      { key: 'frontToe', label: 'Front Toe', range: [0, 0.2], suffix: '°' },
      { key: 'rearToe', label: 'Rear Toe', range: [0.1, 0.5], suffix: '°' },
    ],
  },
  {
    group: 'Suspension',
    fields: [
      { key: 'frontSprings', label: 'Front Suspension', range: [1, 41] },
      { key: 'rearSprings', label: 'Rear Suspension', range: [1, 41] },
      { key: 'frontARB', label: 'Front Anti-Roll Bar', range: [1, 11] },
      { key: 'rearARB', label: 'Rear Anti-Roll Bar', range: [1, 11] },
      { key: 'frontRideHeight', label: 'Front Ride Height', range: [1, 10] },
      { key: 'rearRideHeight', label: 'Rear Ride Height', range: [1, 10] },
    ],
  },
  {
    group: 'Brakes',
    fields: [
      { key: 'brakePressure', label: 'Brake Pressure', range: [80, 100], suffix: '%' },
      { key: 'brakeBias', label: 'Front Brake Bias', range: [50, 70], suffix: '%' },
    ],
  },
  {
    group: 'Tyres',
    fields: [
      { key: 'frontTyrePressure', label: 'Front Tyre Pressure', range: [22.0, 29.5], suffix: ' psi' },
      { key: 'rearTyrePressure', label: 'Rear Tyre Pressure', range: [19.5, 26.5], suffix: ' psi' },
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
 *
 * Bounds may be declared high-to-low (camber), which this handles without a
 * special case: the ratio comes out the same, so the bar fills toward
 * whichever end the field's second bound names.
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
