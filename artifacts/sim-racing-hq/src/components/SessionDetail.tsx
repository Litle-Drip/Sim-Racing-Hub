import React, { useState, useMemo } from 'react';
import { Activity, ChevronDown, Fuel, Disc, Settings2, Thermometer, Gauge, BatteryCharging, AlertTriangle, GitCompare } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useGetSessionDetail, type SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, getTypeBadgeClass } from '../data/f1Tracks';
import { useUnits } from '../lib/units';

// ─── Shared helpers ────────────────────────────────────────────────────────

export function secsFromLap(t: string): number {
  if (!t || t.trim() === '') return Infinity;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const v = parseFloat(m) * 60 + parseFloat(s);
    return isNaN(v) ? Infinity : v;
  }
  const n = parseFloat(t);
  return isNaN(n) ? Infinity : n;
}

export type LapEntry = NonNullable<SessionRecord['laps']>[number];

export function validLaps(laps: SessionRecord['laps']) {
  return laps?.filter(l => l.time && l.time.trim() !== '') ?? [];
}

const SAFETY_CAR_LABELS: Record<number, string> = {
  1: 'Full Safety Car',
  2: 'Virtual Safety Car',
  3: 'Formation Lap',
};
function safetyCarLabel(status: number): string {
  return SAFETY_CAR_LABELS[status] ?? 'No Safety Car';
}

const ERS_MODE_LABELS: Record<number, string> = {
  1: 'Medium',
  2: 'Overtake',
  3: 'Hotlap',
};
function ersModeLabel(mode: number): string {
  return ERS_MODE_LABELS[mode] ?? 'None';
}

const FIA_FLAG_LABELS: Record<number, string> = {
  1: 'Green',
  2: 'Blue',
  3: 'Yellow',
  4: 'Red',
};
const FIA_FLAG_COLORS: Record<number, string> = {
  1: 'var(--green)',
  2: 'var(--teal)',
  3: 'var(--yellow)',
  4: 'var(--red)',
};
function fiaFlagLabel(flag: number): string {
  return FIA_FLAG_LABELS[flag] ?? 'None';
}
function fiaFlagColor(flag: number): string {
  return FIA_FLAG_COLORS[flag] ?? 'var(--gray-light)';
}

function localTimeStr(createdAt: string): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ExpandedGroup({ label, show, icon: Icon, defaultOpen, children }: { label: string; show: boolean; icon: React.ComponentType<{ size?: number }>; defaultOpen?: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <details className="expanded-group" open={defaultOpen} style={{ gridColumn: '1 / -1' }}>
      <summary className="expanded-group-summary">
        <Icon size={13} />
        <span>{label}</span>
        <ChevronDown size={14} className="expanded-group-chevron" />
      </summary>
      <div className="expanded-group-grid">{children}</div>
    </details>
  );
}

// ─── Lap table (expanded view) ────────────────────────────────────────────────

export function LapTable({ sessionId, laps: rawLaps, onViewTelemetry }: { sessionId: string; laps: SessionRecord['laps']; onViewTelemetry: (sessionId: string, lap: LapEntry) => void }) {
  const laps = validLaps(rawLaps);
  if (!laps || laps.length === 0) return null;
  const fastestIdx = laps.reduce((best, l, i) => {
    return secsFromLap(l.time) < secsFromLap(laps[best].time) ? i : best;
  }, 0);

  return (
    <div style={{ width: '100%', overflowX: 'auto', marginTop: 'var(--space-4)' }}>
      <div className="panel-title" style={{ marginBottom: 'var(--space-3)' }}>Lap Data</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Lap', 'Time', 'S1', 'S2', 'S3', 'Tires', 'Penalty', ''].map(h => (
              <th key={h} style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {laps.map((l, i) => {
            const isFastest = i === fastestIdx && laps.length > 1;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: isFastest ? 'rgba(0,210,190,0.07)' : undefined }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--gray-mid)' }}>{l.lap}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: isFastest ? 'var(--teal)' : 'var(--white)', fontWeight: isFastest ? 700 : 400 }}>{l.time || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--gray-light)' }}>{l.s1 || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--gray-light)' }}>{l.s2 || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--gray-light)' }}>{l.s3 || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--gray-mid)' }}>{l.tires || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: l.penalty ? 'var(--red)' : 'var(--gray-mid)' }}>{l.penalty || '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                  {/* Trace presence is unknown until LapTelemetryModal fetches full detail — list responses omit traces. */}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onViewTelemetry(sessionId, l)}
                    title="View speed/throttle/brake telemetry for this lap"
                  >
                    <Activity size={11} /> Telemetry
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Lap telemetry modal (speed/throttle/brake/gear/steer vs. distance) ───────

type Trace = NonNullable<LapEntry['trace']>;
type TraceKey = 'speed' | 'throttle' | 'brake' | 'steer' | 'gear';

/** A row of the merged chart series: the lap's values plus, when a comparison
 *  lap is selected, that lap's values resampled onto the same distance. */
type ChartRow = { d: number } & Partial<Record<TraceKey, number>> & Partial<Record<`cmp_${TraceKey}`, number>> & { delta?: number };

/**
 * Value of one channel at an arbitrary lap distance, linearly interpolated
 * between the two surrounding samples. Traces are recorded every Nth frame,
 * so two laps never share sample points — comparing them means resampling
 * both onto a common distance grid.
 */
function interpAt(trace: Trace, key: TraceKey, d: number): number {
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
function cumulativeTime(trace: Trace, grid: number[]): number[] {
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

const GRID_STEPS = 400;

/**
 * Chart rows for one lap, optionally overlaid with a comparison lap. Without
 * a comparison the raw samples are used as-is; with one, both laps are
 * resampled onto an even grid spanning the distance they have in common.
 */
function buildChartRows(trace: Trace, compare: Trace | null, convertSpeed: (v: number) => number): ChartRow[] {
  if (!compare || compare.length < 2 || trace.length < 2) {
    return trace.map(p => ({
      d: p.d,
      speed: convertSpeed(p.speed),
      throttle: p.throttle,
      brake: p.brake,
      steer: p.steer,
      gear: p.gear,
    }));
  }

  const maxD = Math.min(trace[trace.length - 1].d, compare[compare.length - 1].d);
  const minD = Math.max(trace[0].d, compare[0].d);
  if (!(maxD > minD)) return [];

  const grid: number[] = [];
  for (let i = 0; i <= GRID_STEPS; i++) {
    grid.push(minD + ((maxD - minD) * i) / GRID_STEPS);
  }

  const tLap = cumulativeTime(trace, grid);
  const tCmp = cumulativeTime(compare, grid);

  return grid.map((d, i) => ({
    d: Math.round(d),
    speed: convertSpeed(interpAt(trace, 'speed', d)),
    throttle: interpAt(trace, 'throttle', d),
    brake: interpAt(trace, 'brake', d),
    steer: interpAt(trace, 'steer', d),
    gear: Math.round(interpAt(trace, 'gear', d)),
    cmp_speed: convertSpeed(interpAt(compare, 'speed', d)),
    cmp_throttle: interpAt(compare, 'throttle', d),
    cmp_brake: interpAt(compare, 'brake', d),
    cmp_steer: interpAt(compare, 'steer', d),
    cmp_gear: Math.round(interpAt(compare, 'gear', d)),
    delta: tLap[i] - tCmp[i],
  }));
}

/** Shared crosshair id — every chart in the modal syncs its hover to this. */
const TELEMETRY_SYNC_ID = 'lap-telemetry';

/** Recharts hands its tooltip content whatever it has for the hovered point;
 *  only these three fields are ever read here. */
type TooltipPoint = { value?: unknown; dataKey?: string | number; color?: string };

function ChartTooltip({
  active,
  payload,
  label: d,
  unit,
  digits = 0,
  compareLabel,
}: {
  active?: boolean;
  payload?: TooltipPoint[];
  label?: unknown;
  unit: string;
  digits?: number;
  compareLabel?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isFinite(n) ? n.toFixed(digits) : '—';
  };
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>{String(d ?? '')}m</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: p.color ?? 'var(--white)' }}>
          {String(p.dataKey).startsWith('cmp_') && compareLabel ? `${compareLabel}: ` : ''}
          {fmt(p.value)}{unit}
        </div>
      ))}
    </div>
  );
}

function TelemetryTraceChart({
  dataKey,
  label,
  color,
  unit,
  domain,
  data,
  step,
  digits,
  compareLabel,
  height = 140,
}: {
  dataKey: TraceKey;
  label: string;
  color: string;
  unit: string;
  domain?: [number | string, number | string];
  data: ChartRow[];
  step?: boolean;
  digits?: number;
  compareLabel?: string;
  height?: number;
}) {
  const hasCompare = data.length > 0 && data[0][`cmp_${dataKey}`] !== undefined;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>
          {label}
        </div>
        {hasCompare && compareLabel && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, background: 'var(--amber)', display: 'inline-block' }} />
            {compareLabel}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} syncId={TELEMETRY_SYNC_ID}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="d"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            tickFormatter={v => `${Math.round(v)}m`}
            tickCount={6}
          />
          <YAxis
            domain={domain ?? ['auto', 'auto']}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            width={36}
            allowDecimals={!step}
          />
          <Tooltip content={props => <ChartTooltip {...props} unit={unit} digits={digits} compareLabel={compareLabel} />} />
          {hasCompare && (
            <Line
              type={step ? 'stepAfter' : 'monotone'}
              dataKey={`cmp_${dataKey}`}
              stroke="var(--amber)"
              strokeWidth={1.2}
              strokeDasharray="3 2"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            type={step ? 'stepAfter' : 'monotone'}
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Delta chart — time gained/lost against the comparison lap, by distance. */
function DeltaChart({ data, compareLabel }: { data: ChartRow[]; compareLabel: string }) {
  const finalDelta = data.length > 0 ? data[data.length - 1].delta ?? 0 : 0;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>
          Delta vs {compareLabel}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: finalDelta <= 0 ? 'var(--teal)' : 'var(--red)' }}>
          {finalDelta > 0 ? '+' : ''}{finalDelta.toFixed(3)}s
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)' }}>
          below the line = gaining · approximate, integrated from the speed trace
        </div>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} syncId={TELEMETRY_SYNC_ID}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="d"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            tickFormatter={v => `${Math.round(v)}m`}
            tickCount={6}
          />
          <YAxis
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            width={44}
            tickFormatter={v => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`}
          />
          <ReferenceLine y={0} stroke="var(--border-accent)" />
          <Tooltip content={props => <ChartTooltip {...props} unit="s" digits={3} />} />
          <Line type="monotone" dataKey="delta" stroke="var(--purple)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Headline numbers for the lap, mirroring what the lap table can't show. */
function LapStatStrip({ lap, trace }: { lap: LapEntry; trace: Trace }) {
  const { formatSpeed } = useUnits();

  // Prefer the figures the companion computed over the full lap; fall back to
  // the trace for laps uploaded before those fields existed.
  const topSpeed = lap.topSpeedKph ?? (trace.length > 0 ? Math.max(...trace.map(p => p.speed)) : null);
  const avgThrottle = lap.avgThrottlePct ?? (trace.length > 0 ? trace.reduce((a, p) => a + p.throttle, 0) / trace.length : null);
  const avgBrake = lap.avgBrakePct ?? (trace.length > 0 ? trace.reduce((a, p) => a + p.brake, 0) / trace.length : null);
  const lapSeconds = lap.lapTimeMs ? lap.lapTimeMs / 1000 : secsFromLap(lap.time);
  const lapDistance = trace.length > 0 ? trace[trace.length - 1].d : 0;
  const avgSpeed = isFinite(lapSeconds) && lapSeconds > 0 && lapDistance > 0
    ? (lapDistance / lapSeconds) * 3.6
    : null;

  const stats: { label: string; value: string; accent?: boolean }[] = [
    { label: 'Lap Time', value: lap.time || '—', accent: true },
    { label: 'Top Speed', value: topSpeed != null ? formatSpeed(topSpeed) : '—' },
    { label: 'Avg. Speed', value: avgSpeed != null ? formatSpeed(avgSpeed) : '—' },
    { label: 'Avg. Throttle', value: avgThrottle != null ? `${Math.round(avgThrottle)}%` : '—' },
    { label: 'Avg. Brake', value: avgBrake != null ? `${Math.round(avgBrake)}%` : '—' },
  ];

  return (
    <div className="lap-stat-strip">
      {stats.map(s => (
        <div key={s.label} className="lap-stat">
          <div className="lap-stat-label">{s.label}</div>
          <div className={`lap-stat-value${s.accent ? ' accent' : ''}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function LapTelemetryModal({ sessionId, lap, onClose }: { sessionId: string; lap: LapEntry; onClose: () => void }) {
  const { speedUnit, convertSpeed } = useUnits();
  // The session list omits lap traces to stay fast/cheap to load, so the full
  // trace for this one lap is fetched on demand when the modal opens.
  const { data: fullSession, isLoading } = useGetSessionDetail(sessionId);
  const [compareLapNum, setCompareLapNum] = useState<number | null>(null);

  const trace: Trace = fullSession?.laps?.find(l => l.lap === lap.lap)?.trace ?? [];

  // Only laps that carry a trace of their own can be compared against.
  const comparableLaps = (fullSession?.laps ?? []).filter(
    l => l.lap !== lap.lap && (l.trace?.length ?? 0) > 1,
  );
  const compareLap = comparableLaps.find(l => l.lap === compareLapNum) ?? null;
  const compareTrace: Trace | null = compareLap?.trace ?? null;
  const compareLabel = compareLap ? `Lap ${compareLap.lap}${compareLap.time ? ` (${compareLap.time})` : ''}` : '';

  const rows = useMemo(
    () => buildChartRows(trace, compareTrace, convertSpeed),
    [trace, compareTrace, convertSpeed],
  );
  const hasGear = trace.some(p => p.gear != null);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <span className="modal-title">Lap {lap.lap} Telemetry{lap.time ? ` — ${lap.time}` : ''}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 'var(--space-5) 0', textAlign: 'center', color: 'var(--gray-mid)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)' }}>Loading telemetry…</div>
          ) : trace.length === 0 ? (
            <div style={{ padding: 'var(--space-5) 0', textAlign: 'center', color: 'var(--gray-mid)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)' }}>No telemetry data recorded for this lap.</div>
          ) : (
            <>
              <LapStatStrip lap={lap} trace={trace} />

              {comparableLaps.length > 0 && (
                <div className="lap-compare-bar">
                  <GitCompare size={13} aria-hidden="true" />
                  <label htmlFor="lap-compare-select">Compare with</label>
                  <select
                    id="lap-compare-select"
                    value={compareLapNum ?? ''}
                    onChange={e => setCompareLapNum(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">No comparison</option>
                    {comparableLaps.map(l => (
                      <option key={l.lap} value={l.lap}>Lap {l.lap}{l.time ? ` — ${l.time}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {compareTrace && rows.length > 0 && <DeltaChart data={rows} compareLabel={compareLabel} />}

              <TelemetryTraceChart dataKey="speed" label={`Speed (${speedUnit})`} color="var(--teal)" unit={` ${speedUnit}`} data={rows} compareLabel={compareLabel} />
              <TelemetryTraceChart dataKey="throttle" label="Throttle" color="var(--green)" unit="%" domain={[0, 100]} data={rows} compareLabel={compareLabel} />
              <TelemetryTraceChart dataKey="brake" label="Brake" color="var(--red)" unit="%" domain={[0, 100]} data={rows} compareLabel={compareLabel} />
              {hasGear && (
                <TelemetryTraceChart dataKey="gear" label="Gear" color="var(--teal)" unit="" domain={['dataMin', 'dataMax']} data={rows} step height={120} compareLabel={compareLabel} />
              )}
              <TelemetryTraceChart dataKey="steer" label="Steering" color="var(--purple)" unit="%" domain={[-100, 100]} data={rows} compareLabel={compareLabel} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Full session detail fields — reused by Sessions row expansion and the
// standalone modal opened from Dashboard / Tracks. ─────────────────────────

export function SessionDetailFields({ session: s, onViewTelemetry }: { session: SessionRecord; onViewTelemetry: (sessionId: string, lap: LapEntry) => void }) {
  const { formatTemp, formatSpeed } = useUnits();

  return (
    <>
      {(s.s1 || s.s2 || s.s3) && (
        <>
          {s.s1 && <div className="expanded-item"><div className="expanded-label">Best S1</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s1}</div></div>}
          {s.s2 && <div className="expanded-item"><div className="expanded-label">Best S2</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s2}</div></div>}
          {s.s3 && <div className="expanded-item"><div className="expanded-label">Best S3</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s3}</div></div>}
        </>
      )}
      {s.laps && s.laps.length > 0 && (() => {
        const validS1 = s.laps!.filter(l => l.s1 && l.s1.trim()).map(l => ({ val: l.s1, secs: parseFloat(l.s1) })).filter(x => !isNaN(x.secs));
        const validS2 = s.laps!.filter(l => l.s2 && l.s2.trim()).map(l => ({ val: l.s2, secs: parseFloat(l.s2) })).filter(x => !isNaN(x.secs));
        const validS3 = s.laps!.filter(l => l.s3 && l.s3.trim()).map(l => ({ val: l.s3, secs: parseFloat(l.s3) })).filter(x => !isNaN(x.secs));
        if (validS1.length === 0 && validS2.length === 0 && validS3.length === 0) return null;
        const bestS1 = validS1.length > 0 ? validS1.reduce((a, b) => a.secs < b.secs ? a : b).val : null;
        const bestS2 = validS2.length > 0 ? validS2.reduce((a, b) => a.secs < b.secs ? a : b).val : null;
        const bestS3 = validS3.length > 0 ? validS3.reduce((a, b) => a.secs < b.secs ? a : b).val : null;
        return (
          <div style={{ gridColumn: '1 / -1', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 10 }}>Best Sectors (from laps)</div>
            <div className="expanded-group-grid">
              {bestS1 && <div className="expanded-item"><div className="expanded-label">S1</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>{bestS1}</div></div>}
              {bestS2 && <div className="expanded-item"><div className="expanded-label">S2</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>{bestS2}</div></div>}
              {bestS3 && <div className="expanded-item"><div className="expanded-label">S3</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>{bestS3}</div></div>}
            </div>
          </div>
        );
      })()}
      {s.conditions && <div className="expanded-item"><div className="expanded-label">Conditions</div><div className="expanded-value">{s.conditions}</div></div>}
      {s.timeOfDay && <div className="expanded-item"><div className="expanded-label">Time of Day</div><div className="expanded-value">{s.timeOfDay}</div></div>}
      {s.assists && <div className="expanded-item"><div className="expanded-label">Assists</div><div className="expanded-value">{s.assists}</div></div>}
      {s.penalty && <div className="expanded-item"><div className="expanded-label">Penalty</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.penalty}</div></div>}
      {!!s.aiDifficulty && <div className="expanded-item"><div className="expanded-label">AI Difficulty</div><div className="expanded-value">{s.aiDifficulty}</div></div>}
      {!!s.position && <div className="expanded-item"><div className="expanded-label">Finish Position</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>P{s.position}</div></div>}

      <ExpandedGroup label="Fuel & Tyres" icon={Fuel} defaultOpen show={!!s.fuelRemainingLaps || !!s.fuelInTank || !!s.tyreWear || !!s.tyreSurfaceTemps || !!s.brakeTemps || !!s.tyreAgeLaps || !!s.actualTyreCompound || !!s.startingFuelKg || !!s.fuelCapacity || !!s.tyrePressureLive}>
        {!!s.fuelRemainingLaps && <div className="expanded-item"><div className="expanded-label">Fuel Remaining</div><div className="expanded-value">{s.fuelRemainingLaps.toFixed(1)} laps</div></div>}
        {!!s.fuelInTank && <div className="expanded-item"><div className="expanded-label">Fuel in Tank</div><div className="expanded-value">{s.fuelInTank.toFixed(1)} kg</div></div>}
        {!!s.startingFuelKg && <div className="expanded-item"><div className="expanded-label">Starting Fuel</div><div className="expanded-value">{s.startingFuelKg.toFixed(1)} kg</div></div>}
        {!!s.fuelCapacity && <div className="expanded-item"><div className="expanded-label">Fuel Capacity</div><div className="expanded-value">{s.fuelCapacity.toFixed(1)} kg</div></div>}
        {!!s.actualTyreCompound && <div className="expanded-item"><div className="expanded-label">Actual Compound</div><div className="expanded-value">{s.actualTyreCompound}</div></div>}
        {!!s.tyreAgeLaps && <div className="expanded-item"><div className="expanded-label">Tyre Age</div><div className="expanded-value">{s.tyreAgeLaps} laps</div></div>}
        {s.tyreWear && <div className="expanded-item"><div className="expanded-label">Avg Tyre Wear</div><div className="expanded-value">{(s.tyreWear.reduce((a, b) => a + b, 0) / s.tyreWear.length).toFixed(1)}%</div></div>}
        {s.tyreSurfaceTemps && <div className="expanded-item"><div className="expanded-label">Avg Tyre Temp</div><div className="expanded-value">{formatTemp(s.tyreSurfaceTemps.reduce((a, b) => a + b, 0) / s.tyreSurfaceTemps.length)}</div></div>}
        {s.tyrePressureLive && <div className="expanded-item"><div className="expanded-label">Live Tyre Pressure (avg)</div><div className="expanded-value">{(s.tyrePressureLive.reduce((a, b) => a + b, 0) / s.tyrePressureLive.length).toFixed(1)} psi</div></div>}
        {s.brakeTemps && <div className="expanded-item"><div className="expanded-label">Avg Brake Temp</div><div className="expanded-value">{formatTemp(s.brakeTemps.reduce((a, b) => a + b, 0) / s.brakeTemps.length)}</div></div>}
      </ExpandedGroup>

      <ExpandedGroup label="Tyre Stints" icon={Disc} defaultOpen show={!!s.tyreStints && s.tyreStints.length > 0}>
        {s.tyreStints?.map((stint, i) => (
          <div key={i} className="expanded-item">
            <div className="expanded-label">Stint {i + 1}</div>
            <div className="expanded-value">{stint.visualCompound || stint.compound} · L{stint.startLap}–{stint.endLap}</div>
          </div>
        ))}
      </ExpandedGroup>

      <ExpandedGroup label="Car Setup" icon={Settings2} defaultOpen show={!!s.setupSnapshot || !!s.liveBrakeBias}>
        {!!s.setupSnapshot && (
          <>
            <div className="expanded-item"><div className="expanded-label">Wing F/R</div><div className="expanded-value">{s.setupSnapshot.frontWing} / {s.setupSnapshot.rearWing}</div></div>
            <div className="expanded-item"><div className="expanded-label">Brake Bias</div><div className="expanded-value">{s.setupSnapshot.brakeBias}%</div></div>
            <div className="expanded-item"><div className="expanded-label">Brake Pressure</div><div className="expanded-value">{s.setupSnapshot.brakePressure}%</div></div>
            <div className="expanded-item"><div className="expanded-label">Tyre Pressure F/R</div><div className="expanded-value">{s.setupSnapshot.frontTyrePressure.toFixed(1)} / {s.setupSnapshot.rearTyrePressure.toFixed(1)} psi</div></div>
            <div className="expanded-item"><div className="expanded-label">Camber F/R</div><div className="expanded-value">{s.setupSnapshot.frontCamber.toFixed(1)}° / {s.setupSnapshot.rearCamber.toFixed(1)}°</div></div>
            <div className="expanded-item"><div className="expanded-label">Toe F/R</div><div className="expanded-value">{s.setupSnapshot.frontToe.toFixed(2)}° / {s.setupSnapshot.rearToe.toFixed(2)}°</div></div>
            <div className="expanded-item"><div className="expanded-label">Ride Height F/R</div><div className="expanded-value">{s.setupSnapshot.frontRideHeight} / {s.setupSnapshot.rearRideHeight}</div></div>
            <div className="expanded-item"><div className="expanded-label">Anti-Roll Bar F/R</div><div className="expanded-value">{s.setupSnapshot.frontAntiRollBar} / {s.setupSnapshot.rearAntiRollBar}</div></div>
          </>
        )}
        {!!s.liveBrakeBias && <div className="expanded-item"><div className="expanded-label">Live Brake Bias</div><div className="expanded-value">{s.liveBrakeBias}%</div></div>}
      </ExpandedGroup>

      <ExpandedGroup label="Track Conditions" icon={Thermometer} show={!!s.trackTemperature || !!s.airTemperature || !!s.safetyCarStatus || !!s.pitSpeedLimit || !!s.totalLaps || s.vehicleFiaFlags != null}>
        {(!!s.trackTemperature || !!s.airTemperature) && <div className="expanded-item"><div className="expanded-label">Track / Air Temp</div><div className="expanded-value">{s.trackTemperature != null ? formatTemp(s.trackTemperature) : '—'} / {s.airTemperature != null ? formatTemp(s.airTemperature) : '—'}</div></div>}
        {!!s.safetyCarStatus && <div className="expanded-item"><div className="expanded-label">Safety Car</div><div className="expanded-value">{safetyCarLabel(s.safetyCarStatus)}</div></div>}
        {s.vehicleFiaFlags != null && s.vehicleFiaFlags > 0 && <div className="expanded-item"><div className="expanded-label">Flag</div><div className="expanded-value" style={{ color: fiaFlagColor(s.vehicleFiaFlags) }}>{fiaFlagLabel(s.vehicleFiaFlags)}</div></div>}
        {!!s.pitSpeedLimit && <div className="expanded-item"><div className="expanded-label">Pit Speed Limit</div><div className="expanded-value">{formatSpeed(s.pitSpeedLimit)}</div></div>}
        {!!s.totalLaps && <div className="expanded-item"><div className="expanded-label">Total Laps</div><div className="expanded-value">{s.totalLaps}</div></div>}
      </ExpandedGroup>

      <ExpandedGroup label="Performance" icon={Gauge} show={!!s.topSpeedKph || !!s.avgThrottlePct || !!s.avgBrakePct || !!s.maxRpm || !!s.topGear || !!s.drsActivations || !!s.engineTemperature || !!s.engineMaxRpm || !!s.pitStops}>
        {!!s.topSpeedKph && <div className="expanded-item"><div className="expanded-label">Top Speed</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{formatSpeed(s.topSpeedKph)}</div></div>}
        {(!!s.avgThrottlePct || !!s.avgBrakePct) && <div className="expanded-item"><div className="expanded-label">Avg Throttle / Brake</div><div className="expanded-value">{s.avgThrottlePct?.toFixed(0) ?? '—'}% / {s.avgBrakePct?.toFixed(0) ?? '—'}%</div></div>}
        {!!s.maxRpm && <div className="expanded-item"><div className="expanded-label">Max RPM Reached</div><div className="expanded-value">{s.maxRpm.toLocaleString()}</div></div>}
        {!!s.engineMaxRpm && <div className="expanded-item"><div className="expanded-label">Redline</div><div className="expanded-value">{s.engineMaxRpm.toLocaleString()}</div></div>}
        {!!s.engineTemperature && <div className="expanded-item"><div className="expanded-label">Engine Temp</div><div className="expanded-value">{formatTemp(s.engineTemperature)}</div></div>}
        {!!s.topGear && <div className="expanded-item"><div className="expanded-label">Top Gear</div><div className="expanded-value">{s.topGear}</div></div>}
        {!!s.drsActivations && <div className="expanded-item"><div className="expanded-label">DRS Activations</div><div className="expanded-value">{s.drsActivations}</div></div>}
        {!!s.pitStops && <div className="expanded-item"><div className="expanded-label">Pit Stops</div><div className="expanded-value">{s.pitStops}</div></div>}
      </ExpandedGroup>

      <ExpandedGroup label="ERS" icon={BatteryCharging} show={!!s.ersEnergyStored || !!s.ersDeployedThisLap || !!s.ersDeployMode}>
        {!!s.ersDeployMode && <div className="expanded-item"><div className="expanded-label">Deploy Mode</div><div className="expanded-value">{ersModeLabel(s.ersDeployMode)}</div></div>}
        {!!s.ersEnergyStored && <div className="expanded-item"><div className="expanded-label">Energy Stored</div><div className="expanded-value">{(s.ersEnergyStored / 1_000_000).toFixed(2)} MJ</div></div>}
        {!!s.ersDeployedThisLap && <div className="expanded-item"><div className="expanded-label">Deployed This Lap</div><div className="expanded-value">{(s.ersDeployedThisLap / 1_000_000).toFixed(2)} MJ</div></div>}
      </ExpandedGroup>

      <ExpandedGroup label="Damage" icon={AlertTriangle} show={(!!s.wingDamage && (s.wingDamage.front > 0 || s.wingDamage.rear > 0)) || !!s.floorDamage || !!s.diffuserDamage || !!s.sidepodDamage || !!s.gearBoxDamage || !!s.engineDamage}>
        {!!s.wingDamage?.front && <div className="expanded-item"><div className="expanded-label">Front Wing</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.wingDamage.front}%</div></div>}
        {!!s.wingDamage?.rear && <div className="expanded-item"><div className="expanded-label">Rear Wing</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.wingDamage.rear}%</div></div>}
        {!!s.floorDamage && <div className="expanded-item"><div className="expanded-label">Floor</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.floorDamage}%</div></div>}
        {!!s.diffuserDamage && <div className="expanded-item"><div className="expanded-label">Diffuser</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.diffuserDamage}%</div></div>}
        {!!s.sidepodDamage && <div className="expanded-item"><div className="expanded-label">Sidepod</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.sidepodDamage}%</div></div>}
        {!!s.gearBoxDamage && <div className="expanded-item"><div className="expanded-label">Gearbox</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.gearBoxDamage}%</div></div>}
        {!!s.engineDamage && <div className="expanded-item"><div className="expanded-label">Engine</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.engineDamage}%</div></div>}
      </ExpandedGroup>

      {s.notes && <div className="expanded-notes"><div className="expanded-label" style={{ marginBottom: 6 }}>Notes</div>{s.notes}</div>}

      {s.laps && s.laps.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <LapTable sessionId={s.id} laps={s.laps} onViewTelemetry={onViewTelemetry} />
        </div>
      )}
    </>
  );
}

// ─── Standalone modal — used from Dashboard and Tracks so a session can be
// opened for a full look without navigating to the Sessions page. ──────────

export function SessionDetailModal({ session, onClose }: { session: SessionRecord; onClose: () => void }) {
  const [telemetryLap, setTelemetryLap] = useState<LapEntry | null>(null);
  const onViewTelemetry = (_sessionId: string, lap: LapEntry) => setTelemetryLap(lap);
  const trackMeta = F1_TRACKS.find(t => t.id === session.trackId);

  return (
    <>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header">
            <span className="modal-title">
              {trackMeta ? `${trackMeta.flag} ${trackMeta.short}` : session.trackId} — {session.car}
            </span>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body" style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Best Lap</div>
                <span className={session.isPB ? 'pb-time' : 'lap-time'} style={{ fontSize: 22 }}>{session.bestLap || '—'}</span>
                {session.isPB && <span className="pb-badge" style={{ marginLeft: 6 }}>★ PB</span>}
              </div>
              <span className={`badge ${getTypeBadgeClass(session.type)}`}>{session.type}</span>
              <div style={{ marginLeft: 'auto', textAlign: 'right', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
                {session.date}
                {session.createdAt && !isNaN(new Date(session.createdAt).getTime()) && <> · {localTimeStr(session.createdAt)}</>}
              </div>
            </div>

            <div className="expanded-group-grid" style={{ marginBottom: 4 }}>
              <div className="expanded-item"><div className="expanded-label">Avg Lap</div><div className="expanded-value">{session.avgLap || '—'}</div></div>
              <div className="expanded-item"><div className="expanded-label">Worst Lap</div><div className="expanded-value">{session.worstLap || '—'}</div></div>
              <div className="expanded-item"><div className="expanded-label">Tires</div><div className="expanded-value">{session.tires || '—'}</div></div>
              <div className="expanded-item"><div className="expanded-label">Rating</div><div className="expanded-value">{session.rating ? `${session.rating}/5` : '—'}</div></div>
            </div>

            <div className="expanded-content">
              <SessionDetailFields session={session} onViewTelemetry={onViewTelemetry} />
            </div>
          </div>
        </div>
      </div>
      {telemetryLap && <LapTelemetryModal sessionId={session.id} lap={telemetryLap} onClose={() => setTelemetryLap(null)} />}
    </>
  );
}
