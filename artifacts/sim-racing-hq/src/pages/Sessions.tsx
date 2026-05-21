import { useState, useMemo } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, Trash2 } from 'lucide-react';
import { useGetSessions, useCreateSession, useDeleteSession } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetSessionsQueryKey } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, TIRE_COMPOUNDS, SESSION_TYPES, CONDITIONS, ASSISTS } from '../data/f1Tracks';

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
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

const defaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  trackId: '',
  car: '',
  type: 'Practice',
  bestLap: '',
  avgLap: '',
  worstLap: '',
  s1: '',
  s2: '',
  s3: '',
  tires: 'Soft',
  fuelLoad: 50,
  conditions: 'Dry',
  assists: 'None',
  rating: 0,
  notes: '',
});

export default function Sessions() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useGetSessions();

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCar, setFilterCar] = useState('');

  const { mutate: createSession, isPending: saving } = useCreateSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
        setShowModal(false);
        setForm(defaultForm());
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
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
      },
    },
  });

  const trackName = (id: string) => {
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? t.short : id;
  };

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

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.trackId) errors.trackId = 'Please select a track';
    if (!form.car.trim()) errors.car = 'Please enter a car name';
    if (!form.bestLap.trim()) errors.bestLap = 'Please enter a best lap time';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaveError('');
    createSession({
      data: {
        id: crypto.randomUUID(),
        date: form.date,
        trackId: form.trackId,
        car: form.car,
        type: form.type,
        bestLap: form.bestLap,
        avgLap: form.avgLap,
        worstLap: form.worstLap,
        s1: form.s1,
        s2: form.s2,
        s3: form.s3,
        tires: form.tires,
        fuelLoad: Number(form.fuelLoad),
        conditions: form.conditions,
        assists: form.assists,
        rating: form.rating,
        notes: form.notes,
      },
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession({ id });
  };

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Session Log</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
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
        <input
          className="filter-input"
          placeholder="Search car..."
          value={filterCar}
          onChange={e => setFilterCar(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">Loading Sessions…</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Found</div>
            <div className="empty-state-desc">
              {sessions.length === 0
                ? 'Log your first session using the button above.'
                : 'No sessions match your current filters.'}
            </div>
          </div>
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
                <th>Type</th>
                <th>Tires</th>
                <th>Rating</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <>
                  <tr key={s.id} onClick={() => setExpanded(expanded === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                    <td>{trackName(s.trackId)}</td>
                    <td style={{ color: 'var(--white)', fontWeight: 600 }}>{s.car}</td>
                    <td>
                      <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                      {s.isPB && <span className="pb-badge">★ PB</span>}
                    </td>
                    <td><span className="lap-time" style={{ color: 'var(--gray-light)', fontSize: 12 }}>{s.avgLap || '—'}</span></td>
                    <td><span className="lap-time" style={{ color: 'var(--gray-mid)', fontSize: 12 }}>{s.worstLap || '—'}</span></td>
                    <td><span className={`badge ${TYPE_BADGE[s.type] || 'badge-practice'}`}>{s.type}</span></td>
                    <td style={{ color: 'var(--gray-mid)' }}>{s.tires}</td>
                    <td><RatingDots rating={s.rating} /></td>
                    <td>
                      {s.notes && <FileText size={13} style={{ color: 'var(--gray)', verticalAlign: 'middle' }} />}
                      {expanded === s.id ? <ChevronUp size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} /> : <ChevronDown size={13} style={{ color: 'var(--gray-mid)', marginLeft: 4 }} />}
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} className="expanded-row">
                      <td colSpan={10}>
                        <div className="expanded-content">
                          <div className="expanded-item">
                            <div className="expanded-label">Sector 1</div>
                            <div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s1 || '—'}</div>
                          </div>
                          <div className="expanded-item">
                            <div className="expanded-label">Sector 2</div>
                            <div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s2 || '—'}</div>
                          </div>
                          <div className="expanded-item">
                            <div className="expanded-label">Sector 3</div>
                            <div className="expanded-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.s3 || '—'}</div>
                          </div>
                          <div className="expanded-item">
                            <div className="expanded-label">Fuel Load</div>
                            <div className="expanded-value">{s.fuelLoad}%</div>
                          </div>
                          <div className="expanded-item">
                            <div className="expanded-label">Conditions</div>
                            <div className="expanded-value">{s.conditions}</div>
                          </div>
                          <div className="expanded-item">
                            <div className="expanded-label">Assists</div>
                            <div className="expanded-value">{s.assists}</div>
                          </div>
                          {s.notes && (
                            <div className="expanded-notes">
                              <div className="expanded-label" style={{ marginBottom: 6 }}>Notes</div>
                              {s.notes}
                            </div>
                          )}
                          <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', paddingTop: 4 }}>
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
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Session Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Log Session</span>
              <button className="modal-close" onClick={() => { setShowModal(false); setFormErrors({}); setSaveError(''); }}>×</button>
            </div>
            <div className="modal-body">
              {saveError && (
                <div style={{ background: 'rgba(232,0,45,0.12)', border: '1px solid rgba(232,0,45,0.4)', color: 'var(--red)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '10px 14px', marginBottom: 16 }}>
                  {saveError}
                </div>
              )}
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Date</label>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
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
                  <input type="text" placeholder="e.g. Ferrari SF-24" value={form.car} onChange={e => { set('car', e.target.value); setFormErrors(fe => ({ ...fe, car: '' })); }} style={formErrors.car ? { borderBottomColor: 'var(--red)' } : {}} />
                  {formErrors.car && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.car}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Session Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)}>
                    {SESSION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Best Lap Time <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input type="text" placeholder="1:23.456" value={form.bestLap} onChange={e => { set('bestLap', e.target.value); setFormErrors(fe => ({ ...fe, bestLap: '' })); }} style={formErrors.bestLap ? { borderBottomColor: 'var(--red)' } : {}} />
                  {formErrors.bestLap && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.bestLap}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Avg Lap Time</label>
                  <input type="text" placeholder="1:24.123" value={form.avgLap} onChange={e => set('avgLap', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Worst Lap Time</label>
                  <input type="text" placeholder="1:26.789" value={form.worstLap} onChange={e => set('worstLap', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Tire Compound</label>
                  <select value={form.tires} onChange={e => set('tires', e.target.value)}>
                    {TIRE_COMPOUNDS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Sector 1</label>
                  <input type="text" placeholder="24.123" value={form.s1} onChange={e => set('s1', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Sector 2</label>
                  <input type="text" placeholder="28.456" value={form.s2} onChange={e => set('s2', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Sector 3</label>
                  <input type="text" placeholder="28.877" value={form.s3} onChange={e => set('s3', e.target.value)} />
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
                  <label className="field-label">Assists</label>
                  <select value={form.assists} onChange={e => set('assists', e.target.value)}>
                    {ASSISTS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Rating</label>
                  <StarRating value={form.rating} onChange={v => set('rating', v)} />
                </div>
                <div className="field full">
                  <label className="field-label">Notes</label>
                  <textarea rows={3} placeholder="Session notes..." value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
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
