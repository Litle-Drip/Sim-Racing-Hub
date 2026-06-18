import { useState, useMemo } from 'react';
import { Plus, Cpu, Trash2, Eye } from 'lucide-react';
import { useGetHardware, useCreateHardware, useDeleteHardware, getGetHardwareQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { HardwareRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';

const PERIPHERAL_TYPES = ['Wheel Base', 'Pedals', 'Handbrake', 'Shifter', 'Button Box'];
const GAMES = ['F1 25', 'F1 24', 'F1 23', 'ACC', 'iRacing', 'rFactor 2', 'AMS2', 'Gran Turismo 7', 'Other'];

const PERIPHERAL_COLORS: Record<string, string> = {
  'Wheel Base': 'var(--red)',
  'Pedals': 'var(--teal)',
  'Handbrake': 'var(--yellow)',
  'Shifter': 'var(--green)',
  'Button Box': 'var(--purple)',
};

const PERIPHERAL_BADGE: Record<string, string> = {
  'Wheel Base': 'badge-race',
  'Pedals': 'badge-practice',
  'Handbrake': 'badge-qualifying',
  'Shifter': 'badge-hotlap',
  'Button Box': 'badge-wet',
};

const FFB_FIELDS: { key: keyof HardwareRecord; label: string; unit?: string }[] = [
  { key: 'ffbStrength', label: 'FFB Strength', unit: '%' },
  { key: 'maxForce', label: 'Max Force', unit: 'Nm' },
  { key: 'damper', label: 'Damper', unit: '%' },
  { key: 'friction', label: 'Friction', unit: '%' },
  { key: 'linearity', label: 'Linearity', unit: '%' },
  { key: 'steeringRange', label: 'Steering Range', unit: '°' },
];

function defaultForm(): Omit<HardwareRecord, 'id'> {
  return {
    label: '',
    peripheralType: 'Wheel Base',
    brand: '',
    model: '',
    trackId: '',
    game: '',
    date: new Date().toISOString().slice(0, 10),
    ffbStrength: '',
    maxForce: '',
    damper: '',
    friction: '',
    linearity: '',
    steeringRange: '',
    notes: '',
  };
}

function HardwareDetailModal({ profile, onClose }: { profile: HardwareRecord; onClose: () => void }) {
  const trackName = (id: string) => id ? (F1_TRACKS.find(t => t.id === id)?.short || id) : '—';
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{profile.label}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <table className="data-table">
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)', width: '40%' }}>Type</td>
                <td>
                  <span className={`badge ${PERIPHERAL_BADGE[profile.peripheralType] || 'badge-practice'}`}>{profile.peripheralType}</span>
                </td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Hardware</td>
                <td style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--white)' }}>{[profile.brand, profile.model].filter(Boolean).join(' ') || '—'}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Track</td>
                <td style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-light)' }}>{trackName(profile.trackId)}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Game</td>
                <td style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-light)' }}>{profile.game || '—'}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Date</td>
                <td style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-light)' }}>{profile.date}</td>
              </tr>
              {FFB_FIELDS.map(({ key, label, unit }) => (
                <tr key={key}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>{label}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--teal)' }}>
                    {profile[key] ? `${profile[key]}${unit || ''}` : '—'}
                  </td>
                </tr>
              ))}
              {profile.notes && (
                <tr>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--gray-mid)', letterSpacing: '0.1em', textTransform: 'uppercase', verticalAlign: 'top', paddingTop: 14 }}>Notes</td>
                  <td style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>{profile.notes}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function HardwareVault() {
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = useGetHardware();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<HardwareRecord, 'id'>>(defaultForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [viewProfile, setViewProfile] = useState<HardwareRecord | null>(null);

  const { mutate: createHardware, isPending: saving } = useCreateHardware({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHardwareQueryKey() });
        setShowModal(false);
        setForm(defaultForm());
        setFormErrors({});
        setSaveError('');
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
        setSaveError(msg);
      },
    },
  });

  const { mutate: deleteHardware } = useDeleteHardware({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHardwareQueryKey() });
      },
    },
  });

  const setField = (k: keyof Omit<HardwareRecord, 'id'>, v: string) => setForm(f => ({ ...f, [k]: v }));

  const filtered = useMemo(() => profiles.filter(p => {
    if (filterType && p.peripheralType !== filterType) return false;
    if (filterTrack && p.trackId !== filterTrack) return false;
    return true;
  }), [profiles, filterType, filterTrack]);

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = 'Please enter a profile label';
    if (!form.peripheralType) errors.peripheralType = 'Please select a peripheral type';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaveError('');
    createHardware({
      data: {
        id: crypto.randomUUID(),
        ...form,
      },
    });
  };

  const trackName = (id: string) => {
    if (!id) return 'All Tracks';
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? `${t.flag} ${t.short}` : id;
  };

  const isWheelBase = form.peripheralType === 'Wheel Base';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Hardware Vault</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={12} /> Add Profile
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Peripherals</option>
          {PERIPHERAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filterTrack} onChange={e => setFilterTrack(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
        </select>
      </div>

      {/* Hardware Grid */}
      {isLoading ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-title">Loading Profiles…</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <Cpu size={36} style={{ color: 'var(--border-accent)', marginBottom: 16 }} />
            <div className="empty-state-title">No Hardware Profiles</div>
            <div className="empty-state-desc">
              {profiles.length === 0
                ? 'Track your wheel, pedals, and FFB settings. Tap "New Profile" above to save your first hardware config.'
                : 'No profiles match your current filters. Try adjusting or clearing them.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="hw-grid">
          {filtered.map(profile => (
            <div key={profile.id} className="hw-card">
              <div className="hw-card-header">
                <div className="hw-card-left">
                  <span className={`badge ${PERIPHERAL_BADGE[profile.peripheralType] || 'badge-practice'}`}>
                    {profile.peripheralType}
                  </span>
                  <div className="hw-card-title">{profile.label}</div>
                  <div className="hw-card-device">
                    {[profile.brand, profile.model].filter(Boolean).join(' ') || <span style={{ color: 'var(--gray)' }}>No device specified</span>}
                  </div>
                </div>
                <div className="hw-card-meta">
                  <div className="hw-card-track">{trackName(profile.trackId)}</div>
                  {profile.game && <div className="hw-card-game">{profile.game}</div>}
                  <div className="hw-card-date">{profile.date}</div>
                </div>
              </div>

              <div className="hw-params">
                {FFB_FIELDS.filter(f => profile[f.key]).map(({ key, label, unit }) => (
                  <div key={key} className="hw-param-item">
                    <div className="hw-param-label">{label}</div>
                    <div className="hw-param-value">{profile[key]}{unit}</div>
                  </div>
                ))}
              </div>

              {profile.notes && (
                <div className="hw-notes">{profile.notes}</div>
              )}

              <div className="hw-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setViewProfile(profile)}>
                  <Eye size={11} /> View
                </button>
                <button className="btn btn-danger" onClick={() => deleteHardware({ id: profile.id })}>
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewProfile && (
        <HardwareDetailModal profile={viewProfile} onClose={() => setViewProfile(null)} />
      )}

      {/* Add Profile Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setFormErrors({}); setSaveError(''); } }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Hardware Profile</span>
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
                  <label className="field-label">Profile Label <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="Monza Quali FFB"
                    value={form.label}
                    onChange={e => { setField('label', e.target.value); setFormErrors(fe => ({ ...fe, label: '' })); }}
                    style={formErrors.label ? { borderBottomColor: 'var(--red)' } : {}}
                  />
                  {formErrors.label && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-body)' }}>{formErrors.label}</span>}
                </div>

                <div className="field">
                  <label className="field-label">Peripheral Type <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select
                    value={form.peripheralType}
                    onChange={e => setField('peripheralType', e.target.value)}
                  >
                    {PERIPHERAL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">Brand</label>
                  <input type="text" placeholder="Fanatec, Moza, Thrustmaster…" value={form.brand} onChange={e => setField('brand', e.target.value)} />
                </div>

                <div className="field">
                  <label className="field-label">Model</label>
                  <input type="text" placeholder="DD Pro, R9, T300…" value={form.model} onChange={e => setField('model', e.target.value)} />
                </div>

                <div className="field">
                  <label className="field-label">Track</label>
                  <select value={form.trackId} onChange={e => setField('trackId', e.target.value)}>
                    <option value="">No specific track</option>
                    {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">Game</label>
                  <select value={form.game} onChange={e => setField('game', e.target.value)}>
                    <option value="">Select game</option>
                    {GAMES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">Date</label>
                  <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
                </div>

                {isWheelBase && (
                  <>
                    <div className="form-section-title">Force Feedback</div>
                    <div className="field">
                      <label className="field-label">FFB Strength (%)</label>
                      <input type="number" min={0} max={100} placeholder="65" value={form.ffbStrength} onChange={e => setField('ffbStrength', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Max Force (Nm)</label>
                      <input type="number" min={0} placeholder="8" value={form.maxForce} onChange={e => setField('maxForce', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Damper (%)</label>
                      <input type="number" min={0} max={100} placeholder="0" value={form.damper} onChange={e => setField('damper', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Friction (%)</label>
                      <input type="number" min={0} max={100} placeholder="0" value={form.friction} onChange={e => setField('friction', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Linearity (%)</label>
                      <input type="number" min={0} max={100} placeholder="50" value={form.linearity} onChange={e => setField('linearity', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Steering Range (°)</label>
                      <input type="number" min={90} max={1080} placeholder="360" value={form.steeringRange} onChange={e => setField('steeringRange', e.target.value)} />
                    </div>
                  </>
                )}

                <div className="field full">
                  <label className="field-label">Notes</label>
                  <textarea rows={3} placeholder="Any specific observations or tweaks…" value={form.notes} onChange={e => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setFormErrors({}); setSaveError(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
