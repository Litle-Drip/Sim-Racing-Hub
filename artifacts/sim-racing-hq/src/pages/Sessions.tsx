import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, Trash2, Share2, X, Flag, Activity, AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Toast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import {
  useGetSessions,
  useCreateSession,
  useDeleteSession,
  useShareSession,
  getGetSessionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, F1_25_CARS, TIRE_COMPOUNDS, SESSION_TYPES, CONDITIONS, TIME_OF_DAY, ASSISTS, PLATFORMS, INPUT_DEVICES, GAME_VERSIONS, getTypeBadgeClass } from '../data/f1Tracks';
import { CarCombobox } from '../components/CarCombobox';
import { LapTimeInput } from '../components/LapTimeInput';
import { sessionConsistency } from '../lib/engagement';
import { findDataIssues } from '../lib/dataCleanup';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormLap {
  time: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  penalty: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function secsFromLap(t: string): number {
  if (!t || t.trim() === '') return Infinity;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const v = parseFloat(m) * 60 + parseFloat(s);
    return isNaN(v) ? Infinity : v;
  }
  const n = parseFloat(t);
  return isNaN(n) ? Infinity : n;
}

function localTimeStr(createdAt: string): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function secsToLapStr(secs: number): string {
  if (!isFinite(secs)) return '';
  const m = Math.floor(secs / 60);
  const rem = secs - m * 60;
  return `${m}:${rem.toFixed(3).padStart(6, '0')}`;
}

function computeFromLaps(laps: FormLap[]) {
  const valid = laps.filter(l => l.time.trim() !== '');
  if (valid.length === 0) return { bestLap: '', avgLap: '', worstLap: '' };
  const times = valid.map(l => secsFromLap(l.time));
  return {
    bestLap: secsToLapStr(Math.min(...times)),
    avgLap: secsToLapStr(times.reduce((a, b) => a + b, 0) / times.length),
    worstLap: secsToLapStr(Math.max(...times)),
  };
}

// ─── Badge & display helpers ──────────────────────────────────────────────────

function RatingDots({ rating }: { rating: number }) {
  return (
    <span className="rating-dots">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`rating-dot${i <= rating ? ' filled' : ''}`} />
      ))}
    </span>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-rating">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`star${i <= value ? ' filled' : ''}`} onClick={() => onChange(i)}>★</span>
      ))}
    </div>
  );
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

function ExpandedGroup({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div style={{ gridColumn: '1 / -1', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div className="expanded-group-grid">{children}</div>
    </div>
  );
}

// ─── Lap table (expanded view) ────────────────────────────────────────────────

function validLaps(laps: SessionRecord['laps']) {
  return laps?.filter(l => l.time && l.time.trim() !== '') ?? [];
}

type LapEntry = NonNullable<SessionRecord['laps']>[number];

function LapTable({ laps: rawLaps, onViewTelemetry }: { laps: SessionRecord['laps']; onViewTelemetry: (lap: LapEntry) => void }) {
  const laps = validLaps(rawLaps);
  if (!laps || laps.length === 0) return null;
  const fastestIdx = laps.reduce((best, l, i) => {
    return secsFromLap(l.time) < secsFromLap(laps[best].time) ? i : best;
  }, 0);

  return (
    <div style={{ width: '100%', overflowX: 'auto', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 8 }}>
        Lap Data
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Lap', 'Time', 'S1', 'S2', 'S3', 'Tires', 'Penalty', ''].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--gray-mid)', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {laps.map((l, i) => {
            const isFastest = i === fastestIdx && laps.length > 1;
            return (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isFastest ? 'rgba(0,210,190,0.07)' : undefined }}>
                <td style={{ padding: '5px 8px', color: 'var(--gray-mid)' }}>{l.lap}</td>
                <td style={{ padding: '5px 8px', color: isFastest ? 'var(--teal)' : 'var(--white)', fontWeight: isFastest ? 700 : 400 }}>{l.time || '—'}</td>
                <td style={{ padding: '5px 8px', color: 'var(--gray-light)' }}>{l.s1 || '—'}</td>
                <td style={{ padding: '5px 8px', color: 'var(--gray-light)' }}>{l.s2 || '—'}</td>
                <td style={{ padding: '5px 8px', color: 'var(--gray-light)' }}>{l.s3 || '—'}</td>
                <td style={{ padding: '5px 8px', color: 'var(--gray-mid)' }}>{l.tires || '—'}</td>
                <td style={{ padding: '5px 8px', color: l.penalty ? 'var(--red)' : 'var(--gray-mid)' }}>{l.penalty || '—'}</td>
                <td style={{ padding: '5px 8px' }}>
                  {l.trace && l.trace.length > 0 && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => onViewTelemetry(l)}
                      title="View speed/throttle/brake telemetry for this lap"
                    >
                      <Activity size={11} /> Telemetry
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Lap telemetry modal (speed/throttle/brake/steer vs. distance) ────────────

function TelemetryTraceChart({
  dataKey,
  label,
  color,
  unit,
  domain,
  data,
}: {
  dataKey: 'speed' | 'throttle' | 'brake' | 'steer';
  label: string;
  color: string;
  unit: string;
  domain?: [number, number];
  data: NonNullable<LapEntry['trace']>;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1E1E1E" strokeDasharray="0" />
          <XAxis
            dataKey="d"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#A8A8A8' }}
            axisLine={{ stroke: '#1E1E1E' }}
            tickLine={false}
            tickFormatter={v => `${v}m`}
            tickCount={6}
          />
          <YAxis
            domain={domain ?? ['auto', 'auto']}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#A8A8A8' }}
            axisLine={{ stroke: '#1E1E1E' }}
            tickLine={false}
            width={36}
          />
          <Tooltip content={({ active, payload, label: d }) => active && payload && payload.length > 0 ? (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', padding: '8px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray-mid)' }}>{d}m</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color }}>{payload[0].value}{unit}</div>
            </div>
          ) : null} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LapTelemetryModal({ lap, onClose }: { lap: LapEntry; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title">Lap {lap.lap} Telemetry{lap.time ? ` — ${lap.time}` : ''}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <TelemetryTraceChart dataKey="speed" label="Speed (km/h)" color="#00D2BE" unit=" km/h" data={lap.trace ?? []} />
          <TelemetryTraceChart dataKey="throttle" label="Throttle" color="#4CAF50" unit="%" domain={[0, 100]} data={lap.trace ?? []} />
          <TelemetryTraceChart dataKey="brake" label="Brake" color="#E8002D" unit="%" domain={[0, 100]} data={lap.trace ?? []} />
          <TelemetryTraceChart dataKey="steer" label="Steering" color="#a855f7" unit="%" domain={[-100, 100]} data={lap.trace ?? []} />
        </div>
      </div>
    </div>
  );
}

// ─── Data cleanup (duplicate/garbage telemetry sessions) ──────────────────────

function trackNameForCleanup(id: string): string {
  return F1_TRACKS.find(t => t.id === id)?.short ?? id;
}

function cleanupRowLabel(s: SessionRecord): string {
  const parts = [s.date];
  if (s.createdAt) {
    const t = new Date(s.createdAt);
    if (!isNaN(t.getTime())) parts.push(t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
  }
  return parts.join(' · ');
}

function DataCleanupModal({
  duplicateClusters,
  emptySessions,
  onClose,
  onDeleteSelected,
}: {
  duplicateClusters: SessionRecord[][];
  emptySessions: SessionRecord[];
  onClose: () => void;
  onDeleteSelected: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    // Default: keep the earliest upload in each duplicate cluster, select the
    // rest for deletion. Empty/incomplete sessions have nothing worth
    // keeping, so select all of them by default.
    duplicateClusters.forEach(cluster => cluster.slice(1).forEach(sess => s.add(sess.id)));
    emptySessions.forEach(sess => s.add(sess.id));
    return s;
  });
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    setDeleting(true);
    setDeleteError('');
    const ids = [...selected];
    setProgress({ done: 0, total: ids.length });
    let failures = 0;
    // Delete one at a time with a hard timeout per request — the underlying
    // fetch has none, so a single unresponsive request (a cold backend, a
    // dropped connection) would otherwise hang this forever with no way to
    // recover or even tell the user something's wrong.
    for (let i = 0; i < ids.length; i++) {
      try {
        await Promise.race([
          onDeleteSelected([ids[i]]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out')), 20000)),
        ]);
      } catch {
        failures++;
      }
      setProgress({ done: i + 1, total: ids.length });
    }
    setDeleting(false);
    if (failures > 0) {
      setDeleteError(`${failures} of ${ids.length} couldn't be deleted (server didn't respond in time). The rest were removed — try again for the remaining ones.`);
    } else {
      onClose();
    }
  };

  const totalIssues = duplicateClusters.reduce((n, c) => n + c.length, 0) + emptySessions.length;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <span className="modal-title">Review & Clean Up Data</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {totalIssues === 0 ? (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', padding: '20px 0', textAlign: 'center' }}>
              No duplicate or empty telemetry sessions found. Your data looks clean.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginBottom: 16, lineHeight: 1.5 }}>
                Scanned only sessions uploaded by the companion app (manually-logged sessions are never touched). Checked rows will be deleted — uncheck anything you want to keep.
              </div>

              {duplicateClusters.map((cluster, ci) => (
                <div key={ci} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={13} style={{ color: 'var(--yellow)' }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-light)' }}>
                      Duplicate — {trackNameForCleanup(cluster[0].trackId)} · {cluster[0].car} · {cluster[0].bestLap || '—'}
                    </span>
                  </div>
                  {cluster.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', cursor: 'pointer', borderRadius: 3 }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--red)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-light)', flex: 1 }}>
                        {cleanupRowLabel(s)} — {s.laps?.length ?? 0} laps
                      </span>
                      {!selected.has(s.id) && <span style={{ fontSize: 10, color: 'var(--teal)', fontFamily: 'var(--font-body)' }}>KEEP</span>}
                    </label>
                  ))}
                </div>
              ))}

              {emptySessions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={13} style={{ color: 'var(--red)' }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-light)' }}>
                      Empty sessions (no laps recorded)
                    </span>
                  </div>
                  {emptySessions.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', cursor: 'pointer', borderRadius: 3 }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--red)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-light)', flex: 1 }}>
                        {cleanupRowLabel(s)} — {trackNameForCleanup(s.trackId)} · {s.car}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {totalIssues > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            {deleteError && <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--red)' }}>{deleteError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
              {deleting && progress && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray-mid)' }}>{progress.done} / {progress.total}</span>
              )}
              <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>Cancel</button>
              <button
                className="btn btn-secondary"
                style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={handleDeleteSelected}
                disabled={deleting || selected.size === 0}
              >
                <Trash2 size={11} style={{ marginRight: 4 }} />
                {deleting ? 'Deleting…' : `Delete Selected (${selected.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lap input row (form) ─────────────────────────────────────────────────────

function LapRow({
  index,
  lap,
  onChange,
  onRemove,
  defaultTires,
}: {
  index: number;
  lap: FormLap;
  onChange: (field: keyof FormLap, value: string) => void;
  onRemove: () => void;
  defaultTires: string;
}) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)', textAlign: 'center', minWidth: 32 }}>{index + 1}</td>
      {(['time', 's1', 's2', 's3'] as const).map(field => (
        <td key={field} style={{ padding: '2px 4px' }}>
          <input
            type="text"
            placeholder={field === 'time' ? '1:23.456' : '24.1'}
            value={lap[field]}
            onChange={e => onChange(field, e.target.value)}
            style={{ width: '100%', minWidth: 72, fontSize: 12, padding: '4px 6px', fontFamily: 'var(--font-mono)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--white)', outline: 'none' }}
          />
        </td>
      ))}
      <td style={{ padding: '2px 4px' }}>
        <select
          value={lap.tires || defaultTires}
          onChange={e => onChange('tires', e.target.value)}
          style={{ width: '100%', minWidth: 70, fontSize: 11, padding: '4px 4px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--white)' }}
        >
          {TIRE_COMPOUNDS.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td style={{ padding: '2px 4px' }}>
        <input
          type="text"
          placeholder="5s"
          value={lap.penalty}
          onChange={e => onChange('penalty', e.target.value)}
          style={{ width: '100%', minWidth: 50, fontSize: 12, padding: '4px 6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--red)', outline: 'none' }}
        />
      </td>
      <td style={{ padding: '2px 4px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-mid)', padding: 2, display: 'flex', alignItems: 'center' }}
          title="Remove lap"
        >
          <X size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Default form ─────────────────────────────────────────────────────────────

const defaultForm = () => ({
  date: localDateStr(),
  trackId: '',
  car: '',
  type: 'Practice',
  bestLap: '',
  avgLap: '',
  worstLap: '',
  tires: 'Soft',
  fuelLoad: 50,
  conditions: 'Dry',
  timeOfDay: '',
  assists: 'None',
  rating: 0,
  notes: '',
  penalty: '',
  gameVersion: '',
  platform: '',
  inputDevice: '',
  position: '',
});

const DRAFT_KEY = 'session-draft';
const GUEST_SESSIONS_KEY = 'f1simhub-guest-sessions';

// ─── Guest PB helper ──────────────────────────────────────────────────────────

function computeGuestPBs(sessions: SessionRecord[]): SessionRecord[] {
  const bestByTrackCar: Record<string, number> = {};
  for (const s of sessions) {
    const key = `${s.trackId}:${s.car}`;
    const t = secsFromLap(s.bestLap);
    if (isFinite(t) && (bestByTrackCar[key] === undefined || t < bestByTrackCar[key])) {
      bestByTrackCar[key] = t;
    }
  }
  return sessions.map(s => {
    const key = `${s.trackId}:${s.car}`;
    const t = secsFromLap(s.bestLap);
    return { ...s, isPB: isFinite(t) && t === bestByTrackCar[key] };
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sessions({ isGuest }: { isGuest?: boolean }) {
  const qc = useQueryClient();
  const { data: apiSessions = [], isLoading: apiLoading } = useGetSessions(
    isGuest ? { query: { enabled: false } as never } : undefined
  );

  const [guestSessions, setGuestSessions] = useState<SessionRecord[]>(() => {
    if (!isGuest) return [];
    try {
      const raw = localStorage.getItem(GUEST_SESSIONS_KEY);
      return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!isGuest) return;
    try { localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(guestSessions)); } catch {}
  }, [isGuest, guestSessions]);

  const sessions: SessionRecord[] = isGuest ? guestSessions : (apiSessions as SessionRecord[]);
  const isLoading = isGuest ? false : apiLoading;

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [laps, setLaps] = useState<FormLap[]>([]);
  const [lockedSummary, setLockedSummary] = useState<Set<string>>(new Set());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterConditions, setFilterConditions] = useState('');
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ id: string; publicNote: string } | null>(null);
  const [telemetryLap, setTelemetryLap] = useState<LapEntry | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [toast, setToast] = useState('');

  // ── Draft auto-save ────────────────────────────────────────────────────

  const saveDraft = useCallback(() => {
    if (!showModal) return;
    const hasData = form.trackId || form.car || form.bestLap || laps.length > 0 || form.notes;
    if (hasData) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, laps, savedAt: Date.now() })); } catch {}
    }
  }, [showModal, form, laps]);

  useEffect(() => {
    if (!showModal) return;
    const t = setInterval(saveDraft, 3000);
    return () => clearInterval(t);
  }, [showModal, saveDraft]);

  const loadDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw) as { form: ReturnType<typeof defaultForm>; laps: FormLap[]; savedAt: number };
      if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) { localStorage.removeItem(DRAFT_KEY); return false; }
      setForm(draft.form);
      setLaps(draft.laps ?? []);
      setLockedSummary(new Set());
      return true;
    } catch { return false; }
  }, []);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  const { mutate: apiCreateSession, isPending: apiSaving } = useCreateSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
        clearDraft();
        setShowModal(false);
        setForm(defaultForm());
        setLaps([]);
        setLockedSummary(new Set());
        setFormErrors({});
        setSaveError('');
        setToast('Session saved ✓');
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to save session. Please try again.';
        setSaveError(msg);
      },
    },
  });
  const saving = isGuest ? false : apiSaving;

  const { mutate: apiDeleteSession, mutateAsync: apiDeleteSessionAsync } = useDeleteSession({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() }) },
  });

  const { mutate: shareSession } = useShareSession({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() }); setSharingId(null); setShareModal(null); },
      onError: () => { setSharingId(null); setShareModal(null); },
    },
  });

  // ── Lap management ────────────────────────────────────────────────────────

  const newLap = (): FormLap => ({ time: '', s1: '', s2: '', s3: '', tires: form.tires, penalty: '' });

  const addLap = () => setLaps(prev => [...prev, newLap()]);

  const removeLap = (i: number) => {
    setLaps(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      syncSummary(next);
      return next;
    });
  };

  const updateLap = (i: number, field: keyof FormLap, value: string) => {
    setLaps(prev => {
      const next = prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      if (field === 'time') syncSummary(next);
      return next;
    });
  };

  const syncSummary = (lapList: FormLap[], locked: Set<string> = lockedSummary) => {
    const validLaps = lapList.filter(l => l.time.trim() !== '');
    if (validLaps.length === 0) return;
    const computed = computeFromLaps(lapList);
    if (!computed.bestLap) return;
    // Lap-driven mode: recalculate any field the user hasn't manually edited,
    // regardless of how many valid laps there are. Manually-edited (locked)
    // fields are left untouched so user overrides are respected.
    setForm(f => ({
      ...f,
      bestLap:  locked.has('bestLap')  ? f.bestLap  : computed.bestLap,
      avgLap:   locked.has('avgLap')   ? f.avgLap   : computed.avgLap,
      worstLap: locked.has('worstLap') ? f.worstLap : computed.worstLap,
    }));
  };

  // ── Auto-recalculate avg when best/worst change manually (no laps) ────
  const recalcAvg = (best: string, worst: string) => {
    const b = secsFromLap(best);
    const w = secsFromLap(worst);
    if (isFinite(b) && isFinite(w) && b > 0 && w > 0) {
      return secsToLapStr((b + w) / 2);
    }
    return '';
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short ?? id;

  const set = (k: string, v: string | number) => {
    if (k === 'bestLap' || k === 'avgLap' || k === 'worstLap') {
      setLockedSummary(s => new Set([...s, k]));
    }
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'bestLap' || k === 'worstLap') {
        next.avgLap = recalcAvg(next.bestLap, next.worstLap);
        setLockedSummary(s => new Set([...s, 'avgLap']));
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .filter(s => {
        if (filterTrack && s.trackId !== filterTrack) return false;
        if (filterType && s.type !== filterType) return false;
        if (filterCar && !s.car.toLowerCase().includes(filterCar.toLowerCase())) return false;
        if (filterConditions && s.conditions !== filterConditions) return false;
        return true;
      });
  }, [sessions, filterTrack, filterType, filterCar, filterConditions]);

  const mostRecentId = useMemo(() => {
    if (sessions.length === 0) return null;
    return [...sessions].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0].id;
  }, [sessions]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.trackId) errors.trackId = 'Please select a track';
    if (!form.car.trim()) errors.car = 'Please enter a car name';
    if (laps.length === 0 && !form.bestLap.trim()) errors.bestLap = 'Enter a best lap time or add at least one lap';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaveError('');

    const computed = laps.length > 0 ? computeFromLaps(laps) : null;

    // Best sector times independently (not from the same fastest lap)
    let bestS1 = '', bestS2 = '', bestS3 = '';
    if (laps.length > 0) {
      const validLaps = laps.filter(l => l.time.trim() !== '');
      if (validLaps.length > 0) {
        const s1Laps = validLaps.filter(l => l.s1.trim() !== '');
        const s2Laps = validLaps.filter(l => l.s2.trim() !== '');
        const s3Laps = validLaps.filter(l => l.s3.trim() !== '');
        bestS1 = s1Laps.length > 0 ? s1Laps.reduce((a, b) => secsFromLap(a.s1) < secsFromLap(b.s1) ? a : b).s1 : '';
        bestS2 = s2Laps.length > 0 ? s2Laps.reduce((a, b) => secsFromLap(a.s2) < secsFromLap(b.s2) ? a : b).s2 : '';
        bestS3 = s3Laps.length > 0 ? s3Laps.reduce((a, b) => secsFromLap(a.s3) < secsFromLap(b.s3) ? a : b).s3 : '';
      }
    }

    const lapRows = laps.length > 0 ? laps
      .filter(l => l.time.trim() !== '')
      .map((l, i) => ({
        lap: i + 1,
        time: l.time,
        s1: l.s1,
        s2: l.s2,
        s3: l.s3,
        tires: l.tires || form.tires,
        penalty: l.penalty,
      })) : undefined;

    if (isGuest) {
      const newSession: SessionRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        date: form.date,
        trackId: form.trackId,
        car: form.car,
        type: form.type,
        bestLap: computed?.bestLap || form.bestLap,
        avgLap: computed?.avgLap || form.avgLap,
        worstLap: computed?.worstLap || form.worstLap,
        s1: bestS1,
        s2: bestS2,
        s3: bestS3,
        tires: form.tires,
        fuelLoad: Number(form.fuelLoad),
        conditions: form.conditions,
        timeOfDay: form.timeOfDay || null,
        assists: form.assists,
        rating: form.rating,
        notes: form.notes,
        penalty: form.penalty || null,
        gameVersion: form.gameVersion || null,
        platform: form.platform || null,
        inputDevice: form.inputDevice || null,
        isPublic: false,
        sharedAt: null,
        publicNote: null,
        isPB: false,
        laps: lapRows && lapRows.length > 0 ? lapRows : null,
        position: form.type === 'Race' && form.position ? form.position : undefined,
      };
      const updatedSessions = computeGuestPBs([...guestSessions, newSession]);
      try {
        localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(updatedSessions));
      } catch {
        setSaveError('Your browser storage is full. Delete some sessions to free space, then try again.');
        return;
      }
      setGuestSessions(updatedSessions);
      clearDraft();
      setShowModal(false);
      setForm(defaultForm());
      setLaps([]);
      setLockedSummary(new Set());
      setFormErrors({});
      setSaveError('');
      setToast('Session saved ✓');
      return;
    }

    apiCreateSession({
      data: {
        id: crypto.randomUUID(),
        date: form.date,
        trackId: form.trackId,
        car: form.car,
        type: form.type,
        bestLap: computed?.bestLap || form.bestLap,
        avgLap: computed?.avgLap || form.avgLap,
        worstLap: computed?.worstLap || form.worstLap,
        s1: bestS1,
        s2: bestS2,
        s3: bestS3,
        tires: form.tires,
        fuelLoad: Number(form.fuelLoad),
        conditions: form.conditions,
        timeOfDay: form.timeOfDay || undefined,
        assists: form.assists,
        rating: form.rating,
        notes: form.notes,
        penalty: form.penalty,
        gameVersion: form.gameVersion,
        platform: form.platform,
        inputDevice: form.inputDevice,
        position: form.type === 'Race' && form.position ? form.position : undefined,
        laps: lapRows,
      },
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGuest) {
      setGuestSessions(prev => computeGuestPBs(prev.filter(s => s.id !== id)));
      return;
    }
    apiDeleteSession({ id });
  };

  const dataIssues = useMemo(() => findDataIssues(sessions), [sessions]);
  const dataIssuesCount = dataIssues.duplicateClusters.reduce((n, c) => n + c.length, 0) + dataIssues.emptySessions.length;

  const handleBulkDelete = async (ids: string[]) => {
    if (isGuest) {
      setGuestSessions(prev => computeGuestPBs(prev.filter(s => !ids.includes(s.id))));
      return;
    }
    for (const id of ids) {
      await apiDeleteSessionAsync({ id });
    }
  };

  const handleShare = (session: SessionRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.isPublic) {
      setSharingId(session.id);
      shareSession({ id: session.id });
    } else {
      setShareModal({ id: session.id, publicNote: '' });
    }
  };

  const confirmShare = () => {
    if (!shareModal) return;
    setSharingId(shareModal.id);
    shareSession({ id: shareModal.id, data: { publicNote: shareModal.publicNote || undefined } });
  };

  const closeModal = () => {
    saveDraft();
    setShowModal(false);
    setForm(defaultForm());
    setLaps([]);
    setLockedSummary(new Set());
    setFormErrors({});
    setSaveError('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Session Log</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {dataIssuesCount > 0 && (
            <button className="btn btn-secondary" style={{ color: 'var(--yellow)', borderColor: 'var(--yellow)' }} onClick={() => setCleanupOpen(true)}>
              <AlertTriangle size={12} style={{ marginRight: 4 }} /> Review Data ({dataIssuesCount})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => { const hadDraft = loadDraft(); if (!hadDraft) { setForm(defaultForm()); setLaps([]); } setShowModal(true); }}>
            <Plus size={12} /> Log Session
          </button>
        </div>
      </div>

      {isGuest && (
        <div style={{ background: 'rgba(0,210,190,0.07)', border: '1px solid rgba(0,210,190,0.22)', borderRadius: 4, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Saved in this browser only.</span> Sessions will persist across refreshes on this device. Create a free account to sync across all your devices.
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => window.dispatchEvent(new CustomEvent('guestSignIn'))}>
            Create Account
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <select className="filter-select" value={filterTrack} onChange={e => setFilterTrack(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filterCar} onChange={e => setFilterCar(e.target.value)}>
          <option value="">All Cars</option>
          {F1_25_CARS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={filterConditions} onChange={e => setFilterConditions(e.target.value)}>
          <option value="">All Conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="table-wrap">
          <div className="empty-state"><div className="empty-state-title">Loading Sessions…</div></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-wrap">
          {sessions.length === 0 ? (
            <EmptyState
              icon={<Flag size={40} />}
              headline="No sessions yet"
              subtext="Log your first session — it takes 30 seconds. Track, car, best lap and you're done."
              ctaLabel="Log Session"
              onCta={() => { const hadDraft = loadDraft(); if (!hadDraft) { setForm(defaultForm()); setLaps([]); } setShowModal(true); }}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">No Sessions Found</div>
              <div className="empty-state-desc">No sessions match your current filters. Try adjusting or clearing them.</div>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table sessions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Track</th>
                <th>Car</th>
                <th>Best Lap</th>
                <th>Avg Lap</th>
                <th>Worst Lap</th>
                <th>Consistency</th>
                <th>Type</th>
                <th>Tires</th>
                <th>Conditions</th>
                <th>Rating</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <React.Fragment key={s.id}>
                  <tr onClick={() => setExpanded(expanded === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                    <td data-label="Date" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {s.date}
                      {s.createdAt && <div style={{ color: 'var(--gray-mid)', fontSize: 10, marginTop: 1 }}>{localTimeStr(s.createdAt)}</div>}
                    </td>
                    <td data-label="Track">{trackName(s.trackId)}</td>
                    <td data-label="Car" style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                    <td data-label="Best Lap">
                      <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                      {s.isPB && <span className="pb-badge">★ PB</span>}
                    </td>
                    <td data-label="Avg Lap"><span className="lap-time" style={{ color: 'var(--gray-light)', fontSize: 12 }}>{s.avgLap || '—'}</span></td>
                    <td data-label="Worst Lap"><span className="lap-time" style={{ color: 'var(--gray-mid)', fontSize: 12 }}>{s.worstLap || '—'}</span></td>
                    <td data-label="Consistency">{(() => { const c = sessionConsistency(s); return c !== null ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c >= 98 ? 'var(--teal)' : c >= 95 ? 'var(--white)' : 'var(--gray-mid)' }}>{c.toFixed(1)}%</span> : <span style={{ color: 'var(--gray)' }}>—</span>; })()}</td>
                    <td data-label="Type"><span className={`badge ${getTypeBadgeClass(s.type)}`}>{s.type}</span></td>
                    <td data-label="Tires" style={{ color: 'var(--gray-mid)' }}>{s.tires}</td>
                    <td data-label="Conditions" style={{ color: 'var(--gray-light)', fontSize: 12 }}>
                      {s.conditions || '—'}
                      {s.timeOfDay ? <span style={{ color: 'var(--gray-mid)', marginLeft: 4 }}>· {s.timeOfDay}</span> : null}
                    </td>
                    <td data-label="Rating"><RatingDots rating={s.rating} /></td>
                    <td data-label="" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {s.id === mostRecentId && <span title="Most recently logged session" style={{ color: 'var(--red)', fontSize: 10, fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>MOST RECENT</span>}
                      {s.isPublic && <span title="Shared" style={{ color: 'var(--teal)', fontSize: 10, fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE</span>}
                      {validLaps(s.laps).length > 0 && <span style={{ color: 'var(--gray-mid)', fontSize: 10, fontFamily: 'var(--font-body)' }}>{validLaps(s.laps).length}L</span>}
                      {s.notes && <FileText size={13} style={{ color: 'var(--gray)', verticalAlign: 'middle' }} />}
                      {expanded === s.id ? <ChevronUp size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} /> : <ChevronDown size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} />}
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} className="expanded-row">
                      <td colSpan={12}>
                        <div className="expanded-content">
                          {/* Sector times — from fastest lap or manual entry */}
                          {(s.s1 || s.s2 || s.s3) && (
                            <>
                              {s.s1 && <div className="expanded-item"><div className="expanded-label">Best S1</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s1}</div></div>}
                              {s.s2 && <div className="expanded-item"><div className="expanded-label">Best S2</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s2}</div></div>}
                              {s.s3 && <div className="expanded-item"><div className="expanded-label">Best S3</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s3}</div></div>}
                            </>
                          )}
                          {/* Best sectors from laps data */}
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
                                  {bestS1 && <div className="expanded-item"><div className="expanded-label">S1</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS1}</div></div>}
                                  {bestS2 && <div className="expanded-item"><div className="expanded-label">S2</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS2}</div></div>}
                                  {bestS3 && <div className="expanded-item"><div className="expanded-label">S3</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS3}</div></div>}
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

                          <ExpandedGroup label="Fuel & Tyres" show={!!s.fuelRemainingLaps || !!s.fuelInTank || !!s.tyreWear || !!s.tyreSurfaceTemps || !!s.brakeTemps || !!s.tyreAgeLaps || !!s.actualTyreCompound || !!s.startingFuelKg || !!s.fuelCapacity || !!s.tyrePressureLive}>
                            {!!s.fuelRemainingLaps && <div className="expanded-item"><div className="expanded-label">Fuel Remaining</div><div className="expanded-value">{s.fuelRemainingLaps.toFixed(1)} laps</div></div>}
                            {!!s.fuelInTank && <div className="expanded-item"><div className="expanded-label">Fuel in Tank</div><div className="expanded-value">{s.fuelInTank.toFixed(1)} kg</div></div>}
                            {!!s.startingFuelKg && <div className="expanded-item"><div className="expanded-label">Starting Fuel</div><div className="expanded-value">{s.startingFuelKg.toFixed(1)} kg</div></div>}
                            {!!s.fuelCapacity && <div className="expanded-item"><div className="expanded-label">Fuel Capacity</div><div className="expanded-value">{s.fuelCapacity.toFixed(1)} kg</div></div>}
                            {!!s.actualTyreCompound && <div className="expanded-item"><div className="expanded-label">Actual Compound</div><div className="expanded-value">{s.actualTyreCompound}</div></div>}
                            {!!s.tyreAgeLaps && <div className="expanded-item"><div className="expanded-label">Tyre Age</div><div className="expanded-value">{s.tyreAgeLaps} laps</div></div>}
                            {s.tyreWear && <div className="expanded-item"><div className="expanded-label">Avg Tyre Wear</div><div className="expanded-value">{(s.tyreWear.reduce((a, b) => a + b, 0) / s.tyreWear.length).toFixed(1)}%</div></div>}
                            {s.tyreSurfaceTemps && <div className="expanded-item"><div className="expanded-label">Avg Tyre Temp</div><div className="expanded-value">{Math.round(s.tyreSurfaceTemps.reduce((a, b) => a + b, 0) / s.tyreSurfaceTemps.length)}°C</div></div>}
                            {s.tyrePressureLive && <div className="expanded-item"><div className="expanded-label">Live Tyre Pressure (avg)</div><div className="expanded-value">{(s.tyrePressureLive.reduce((a, b) => a + b, 0) / s.tyrePressureLive.length).toFixed(1)} psi</div></div>}
                            {s.brakeTemps && <div className="expanded-item"><div className="expanded-label">Avg Brake Temp</div><div className="expanded-value">{Math.round(s.brakeTemps.reduce((a, b) => a + b, 0) / s.brakeTemps.length)}°C</div></div>}
                          </ExpandedGroup>

                          <ExpandedGroup label="Tyre Stints" show={!!s.tyreStints && s.tyreStints.length > 0}>
                            {s.tyreStints?.map((stint, i) => (
                              <div key={i} className="expanded-item">
                                <div className="expanded-label">Stint {i + 1}</div>
                                <div className="expanded-value">{stint.visualCompound || stint.compound} · L{stint.startLap}–{stint.endLap}</div>
                              </div>
                            ))}
                          </ExpandedGroup>

                          <ExpandedGroup label="Car Setup" show={!!s.setupSnapshot || !!s.liveBrakeBias}>
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

                          <ExpandedGroup label="Track Conditions" show={!!s.trackTemperature || !!s.airTemperature || !!s.safetyCarStatus || !!s.pitSpeedLimit || !!s.totalLaps || s.vehicleFiaFlags != null}>
                            {(!!s.trackTemperature || !!s.airTemperature) && <div className="expanded-item"><div className="expanded-label">Track / Air Temp</div><div className="expanded-value">{s.trackTemperature ?? '—'}° / {s.airTemperature ?? '—'}°</div></div>}
                            {!!s.safetyCarStatus && <div className="expanded-item"><div className="expanded-label">Safety Car</div><div className="expanded-value">{safetyCarLabel(s.safetyCarStatus)}</div></div>}
                            {s.vehicleFiaFlags != null && s.vehicleFiaFlags > 0 && <div className="expanded-item"><div className="expanded-label">Flag</div><div className="expanded-value" style={{ color: fiaFlagColor(s.vehicleFiaFlags) }}>{fiaFlagLabel(s.vehicleFiaFlags)}</div></div>}
                            {!!s.pitSpeedLimit && <div className="expanded-item"><div className="expanded-label">Pit Speed Limit</div><div className="expanded-value">{s.pitSpeedLimit} km/h</div></div>}
                            {!!s.totalLaps && <div className="expanded-item"><div className="expanded-label">Total Laps</div><div className="expanded-value">{s.totalLaps}</div></div>}
                          </ExpandedGroup>

                          <ExpandedGroup label="Performance" show={!!s.topSpeedKph || !!s.avgThrottlePct || !!s.avgBrakePct || !!s.maxRpm || !!s.topGear || !!s.drsActivations || !!s.engineTemperature || !!s.engineMaxRpm || !!s.pitStops}>
                            {!!s.topSpeedKph && <div className="expanded-item"><div className="expanded-label">Top Speed</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{Math.round(s.topSpeedKph)} km/h</div></div>}
                            {(!!s.avgThrottlePct || !!s.avgBrakePct) && <div className="expanded-item"><div className="expanded-label">Avg Throttle / Brake</div><div className="expanded-value">{s.avgThrottlePct?.toFixed(0) ?? '—'}% / {s.avgBrakePct?.toFixed(0) ?? '—'}%</div></div>}
                            {!!s.maxRpm && <div className="expanded-item"><div className="expanded-label">Max RPM Reached</div><div className="expanded-value">{s.maxRpm.toLocaleString()}</div></div>}
                            {!!s.engineMaxRpm && <div className="expanded-item"><div className="expanded-label">Redline</div><div className="expanded-value">{s.engineMaxRpm.toLocaleString()}</div></div>}
                            {!!s.engineTemperature && <div className="expanded-item"><div className="expanded-label">Engine Temp</div><div className="expanded-value">{s.engineTemperature}°C</div></div>}
                            {!!s.topGear && <div className="expanded-item"><div className="expanded-label">Top Gear</div><div className="expanded-value">{s.topGear}</div></div>}
                            {!!s.drsActivations && <div className="expanded-item"><div className="expanded-label">DRS Activations</div><div className="expanded-value">{s.drsActivations}</div></div>}
                            {!!s.pitStops && <div className="expanded-item"><div className="expanded-label">Pit Stops</div><div className="expanded-value">{s.pitStops}</div></div>}
                          </ExpandedGroup>

                          <ExpandedGroup label="ERS" show={!!s.ersEnergyStored || !!s.ersDeployedThisLap || !!s.ersDeployMode}>
                            {!!s.ersDeployMode && <div className="expanded-item"><div className="expanded-label">Deploy Mode</div><div className="expanded-value">{ersModeLabel(s.ersDeployMode)}</div></div>}
                            {!!s.ersEnergyStored && <div className="expanded-item"><div className="expanded-label">Energy Stored</div><div className="expanded-value">{(s.ersEnergyStored / 1_000_000).toFixed(2)} MJ</div></div>}
                            {!!s.ersDeployedThisLap && <div className="expanded-item"><div className="expanded-label">Deployed This Lap</div><div className="expanded-value">{(s.ersDeployedThisLap / 1_000_000).toFixed(2)} MJ</div></div>}
                          </ExpandedGroup>

                          <ExpandedGroup label="Damage" show={(!!s.wingDamage && (s.wingDamage.front > 0 || s.wingDamage.rear > 0)) || !!s.floorDamage || !!s.diffuserDamage || !!s.sidepodDamage || !!s.gearBoxDamage || !!s.engineDamage}>
                            {!!s.wingDamage?.front && <div className="expanded-item"><div className="expanded-label">Front Wing</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.wingDamage.front}%</div></div>}
                            {!!s.wingDamage?.rear && <div className="expanded-item"><div className="expanded-label">Rear Wing</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.wingDamage.rear}%</div></div>}
                            {!!s.floorDamage && <div className="expanded-item"><div className="expanded-label">Floor</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.floorDamage}%</div></div>}
                            {!!s.diffuserDamage && <div className="expanded-item"><div className="expanded-label">Diffuser</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.diffuserDamage}%</div></div>}
                            {!!s.sidepodDamage && <div className="expanded-item"><div className="expanded-label">Sidepod</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.sidepodDamage}%</div></div>}
                            {!!s.gearBoxDamage && <div className="expanded-item"><div className="expanded-label">Gearbox</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.gearBoxDamage}%</div></div>}
                            {!!s.engineDamage && <div className="expanded-item"><div className="expanded-label">Engine</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.engineDamage}%</div></div>}
                          </ExpandedGroup>

                          {s.notes && <div className="expanded-notes"><div className="expanded-label" style={{ marginBottom: 6 }}>Notes</div>{s.notes}</div>}

                          {/* Per-lap table */}
                          {s.laps && s.laps.length > 0 && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <LapTable laps={s.laps} onViewTelemetry={setTelemetryLap} />
                            </div>
                          )}

                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--border)' }}>
                            {!isGuest && (
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 11, padding: '4px 10px', color: s.isPublic ? 'var(--teal)' : 'var(--gray-mid)', borderColor: s.isPublic ? 'var(--teal)' : 'var(--gray)' }}
                                onClick={(e) => handleShare(s, e)}
                                disabled={sharingId === s.id}
                                title={s.isPublic ? 'Remove from Community' : 'Share to Community'}
                              >
                                <Share2 size={11} style={{ marginRight: 4 }} />
                                {sharingId === s.id ? '…' : s.isPublic ? 'Shared' : 'Share'}
                              </button>
                            )}
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'var(--red)' }}
                              onClick={(e) => handleDelete(s.id, e)}
                            >
                              <Trash2 size={11} style={{ marginRight: 4 }} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Share Modal ───────────────────────────────────────────────────── */}
      {shareModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShareModal(null); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title">Share to Community</span>
              <button className="modal-close" onClick={() => setShareModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', marginBottom: 16, lineHeight: 1.6 }}>
                Your private notes won't be shared. You can optionally add a public description visible to the community.
              </p>
              <div className="field">
                <label className="field-label">Public Description <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  rows={3}
                  placeholder="e.g. Clean hotlap, very consistent on tyres — try reducing rear wing"
                  value={shareModal.publicNote}
                  onChange={e => setShareModal(m => m ? { ...m, publicNote: e.target.value } : m)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShareModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmShare} disabled={sharingId === shareModal.id}>
                {sharingId === shareModal.id ? 'Sharing…' : 'Share to Community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lap Telemetry Modal ───────────────────────────────────────────── */}
      {telemetryLap && (
        <LapTelemetryModal lap={telemetryLap} onClose={() => setTelemetryLap(null)} />
      )}

      {cleanupOpen && (
        <DataCleanupModal
          duplicateClusters={dataIssues.duplicateClusters}
          emptySessions={dataIssues.emptySessions}
          onClose={() => setCleanupOpen(false)}
          onDeleteSelected={handleBulkDelete}
        />
      )}

      {/* ── Log Session Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal" style={{ maxWidth: 780 }}>
            <div className="modal-header">
              <span className="modal-title">Log Session</span>
              {localStorage.getItem(DRAFT_KEY) && <span style={{ fontSize: 10, color: 'var(--teal)', fontFamily: 'var(--font-body)', marginLeft: 8, fontWeight: 400 }}>Draft restored</span>}
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {/* ── Core fields ── */}
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Date</label>
                  <input type="date" autoFocus value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Track <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select value={form.trackId} onChange={e => { set('trackId', e.target.value); setFormErrors(fe => ({ ...fe, trackId: '' })); }} style={formErrors.trackId ? { borderBottomColor: 'var(--red)' } : {}}>
                    <option value="">Select Track</option>
                    {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
                  </select>
                  {formErrors.trackId && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.trackId}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Car <span style={{ color: 'var(--red)' }}>*</span></label>
                  <CarCombobox value={form.car} onChange={v => { set('car', v); setFormErrors(fe => ({ ...fe, car: '' })); }} error={!!formErrors.car} />
                  {formErrors.car && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.car}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Session Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)}>
                    {SESSION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Default Tires</label>
                  <select value={form.tires} onChange={e => set('tires', e.target.value)}>
                    {TIRE_COMPOUNDS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fuel Load %</label>
                  <input type="number" min={0} max={100} value={form.fuelLoad} onChange={e => set('fuelLoad', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Conditions</label>
                  <select value={form.conditions} onChange={e => set('conditions', e.target.value)}>
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Time of Day</label>
                  <select value={form.timeOfDay} onChange={e => set('timeOfDay', e.target.value)}>
                    <option value="">Not Set</option>
                    {TIME_OF_DAY.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Assists</label>
                  <select value={form.assists} onChange={e => set('assists', e.target.value)}>
                    {ASSISTS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Game Version</label>
                  <select value={form.gameVersion} onChange={e => set('gameVersion', e.target.value)}>
                    <option value="">Select Version</option>
                    {GAME_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Platform</label>
                  <select value={form.platform} onChange={e => set('platform', e.target.value)}>
                    <option value="">Select Platform</option>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Input Device</label>
                  <select value={form.inputDevice} onChange={e => set('inputDevice', e.target.value)}>
                    <option value="">Select Input</option>
                    {INPUT_DEVICES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Overall Penalty</label>
                  <input type="text" placeholder="e.g. 5s, 10s" value={form.penalty} onChange={e => set('penalty', e.target.value)} />
                </div>
                {form.type === 'Race' && (
                  <div className="field">
                    <label className="field-label">Finishing Position</label>
                    <select value={form.position} onChange={e => set('position', e.target.value)}>
                      <option value="">Not Set</option>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map(p => (
                        <option key={p} value={String(p)}>P{p}</option>
                      ))}
                      <option value="DNF">DNF</option>
                      <option value="DSQ">DSQ</option>
                    </select>
                  </div>
                )}
                <div className="field">
                  <label className="field-label">Rating</label>
                  <StarRating value={form.rating} onChange={v => set('rating', v)} />
                </div>
                <div className="field full">
                  <label className="field-label">Notes</label>
                  <textarea rows={2} placeholder="Session notes..." value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>

              {/* ── Summary times (auto-computed or manual) ── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 10 }}>
                  Lap Summary {laps.length > 0 && <span style={{ color: 'var(--teal)', marginLeft: 6 }}>← auto-computed from laps</span>}
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Best Lap {laps.length === 0 && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                    <LapTimeInput value={form.bestLap} onChange={v => { set('bestLap', v); setFormErrors(fe => ({ ...fe, bestLap: '' })); }} error={!!formErrors.bestLap} readOnly={laps.length > 0} />
                    {formErrors.bestLap && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.bestLap}</span>}
                  </div>
                  <div className="field">
                    <label className="field-label">Avg Lap</label>
                    <LapTimeInput value={form.avgLap} onChange={v => set('avgLap', v)} placeholder="1:24.123" readOnly={laps.length > 0} />
                  </div>
                  <div className="field">
                    <label className="field-label">Worst Lap</label>
                    <LapTimeInput value={form.worstLap} onChange={v => set('worstLap', v)} placeholder="1:26.789" readOnly={laps.length > 0} />
                  </div>
                </div>
              </div>

              {/* ── Laps section ── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: laps.length > 0 ? 12 : 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>
                    Laps <span style={{ color: 'var(--gray)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— optional, paste lap-by-lap data from F1 25</span>
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={addLap}>
                    <Plus size={11} style={{ marginRight: 4 }} /> Add Lap
                  </button>
                </div>

                {laps.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['#', 'Lap Time', 'S1', 'S2', 'S3', 'Tires', 'Pen', ''].map(h => (
                            <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--gray-mid)', fontWeight: 400, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {laps.map((lap, i) => (
                          <LapRow
                            key={i}
                            index={i}
                            lap={lap}
                            onChange={(field, value) => updateLap(i, field, value)}
                            onRemove={() => removeLap(i)}
                            defaultTires={form.tires}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 10 }}>
              {saveError && (
                <div style={{ width: '100%', background: 'rgba(232,0,45,0.12)', border: '1px solid rgba(232,0,45,0.45)', borderRadius: 3, color: 'var(--red)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>{saveError}</span>
                  <button
                    type="button"
                    onClick={handleSave}
                    style={{ background: 'none', border: '1px solid rgba(232,0,45,0.5)', color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.06em', padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 2, flexShrink: 0 }}
                  >
                    Try Again
                  </button>
                </div>
              )}
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}
