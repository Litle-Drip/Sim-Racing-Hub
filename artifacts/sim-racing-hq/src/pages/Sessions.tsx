import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, Trash2, Share2, X, Flag, AlertTriangle, Timer, Trophy, CheckCircle2, Map } from 'lucide-react';
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
import { F1_TRACKS, TIRE_COMPOUNDS, SESSION_TYPES, CONDITIONS, TIME_OF_DAY, ASSISTS, PLATFORMS, INPUT_DEVICES, GAME_VERSIONS, getTypeBadgeClass } from '../data/f1Tracks';
import { CarCombobox } from '../components/CarCombobox';
import { LapTimeInput } from '../components/LapTimeInput';
import { sessionConsistency, isDailyChallengeSession, PENDING_CHALLENGE_KEY } from '../lib/engagement';
import { findDataIssues } from '../lib/dataCleanup';
import {
  secsFromLap,
  validLaps,
  LapTelemetryModal,
  SessionDetailFields,
  type LapEntry,
} from '../components/SessionDetail';
import { FOCUS_SESSION_KEY, OPEN_LOG_KEY, takeFocusTrack } from '../lib/storage';
import { useUnseenSessions } from '../lib/newSessions';

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
  if (!rating) return <span style={{ color: 'var(--gray-mid)' }}>&mdash;</span>;
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
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
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

function SessionStatCard({ label, value, valueColor = 'var(--white)', icon }: { label: string; value: string; valueColor?: string; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      {/* Same icon treatment as the dashboard's stat cards — this row carried
          an 80px watermark bleeding off the bottom-right corner instead. */}
      <span className="stat-icon">{icon}</span>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: valueColor }}>{value}</div>
    </div>
  );
}

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

  const statBestLap = useMemo(() => {
    const withLap = sessions.filter(s => s.bestLap && s.bestLap.trim() !== '');
    if (withLap.length === 0) return null;
    return withLap.reduce((best, s) => secsFromLap(s.bestLap) < secsFromLap(best.bestLap) ? s : best);
  }, [sessions]);

  const statAvgConsistency = useMemo(() => {
    const vals = sessions.map(s => sessionConsistency(s)).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [sessions]);

  const statTracksCovered = useMemo(
    () => new Set(sessions.map(s => s.trackId).filter(id => F1_TRACKS.some(t => t.id === id))).size,
    [sessions]
  );

  // Sessions that landed since the driver last looked glow until opened.
  const { isNew, newCount, markSeen, markAllSeen } = useUnseenSessions(sessions);

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [laps, setLaps] = useState<FormLap[]>([]);
  const [lockedSummary, setLockedSummary] = useState<Set<string>>(new Set());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  // Pre-filtered when arrived at from a track page's "Sessions" quick-link.
  const [filterTrack, setFilterTrack] = useState(() => takeFocusTrack());
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ id: string; publicNote: string } | null>(null);
  const [telemetryLap, setTelemetryLap] = useState<{ sessionId: string; lap: LapEntry } | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [toast, setToast] = useState('');
  // Everything past track/car/best-lap is collapsed by default. Logging a lap
  // needs three answers; the other seventeen fields are for the minority of
  // sessions that want them.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Daily Challenge hand-off from Dashboard ────────────────────────────
  // Dashboard's "Start Challenge" button stashes the challenge's track/car
  // here before navigating over, since page switches don't carry props.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(PENDING_CHALLENGE_KEY); } catch { /* ignore */ }
    if (!raw) return;
    try { sessionStorage.removeItem(PENDING_CHALLENGE_KEY); } catch { /* ignore */ }
    try {
      const challenge = JSON.parse(raw) as { trackId: string; car: string };
      setForm({ ...defaultForm(), trackId: challenge.trackId, car: challenge.car, type: 'Hotlap' });
      setLaps([]);
      setLockedSummary(new Set());
      setFormErrors({});
      setShowModal(true);
    } catch { /* ignore malformed payload */ }
    // Runs once on mount — this is a one-shot hand-off, not a live subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── /log deep link ─────────────────────────────────────────────────────
  // The old Quick Log screen is gone; /log now opens this page's log form.
  useEffect(() => {
    let flag: string | null = null;
    try { flag = sessionStorage.getItem(OPEN_LOG_KEY); } catch { /* ignore */ }
    if (!flag) return;
    try { sessionStorage.removeItem(OPEN_LOG_KEY); } catch { /* ignore */ }
    setShowModal(true);
    // One-shot hand-off, same as the challenge hand-off above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setToast('Session saved');
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
      // Only derive avgLap from best/worst when the user hasn't already
      // typed their own average — otherwise a later best/worst edit would
      // silently discard a manually-entered average with no indication.
      if ((k === 'bestLap' || k === 'worstLap') && !lockedSummary.has('avgLap')) {
        next.avgLap = recalcAvg(next.bestLap, next.worstLap);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .filter(s => !filterTrack || s.trackId === filterTrack);
  }, [sessions, filterTrack]);

  const mostRecentId = useMemo(() => {
    if (sessions.length === 0) return null;
    return [...sessions].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0].id;
  }, [sessions]);

  // Jump-to-session handoff from other pages (e.g. Tracks' PB tile) — clear
  // any active filters so the target session is guaranteed visible, expand
  // its row, and scroll it into view.
  useEffect(() => {
    const focusId = sessionStorage.getItem(FOCUS_SESSION_KEY);
    if (!focusId || sessions.length === 0) return;
    sessionStorage.removeItem(FOCUS_SESSION_KEY);
    if (!sessions.some(s => s.id === focusId)) return;
    setFilterTrack('');
    setExpanded(focusId);
    setTimeout(() => {
      document.getElementById(`session-row-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
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
      setToast('Session saved');
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
    setShowAdvanced(false);
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
          <button className="btn btn-primary" onClick={() => { const hadDraft = loadDraft(); if (!hadDraft) { setForm(defaultForm()); setLaps([]); } setShowAdvanced(hadDraft); setShowModal(true); }}>
            <Plus size={12} /> Log Session
          </button>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="stat-grid">
          <SessionStatCard
            label="Total Sessions"
            value={String(sessions.length)}
            icon={<Timer size={20} />}
          />
          <SessionStatCard
            label={statBestLap ? `Best Lap (${F1_TRACKS.find(t => t.id === statBestLap.trackId)?.short ?? statBestLap.trackId})` : 'Best Lap'}
            value={statBestLap?.bestLap || '—'}
            valueColor="var(--teal)"
            icon={<Trophy size={20} />}
          />
          <SessionStatCard
            label="Avg Consistency"
            value={statAvgConsistency !== null ? `${statAvgConsistency.toFixed(1)}%` : '—'}
            icon={<CheckCircle2 size={20} />}
          />
          <SessionStatCard
            label="Tracks Covered"
            value={`${statTracksCovered}/${F1_TRACKS.length}`}
            icon={<Map size={20} />}
          />
        </div>
      )}

      {isGuest && (
        <div className="notice notice--teal">
          <div className="notice-text" style={{ color: 'var(--gray-light)' }}>
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Saved in this browser only.</span> Sessions will persist across refreshes on this device. Create a free account to sync across all your devices.
          </div>
          <div className="notice-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent('guestSignIn'))}>
              Create Account
            </button>
          </div>
        </div>
      )}

      {/* Sessions that arrived while the driver was elsewhere. The rows glow on
          their own; this is the way out when several land at once. */}
      {newCount > 0 && (
        <div className="notice notice--teal">
          <span className="session-new-dot" />
          <span className="notice-text" style={{ color: 'var(--gray-light)' }}>
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{newCount} new session{newCount === 1 ? '' : 's'}</span> since you last looked — open one to clear it.
          </span>
          <div className="notice-actions">
            <button className="btn btn-secondary btn-sm" onClick={markAllSeen}>
              Mark All Read
            </button>
          </div>
        </div>
      )}

      {/* One filter. Track is the only axis anyone actually narrows a session
          list by — type, car and conditions each had their own dropdown for a
          list most drivers scroll rather than query. */}
      <div className="filter-bar">
        <select className="filter-select" value={filterTrack} onChange={e => setFilterTrack(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
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
          <table className="data-table sessions-table data-table--stack">
            {/* Six columns, not twelve. Avg/worst lap, consistency, tyres,
                conditions and rating all live one click away in the expanded
                row — they were never what you scan a session list for. */}
            <thead>
              <tr>
                <th>Date</th>
                <th>Track</th>
                <th>Car</th>
                <th>Best Lap</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <React.Fragment key={s.id}>
                  <tr
                    id={`session-row-${s.id}`}
                    className={isNew(s.id) ? 'session-row--new' : undefined}
                    onClick={() => { markSeen(s.id); setExpanded(expanded === s.id ? null : s.id); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td data-label="Date" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {s.date}
                      {s.createdAt && <div style={{ color: 'var(--gray-mid)', fontSize: 'var(--fs-label)', marginTop: 'var(--space-1)' }}>{localTimeStr(s.createdAt)}</div>}
                    </td>
                    <td data-label="Track">
                      {trackName(s.trackId)}
                      {isDailyChallengeSession(s) && (
                        <span
                          title="Completed the Daily Challenge for this date"
                          style={{ marginLeft: 'var(--space-2)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', color: 'var(--teal)', border: '1px solid rgba(0,210,190,0.4)', borderRadius: 'var(--radius)', padding: '1px 5px', textTransform: 'uppercase' }}
                        >
                          Challenge
                        </span>
                      )}
                    </td>
                    <td data-label="Car" style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                    <td data-label="Best Lap">
                      <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                      {s.isPB && <span className="pb-badge">★ PB</span>}
                    </td>
                    <td data-label="Type"><span className={`badge ${getTypeBadgeClass(s.type)}`}>{s.type}</span></td>
                    <td data-label="">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', whiteSpace: 'nowrap' }}>
                        {/* NEW now means "you haven't opened this yet" rather
                            than "most recent" — it clears on click, alongside
                            the row glow. */}
                        {isNew(s.id) ? (
                          <span title="Landed since you last looked — click to open" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--teal)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>
                            <span className="session-new-dot" />NEW
                          </span>
                        ) : s.id === mostRecentId && (
                          <span title="Most recently logged session" style={{ color: 'var(--red)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>LATEST</span>
                        )}
                        {s.isPublic && <span title="Shared" style={{ color: 'var(--teal)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE</span>}
                        {validLaps(s.laps).length > 0 && <span style={{ color: 'var(--gray-mid)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font-body)' }}>{validLaps(s.laps).length}L</span>}
                        {s.notes && <FileText size={13} style={{ color: 'var(--gray)', verticalAlign: 'middle' }} />}
                        {expanded === s.id ? <ChevronUp size={13} style={{ color: 'var(--gray-mid)' }} /> : <ChevronDown size={13} style={{ color: 'var(--gray-mid)' }} />}
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} className="expanded-row">
                      <td colSpan={6}>
                        <div className="expanded-content">
                          {/* Lap summary — these came out of the table's columns
                              so the list stays scannable. */}
                          <div className="expanded-item"><div className="expanded-label">Avg Lap</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)' }}>{s.avgLap || '—'}</div></div>
                          <div className="expanded-item"><div className="expanded-label">Worst Lap</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)' }}>{s.worstLap || '—'}</div></div>
                          <div className="expanded-item">
                            <div className="expanded-label">Consistency</div>
                            <div className="expanded-value" style={{ fontFamily: 'var(--font-mono)' }}>
                              {(() => { const c = sessionConsistency(s); return c !== null ? `${c.toFixed(1)}%` : '—'; })()}
                            </div>
                          </div>
                          {s.tires && <div className="expanded-item"><div className="expanded-label">Tires</div><div className="expanded-value">{s.tires}</div></div>}
                          {s.rating > 0 && <div className="expanded-item"><div className="expanded-label">Rating</div><div className="expanded-value"><RatingDots rating={s.rating} /></div></div>}

                          <SessionDetailFields session={s} onViewTelemetry={(sessionId, lap) => setTelemetryLap({ sessionId, lap })} />

                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
                            {!isGuest && (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: s.isPublic ? 'var(--teal)' : 'var(--gray-mid)', borderColor: s.isPublic ? 'var(--teal)' : 'var(--gray)' }}
                                onClick={(e) => handleShare(s, e)}
                                disabled={sharingId === s.id}
                                title={s.isPublic ? 'Remove from Community' : 'Share to Community'}
                              >
                                <Share2 size={11} style={{ marginRight: 4 }} />
                                {sharingId === s.id ? '…' : s.isPublic ? 'Shared' : 'Share'}
                              </button>
                            )}
                            <button
                              className="btn btn-danger"
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
        <LapTelemetryModal sessionId={telemetryLap.sessionId} lap={telemetryLap.lap} onClose={() => setTelemetryLap(null)} />
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
              {/* ── The three answers a logged lap actually needs ── */}
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Track <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select autoFocus value={form.trackId} onChange={e => { set('trackId', e.target.value); setFormErrors(fe => ({ ...fe, trackId: '' })); }} style={formErrors.trackId ? { borderBottomColor: 'var(--red)' } : {}}>
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
                  <label className="field-label">Best Lap {laps.length === 0 && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                  <LapTimeInput value={form.bestLap} onChange={v => { set('bestLap', v); setFormErrors(fe => ({ ...fe, bestLap: '' })); }} error={!!formErrors.bestLap} readOnly={laps.length > 0} />
                  {formErrors.bestLap && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.bestLap}</span>}
                  {laps.length > 0 && <span style={{ color: 'var(--teal)', fontSize: 11, fontFamily: 'var(--font-body)' }}>Auto-computed from laps</span>}
                </div>
              </div>

              {/* ── Everything else ── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  aria-expanded={showAdvanced}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--gray-mid)',
                  }}
                >
                  {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Advanced
                  <span style={{ color: 'var(--gray)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    — date, conditions, setup, sectors, lap-by-lap
                  </span>
                </button>

                {showAdvanced && (
                  <>
                    <div className="form-grid" style={{ marginTop: 16 }}>
                      <div className="field">
                        <label className="field-label">Date</label>
                        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
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
                      <div className="field">
                        <label className="field-label">Avg Lap</label>
                        <LapTimeInput value={form.avgLap} onChange={v => set('avgLap', v)} placeholder="1:24.123" readOnly={laps.length > 0} />
                      </div>
                      <div className="field">
                        <label className="field-label">Worst Lap</label>
                        <LapTimeInput value={form.worstLap} onChange={v => set('worstLap', v)} placeholder="1:26.789" readOnly={laps.length > 0} />
                      </div>
                      <div className="field full">
                        <label className="field-label">Notes</label>
                        <textarea rows={2} placeholder="Session notes..." value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
                      </div>
                    </div>

                    {/* ── Laps ── */}
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: laps.length > 0 ? 12 : 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>
                          Laps <span style={{ color: 'var(--gray)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— paste lap-by-lap data from F1 25</span>
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
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              {saveError && (
                <div className="notice notice--error" style={{ width: '100%', marginBottom: 0 }}>
                  <span className="notice-text">{saveError}</span>
                  <div className="notice-actions">
                    <button type="button" className="btn btn-danger" onClick={handleSave}>
                      Try Again
                    </button>
                  </div>
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
