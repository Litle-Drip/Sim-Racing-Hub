import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, Trash2, Share2, X, Flag } from 'lucide-react';
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
import { F1_TRACKS, F1_25_CARS, TIRE_COMPOUNDS, SESSION_TYPES, CONDITIONS, TIME_OF_DAY, ASSISTS, PLATFORMS, INPUT_DEVICES, GAME_VERSIONS } from '../data/f1Tracks';
import { CarCombobox } from '../components/CarCombobox';
import { LapTimeInput } from '../components/LapTimeInput';
import { sessionConsistency } from '../lib/engagement';

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

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
  'Time Trial': 'badge-hotlap',
};

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

// ─── Lap table (expanded view) ────────────────────────────────────────────────

function LapTable({ laps }: { laps: SessionRecord['laps'] }) {
  if (!laps || laps.length === 0) return null;
  const fastestIdx = laps.reduce((best, l, i) => {
    return secsFromLap(l.time) < secsFromLap(laps[best].time) ? i : best;
  }, 0);

  return (
    <div style={{ width: '100%', overflowX: 'auto', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 8 }}>
        Lap Data
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Lap', 'Time', 'S1', 'S2', 'S3', 'Tires', 'Penalty'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--gray-mid)', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
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
              </tr>
            );
          })}
        </tbody>
      </table>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sessions() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useGetSessions();

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [laps, setLaps] = useState<FormLap[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ id: string; publicNote: string } | null>(null);

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
      return true;
    } catch { return false; }
  }, []);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  const { mutate: createSession, isPending: saving } = useCreateSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
        clearDraft();
        setShowModal(false);
        setForm(defaultForm());
        setLaps([]);
        setFormErrors({});
        setSaveError('');
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to save session. Please try again.';
        setSaveError(msg);
      },
    },
  });

  const { mutate: deleteSession } = useDeleteSession({
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

  const syncSummary = (lapList: FormLap[]) => {
    const validLaps = lapList.filter(l => l.time.trim() !== '');
    if (validLaps.length === 0) return;
    const computed = computeFromLaps(lapList);
    if (computed.bestLap) {
      setForm(f => ({
        ...f,
        bestLap: f.bestLap.trim() || computed.bestLap,
        avgLap: computed.avgLap,
        worstLap: f.worstLap.trim() || computed.worstLap,
      }));
    }
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

  const set = (k: string, v: string | number) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'bestLap' || k === 'worstLap') {
      next.avgLap = recalcAvg(next.bestLap, next.worstLap);
    }
    return next;
  });

  const filtered = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(s => {
        if (filterTrack && s.trackId !== filterTrack) return false;
        if (filterType && s.type !== filterType) return false;
        if (filterCar && !s.car.toLowerCase().includes(filterCar.toLowerCase())) return false;
        return true;
      });
  }, [sessions, filterTrack, filterType, filterCar]);

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

    createSession({
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
        conditions: form.timeOfDay ? `${form.conditions} · ${form.timeOfDay}` : form.conditions,
        assists: form.assists,
        rating: form.rating,
        notes: form.notes,
        penalty: form.penalty,
        gameVersion: form.gameVersion,
        platform: form.platform,
        inputDevice: form.inputDevice,
        position: form.type === 'Race' && form.position ? form.position : undefined,
        laps: laps.length > 0 ? laps.map((l, i) => ({
          lap: i + 1,
          time: l.time,
          s1: l.s1,
          s2: l.s2,
          s3: l.s3,
          tires: l.tires || form.tires,
          penalty: l.penalty,
        })) : undefined,
      },
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession({ id });
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
    setFormErrors({});
    setSaveError('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Session Log</h1>
        <button className="btn btn-primary" onClick={() => { const hadDraft = loadDraft(); if (!hadDraft) { setForm(defaultForm()); setLaps([]); } setShowModal(true); }}>
          <Plus size={12} /> Log Session
        </button>
      </div>

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
          <table className="data-table">
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
                <th>Rating</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <React.Fragment key={s.id}>
                  <tr onClick={() => setExpanded(expanded === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                    <td>{trackName(s.trackId)}</td>
                    <td style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                    <td>
                      <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                      {s.isPB && <span className="pb-badge">★ PB</span>}
                    </td>
                    <td><span className="lap-time" style={{ color: 'var(--gray-light)', fontSize: 12 }}>{s.avgLap || '—'}</span></td>
                    <td><span className="lap-time" style={{ color: 'var(--gray-mid)', fontSize: 12 }}>{s.worstLap || '—'}</span></td>
                    <td>{(() => { const c = sessionConsistency(s); return c !== null ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c >= 98 ? 'var(--teal)' : c >= 95 ? 'var(--white)' : 'var(--gray-mid)' }}>{c.toFixed(1)}%</span> : <span style={{ color: 'var(--gray)' }}>—</span>; })()}</td>
                    <td><span className={`badge ${TYPE_BADGE[s.type] || 'badge-practice'}`}>{s.type}</span></td>
                    <td style={{ color: 'var(--gray-mid)' }}>{s.tires}</td>
                    <td><RatingDots rating={s.rating} /></td>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {s.isPublic && <span title="Shared" style={{ color: 'var(--teal)', fontSize: 10, fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE</span>}
                      {s.laps && s.laps.length > 0 && <span style={{ color: 'var(--gray-mid)', fontSize: 10, fontFamily: 'var(--font-body)' }}>{s.laps.length}L</span>}
                      {s.notes && <FileText size={13} style={{ color: 'var(--gray)', verticalAlign: 'middle' }} />}
                      {expanded === s.id ? <ChevronUp size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} /> : <ChevronDown size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} />}
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} className="expanded-row">
                      <td colSpan={10}>
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
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)', width: '100%' }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', width: '100%' }}>Best Sectors (from laps)</div>
                                {bestS1 && <div className="expanded-item"><div className="expanded-label">S1</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS1}</div></div>}
                                {bestS2 && <div className="expanded-item"><div className="expanded-label">S2</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS2}</div></div>}
                                {bestS3 && <div className="expanded-item"><div className="expanded-label">S3</div><div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{bestS3}</div></div>}
                              </div>
                            );
                          })()}
                          <div className="expanded-item"><div className="expanded-label">Fuel Load</div><div className="expanded-value">{s.fuelLoad}%</div></div>
                          <div className="expanded-item"><div className="expanded-label">Conditions</div><div className="expanded-value">{s.conditions}</div></div>
                          <div className="expanded-item"><div className="expanded-label">Assists</div><div className="expanded-value">{s.assists}</div></div>
                          {s.penalty && <div className="expanded-item"><div className="expanded-label">Penalty</div><div className="expanded-value" style={{ color: 'var(--red)' }}>{s.penalty}</div></div>}
                          {s.notes && <div className="expanded-notes"><div className="expanded-label" style={{ marginBottom: 6 }}>Notes</div>{s.notes}</div>}

                          {/* Per-lap table */}
                          {s.laps && s.laps.length > 0 && (
                            <div style={{ width: '100%' }}>
                              <LapTable laps={s.laps} />
                            </div>
                          )}

                          <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', paddingTop: 4, display: 'flex', gap: 8 }}>
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
              {saveError && (
                <div style={{ background: 'rgba(232,0,45,0.12)', border: '1px solid rgba(232,0,45,0.4)', color: 'var(--red)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '10px 14px', marginBottom: 16 }}>
                  {saveError}
                </div>
              )}

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
                            <th key={h} style={{ padding: '4px 6px', textAlign: 'left', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--gray-mid)', fontWeight: 400, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
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

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
