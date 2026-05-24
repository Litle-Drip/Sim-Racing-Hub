import { useState, useMemo } from 'react';
import { Plus, Eye, Trash2, Share2, Lock } from 'lucide-react';
import { useGetSetups, useCreateSetup, useDeleteSetup, useShareSetup, getGetSetupsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SetupRecord } from '@workspace/api-client-react';
import { F1_TRACKS, SETUP_TAGS } from '../data/f1Tracks';
import { CarCombobox } from '../components/CarCombobox';

const defaultForm = (): Omit<SetupRecord, 'id'> => ({
  label: '',
  car: '',
  trackId: '',
  tag: 'Qualifying',
  date: new Date().toISOString().slice(0, 10),
  frontWing: '',
  rearWing: '',
  frontARB: '',
  rearARB: '',
  frontRideHeight: '',
  rearRideHeight: '',
  frontSprings: '',
  rearSprings: '',
  brakeBias: '',
  brakePressure: '',
  onThrottle: '',
  offThrottle: '',
  notes: '',
  gameVersion: '',
});

const COMPARE_FIELDS: { key: keyof SetupRecord; label: string }[] = [
  { key: 'label', label: 'Setup Label' },
  { key: 'car', label: 'Car' },
  { key: 'trackId', label: 'Track' },
  { key: 'tag', label: 'Tag' },
  { key: 'frontWing', label: 'Front Wing' },
  { key: 'rearWing', label: 'Rear Wing' },
  { key: 'frontARB', label: 'Front ARB' },
  { key: 'rearARB', label: 'Rear ARB' },
  { key: 'frontRideHeight', label: 'Front Ride Height' },
  { key: 'rearRideHeight', label: 'Rear Ride Height' },
  { key: 'frontSprings', label: 'Front Springs' },
  { key: 'rearSprings', label: 'Rear Springs' },
  { key: 'brakeBias', label: 'Brake Bias %' },
  { key: 'brakePressure', label: 'Brake Pressure %' },
  { key: 'onThrottle', label: 'On Throttle %' },
  { key: 'offThrottle', label: 'Off Throttle %' },
];

const TAG_BADGE: Record<string, string> = {
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Wet: 'badge-wet',
  Test: 'badge-practice',
  Sprint: 'badge-hotlap',
};

function SetupViewModal({
  setup,
  onClose,
  onShare,
}: {
  setup: SetupRecord;
  onClose: () => void;
  onShare: (id: string) => void;
}) {
  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short || id;
  const isPublic = (setup as any).isPublic as boolean | undefined;
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{setup.label}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <table className="data-table">
            <tbody>
              {COMPARE_FIELDS.map(({ key, label }) => (
                <tr key={key}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)', width: '40%' }}>{label}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--teal)' }}>
                    {key === 'trackId' ? trackName(String(setup[key])) : String(setup[key] ?? '—')}
                  </td>
                </tr>
              ))}
              {setup.notes && (
                <tr>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--gray-mid)', letterSpacing: '0.1em', textTransform: 'uppercase', verticalAlign: 'top', paddingTop: 14 }}>Notes</td>
                  <td style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>{setup.notes}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onShare(setup.id)}
            title={isPublic ? 'Unshare from Community' : 'Share to Community'}
          >
            {isPublic ? <Lock size={11} /> : <Share2 size={11} />}
            {isPublic ? 'Unshare' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompareView({ setups, onBack }: { setups: [SetupRecord, SetupRecord]; onBack: () => void }) {
  const [a, b] = setups;
  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short || id;
  const val = (s: SetupRecord, key: keyof SetupRecord) => key === 'trackId' ? trackName(String(s[key])) : String(s[key] ?? '');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Compare Setups</h1>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
      <div className="table-wrap">
        <table className="data-table compare-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th style={{ textAlign: 'right' }}>{a.label}</th>
              <th style={{ textAlign: 'right' }}>{b.label}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map(({ key, label }) => {
              const av = val(a, key);
              const bv = val(b, key);
              const diff = av !== bv;
              return (
                <tr key={key}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>{label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: diff ? 'var(--red)' : 'var(--teal)' }}>{av || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: diff ? 'var(--red)' : 'var(--teal)' }}>{bv || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Setups() {
  const qc = useQueryClient();
  const { data: setups = [], isLoading } = useGetSetups();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<SetupRecord, 'id'>>(defaultForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [viewSetup, setViewSetup] = useState<SetupRecord | null>(null);
  const [comparing, setComparing] = useState(false);

  const { mutate: createSetup, isPending: saving } = useCreateSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
        setShowModal(false);
        setForm(defaultForm());
        setFormErrors({});
        setSaveError('');
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to save setup. Please try again.';
        setSaveError(msg);
      },
    },
  });
  const { mutate: deleteSetup } = useDeleteSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
      },
    },
  });

  const { mutate: shareSetup } = useShareSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
      },
    },
  });

  const setField = (k: keyof Omit<SetupRecord, 'id'>, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const filtered = useMemo(() => setups.filter(s => {
    if (filterTrack && s.trackId !== filterTrack) return false;
    if (filterTag && s.tag !== filterTag) return false;
    return true;
  }), [setups, filterTrack, filterTag]);

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = 'Please enter a setup label';
    if (!form.car.trim()) errors.car = 'Please enter a car name';
    if (!form.trackId) errors.trackId = 'Please select a track';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaveError('');
    createSetup({
      data: {
        id: crypto.randomUUID(),
        label: form.label,
        car: form.car,
        trackId: form.trackId,
        tag: form.tag,
        date: form.date,
        frontWing: String(form.frontWing),
        rearWing: String(form.rearWing),
        frontARB: String(form.frontARB),
        rearARB: String(form.rearARB),
        frontRideHeight: String(form.frontRideHeight),
        rearRideHeight: String(form.rearRideHeight),
        frontSprings: String(form.frontSprings),
        rearSprings: String(form.rearSprings),
        brakeBias: String(form.brakeBias),
        brakePressure: String(form.brakePressure),
        onThrottle: String(form.onThrottle),
        offThrottle: String(form.offThrottle),
        notes: form.notes,
        gameVersion: form.gameVersion,
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteSetup({ id });
    setSelected(sel => sel.filter(s => s !== id));
  };

  const toggleSelect = (id: string) => {
    setSelected(sel => sel.includes(id) ? sel.filter(s => s !== id) : sel.length < 2 ? [...sel, id] : [sel[1], id]);
  };

  const trackName = (id: string) => {
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? `${t.flag} ${t.short}` : id;
  };

  const selectedSetups = useMemo(() => setups.filter(s => selected.includes(s.id)), [setups, selected]);

  if (comparing && selectedSetups.length === 2) {
    return <CompareView setups={[selectedSetups[0], selectedSetups[1]]} onBack={() => setComparing(false)} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Setup Vault</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={12} /> Add Setup
        </button>
      </div>

      {/* Compare bar */}
      {selected.length > 0 && (
        <div className="compare-bar">
          <span className="compare-bar-count">{selected.length}/2</span>
          <span className="compare-bar-text">setups selected</span>
          {selected.length === 2 && (
            <button className="btn btn-primary btn-sm" onClick={() => setComparing(true)}>Compare Selected</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <select className="filter-select" value={filterTrack} onChange={e => setFilterTrack(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
        </select>
        <select className="filter-select" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
          <option value="">All Tags</option>
          {SETUP_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Setup Grid */}
      {isLoading ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-title">Loading Setups…</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-title">No Setups Found</div>
            <div className="empty-state-desc">
              {setups.length === 0 ? 'Save your first setup using the button above.' : 'No setups match your current filters.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="setup-grid">
          {filtered.map(setup => (
            <div key={setup.id} className={`setup-card${selected.includes(setup.id) ? ' selected' : ''}`}>
              <div className="setup-card-checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(setup.id)}
                  onChange={() => toggleSelect(setup.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--red)', background: 'var(--bg-elevated)', border: 'none' }}
                />
              </div>
              <div className="setup-card-header">
                <div>
                  <div className="setup-card-title">{setup.label}</div>
                  <div className="setup-card-car">{setup.car}</div>
                </div>
                <span className={`badge ${TAG_BADGE[setup.tag] || 'badge-practice'}`}>{setup.tag}</span>
              </div>
              <div className="setup-card-body">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--gray-mid)', letterSpacing: '0.12em', marginBottom: 10 }}>
                  {trackName(setup.trackId)}
                </div>
                <div className="setup-preview-row">
                  {[
                    { label: 'Front Wing', value: setup.frontWing },
                    { label: 'Rear Wing', value: setup.rearWing },
                    { label: 'Brake Bias', value: setup.brakeBias ? `${setup.brakeBias}%` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="setup-preview-item">
                      <div className="setup-preview-label">{label}</div>
                      <div className="setup-preview-value">{value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="setup-card-actions">
                {(setup as any).isPublic && (
                  <span className="badge badge-community">Public</span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setViewSetup(setup)}>
                  <Eye size={11} /> View
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => shareSetup({ id: setup.id })}
                  title={(setup as any).isPublic ? 'Unshare from Community' : 'Share to Community'}
                >
                  {(setup as any).isPublic ? <Lock size={11} /> : <Share2 size={11} />}
                  {(setup as any).isPublic ? 'Unshare' : 'Share'}
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(setup.id)}>
                  <Trash2 size={11} /> Delete
                </button>
                <span className="setup-card-date">{setup.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {viewSetup && (
        <SetupViewModal
          setup={viewSetup}
          onClose={() => setViewSetup(null)}
          onShare={(id) => {
            shareSetup({ id });
            setViewSetup(prev => prev ? { ...prev, isPublic: !(prev as any).isPublic } as any : null);
          }}
        />
      )}

      {/* Add Setup Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Setup</span>
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
                  <label className="field-label">Setup Label <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input type="text" placeholder="Quali Trim Monza" value={form.label} onChange={e => { setField('label', e.target.value); setFormErrors(fe => ({ ...fe, label: '' })); }} style={formErrors.label ? { borderBottomColor: 'var(--red)' } : {}} />
                  {formErrors.label && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.label}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Car <span style={{ color: 'var(--red)' }}>*</span></label>
                  <CarCombobox value={form.car} onChange={v => { setField('car', v); setFormErrors(fe => ({ ...fe, car: '' })); }} error={!!formErrors.car} />
                  {formErrors.car && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.car}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Track <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select value={form.trackId} onChange={e => { setField('trackId', e.target.value); setFormErrors(fe => ({ ...fe, trackId: '' })); }} style={formErrors.trackId ? { borderBottomColor: 'var(--red)' } : {}}>
                    <option value="">Select Track</option>
                    {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
                  </select>
                  {formErrors.trackId && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.trackId}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Tag</label>
                  <select value={form.tag} onChange={e => setField('tag', e.target.value)}>
                    {SETUP_TAGS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-section-title">Aerodynamics</div>
                <div className="field">
                  <label className="field-label">Front Wing (0–50)</label>
                  <input type="number" min={0} max={50} value={form.frontWing} onChange={e => setField('frontWing', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Rear Wing (0–50)</label>
                  <input type="number" min={0} max={50} value={form.rearWing} onChange={e => setField('rearWing', e.target.value)} />
                </div>

                <div className="form-section-title">Suspension</div>
                <div className="field">
                  <label className="field-label">Front ARB (1–11)</label>
                  <input type="number" min={1} max={11} value={form.frontARB} onChange={e => setField('frontARB', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Rear ARB (1–11)</label>
                  <input type="number" min={1} max={11} value={form.rearARB} onChange={e => setField('rearARB', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Front Ride Height (mm)</label>
                  <input type="number" value={form.frontRideHeight} onChange={e => setField('frontRideHeight', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Rear Ride Height (mm)</label>
                  <input type="number" value={form.rearRideHeight} onChange={e => setField('rearRideHeight', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Front Springs</label>
                  <input type="number" value={form.frontSprings} onChange={e => setField('frontSprings', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Rear Springs</label>
                  <input type="number" value={form.rearSprings} onChange={e => setField('rearSprings', e.target.value)} />
                </div>

                <div className="form-section-title">Brakes</div>
                <div className="field">
                  <label className="field-label">Brake Bias %</label>
                  <input type="number" value={form.brakeBias} onChange={e => setField('brakeBias', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Brake Pressure %</label>
                  <input type="number" value={form.brakePressure} onChange={e => setField('brakePressure', e.target.value)} />
                </div>

                <div className="form-section-title">Differential</div>
                <div className="field">
                  <label className="field-label">On Throttle %</label>
                  <input type="number" value={form.onThrottle} onChange={e => setField('onThrottle', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Off Throttle %</label>
                  <input type="number" value={form.offThrottle} onChange={e => setField('offThrottle', e.target.value)} />
                </div>

                <div className="form-section-title">Metadata</div>
                <div className="field">
                  <label className="field-label">Game Version</label>
                  <input type="text" placeholder="e.g. F1 25 v1.2" value={form.gameVersion} onChange={e => setField('gameVersion', e.target.value)} />
                </div>

                <div className="field full">
                  <label className="field-label">Notes</label>
                  <textarea rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Setup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
