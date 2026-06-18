import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp, Play, ThumbsUp } from 'lucide-react';
import { F1_TRACKS, F1Track, CORNER_NAMES } from '../data/f1Tracks';
import { useGetSessions, useGetTrackNotes, useUpsertTrackNotes, getGetTrackNotesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CornerNote, SessionRecord } from '@workspace/api-client-react';
import { lapToSeconds } from '../lib/storage';
import { trackConsistency, TYRE_GUIDES } from '../lib/engagement';
import { CIRCUIT_SCHOOL } from '../data/circuitSchool';

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

function TrackGrid({ onSelect, sessions }: { onSelect: (t: F1Track) => void; sessions: SessionRecord[] }) {
  const allSessions = sessions;
  const countByTrack: Record<string, number> = {};
  allSessions.forEach(s => { countByTrack[s.trackId] = (countByTrack[s.trackId] || 0) + 1; });

  const pbByTrack: Record<string, string> = {};
  allSessions.forEach(s => {
    if (!s.bestLap || s.bestLap.trim() === '') return;
    const cur = pbByTrack[s.trackId];
    if (!cur || lapToSeconds(s.bestLap) < lapToSeconds(cur)) {
      pbByTrack[s.trackId] = s.bestLap;
    }
  });

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 28 }}>Track Bible</h1>
      <div className="track-grid">
        {F1_TRACKS.map(track => {
          const count = countByTrack[track.id] || 0;
          const pb = pbByTrack[track.id];
          const diff = parseInt(localStorage.getItem(`difficulty_${track.id}`) || '0', 10);
          return (
            <div key={track.id} className={`track-card${pb ? ' has-pb' : ''}`} onClick={() => onSelect(track)}>
              {count > 0 && (
                <div className="track-card-sessions">{count} session{count !== 1 ? 's' : ''}</div>
              )}
              <div className="track-card-flag">{track.flag}</div>
              <div className="track-card-name">{track.short}</div>
              <div className="track-card-country">{track.country}</div>
              {pb ? (
                <div className="track-card-pb">{pb}</div>
              ) : (
                <div className="track-card-pb no-time">No Time</div>
              )}
              {diff > 0 && (
                <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                  {[1,2,3,4,5].map(i => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= diff ? 'var(--red)' : 'var(--border)', opacity: i <= diff ? (0.4 + i * 0.15) : 0.3 }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditableCell({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  useEffect(() => { setVal(value); }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        className="corner-input"
        value={val}
        placeholder={placeholder}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onSave(val); }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(val); } }}
        style={{
          background: 'var(--bg-elevated)',
          border: 'none',
          borderBottom: '1px solid var(--red)',
          color: 'var(--white)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          padding: '4px 6px',
          width: '100%',
          outline: 'none',
        }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        cursor: 'text',
        display: 'block',
        padding: '4px 6px',
        minHeight: 24,
        color: val ? 'var(--white)' : 'var(--gray-mid)',
        fontFamily: 'var(--font-body)',
        fontSize: val ? 13 : 11,
        opacity: val ? 1 : 0.4,
      }}
    >
      {val || '—'}
    </span>
  );
}

function DifficultyRating({ trackId }: { trackId: string }) {
  const key = `difficulty_${trackId}`;
  const [rating, setRating] = useState(() => {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) : 0;
  });
  const [hover, setHover] = useState(0);

  const handleClick = (v: number) => {
    const next = v === rating ? 0 : v;
    setRating(next);
    if (next) localStorage.setItem(key, String(next));
    else localStorage.removeItem(key);
  };

  const labels = ['', 'Easy', 'Moderate', 'Tricky', 'Hard', 'Brutal'];
  const display = hover || rating;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Difficulty</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handleClick(i)}
            style={{
              cursor: 'pointer',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: i <= display ? 'var(--red)' : 'var(--border)',
              opacity: i <= display ? (0.4 + (i * 0.15)) : 0.5,
              transition: 'background 0.15s, opacity 0.15s',
            }}
          />
        ))}
      </div>
      {display > 0 && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray-mid)' }}>{labels[display]}</span>
      )}
    </div>
  );
}

function TrackDetail({
  track,
  onBack,
  sessions,
}: {
  track: F1Track;
  onBack: () => void;
  sessions: SessionRecord[];
}) {
  const qc = useQueryClient();
  const allSessions = sessions;
  const trackSessions = allSessions.filter(s => s.trackId === track.id);

  const { data: trackNotesData } = useGetTrackNotes(track.id);
  const [savedFlash, setSavedFlash] = useState(false);
  const { mutate: upsertTrackNotes, isPending: isSaving, isError: hasSaveError, reset: resetSave } = useUpsertTrackNotes({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetTrackNotesQueryKey(track.id) });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1800);
      },
      onError: () => { setSavedFlash(false); },
    },
  });

  const [notesId] = useState(() => crypto.randomUUID());
  const [corners, setCorners] = useState<CornerNote[]>(() => {
    const names = CORNER_NAMES[track.id] || [];
    return Array.from({ length: track.corners }, (_, i) => ({
      id: crypto.randomUUID(),
      number: i + 1,
      name: names[i] || '',
      gear: '',
      brakingPoint: '',
      lineNotes: '',
      myNotes: '',
    }));
  });

  useEffect(() => {
    if (trackNotesData) {
      setCorners(trackNotesData.corners as CornerNote[]);
    }
  }, [trackNotesData]);

  const saveCorners = useCallback((updatedCorners: CornerNote[]) => {
    const id = trackNotesData?.id ?? notesId;
    upsertTrackNotes({
      trackId: track.id,
      data: { id, corners: updatedCorners },
    });
  }, [trackNotesData, notesId, track.id, upsertTrackNotes]);

  const saveCorner = useCallback((id: string, field: keyof CornerNote, value: string) => {
    setCorners(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, [field]: value } : c);
      saveCorners(updated);
      return updated;
    });
  }, [saveCorners]);

  const addCorner = () => {
    setCorners(prev => {
      const newCorner: CornerNote = {
        id: crypto.randomUUID(),
        number: prev.length + 1,
        name: '',
        gear: '',
        brakingPoint: '',
        lineNotes: '',
        myNotes: '',
      };
      const updated = [...prev, newCorner];
      saveCorners(updated);
      return updated;
    });
  };

  const deleteCorner = (id: string) => {
    setCorners(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveCorners(updated);
      return updated;
    });
  };

  const pbSession = trackSessions.reduce<SessionRecord | null>((best, s) => {
    if (!s.bestLap || s.bestLap.trim() === '') return best;
    if (!best || lapToSeconds(s.bestLap) < lapToSeconds(best.bestLap)) return s;
    return best;
  }, null);
  const bestLap = pbSession?.bestLap || '';
  const pbCar = pbSession?.car || '';
  const bestS1 = trackSessions.reduce((best, s) => (!s.s1 || s.s1.trim() === '') ? best : (!best || parseFloat(s.s1) < parseFloat(best)) ? s.s1 : best, '');
  const bestS2 = trackSessions.reduce((best, s) => (!s.s2 || s.s2.trim() === '') ? best : (!best || parseFloat(s.s2) < parseFloat(best)) ? s.s2 : best, '');
  const bestS3 = trackSessions.reduce((best, s) => (!s.s3 || s.s3.trim() === '') ? best : (!best || parseFloat(s.s3) < parseFloat(best)) ? s.s3 : best, '');
  const lastDriven = trackSessions.length > 0 ? [...trackSessions].sort((a,b) => b.date.localeCompare(a.date))[0].date : '';
  const consistency = trackConsistency(sessions, track.id);
  const tyreGuide = TYRE_GUIDES[track.id];

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={12} /> Back to Tracks
      </button>

      <div className="track-detail-header">
        <div className="track-detail-flag">{track.flag}</div>
        <div className="track-detail-info">
          <h1>{track.name}</h1>
          <p>{track.country} · {trackSessions.length} session{trackSessions.length !== 1 ? 's' : ''}</p>
          <DifficultyRating trackId={track.id} />
        </div>
      </div>

      <div className="track-stats-row">
        {[
          { label: 'PB Time', value: bestLap || '—', mono: true, sub: pbCar },
          { label: 'Best S1', value: bestS1 || '—', mono: true },
          { label: 'Best S2', value: bestS2 || '—', mono: true },
          { label: 'Best S3', value: bestS3 || '—', mono: true },
          { label: 'Consistency', value: consistency !== null ? `${consistency.toFixed(1)}%` : '—', mono: true },
          { label: 'Sessions', value: String(trackSessions.length), mono: false },
          { label: 'Last Driven', value: lastDriven || 'Never', mono: false },
        ].map(({ label, value, mono, sub }) => (
          <div key={label} className="track-stat">
            <div className="track-stat-label">{label}</div>
            <div className={`track-stat-value${!mono || value === '—' || value === 'Never' ? ' gray' : ''}`}>{value}</div>
            {sub && <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray-mid)', marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tyre Compound Guide */}
      {tyreGuide && (
        <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ background: 'var(--bg-elevated)', padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🏎️</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gray-light)' }}>Tyre Strategy Guide</span>
          </div>
          <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontFamily: 'var(--font-body)', fontSize: 12 }}>
            <span style={{ color: 'var(--gray-mid)' }}>Compounds</span>
            <span style={{ color: 'var(--white)' }}>{tyreGuide.compounds}</span>
            <span style={{ color: 'var(--gray-mid)' }}>Strategy</span>
            <span style={{ color: 'var(--white)' }}>{tyreGuide.strategy}</span>
            <span style={{ color: 'var(--gray-mid)' }}>Notes</span>
            <span style={{ color: 'var(--gray-light)' }}>{tyreGuide.notes}</span>
          </div>
        </div>
      )}

      {/* Circuit School */}
      <CircuitSchoolSection trackId={track.id} />

      {/* Video Clip Library */}
      <VideoClipLibrary trackId={track.id} />

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Corner Breakdown</div>
            {isSaving && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>Saving…</span>
            )}
            {!isSaving && savedFlash && !hasSaveError && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--teal)' }}>✓ Saved</span>
            )}
            {!isSaving && hasSaveError && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Save failed —{' '}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={() => { resetSave(); saveCorners(corners); }}
                >
                  Retry
                </button>
              </span>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={addCorner}><Plus size={11} /> Add Corner</button>
        </div>
        <div className="table-wrap">
          <table className="data-table corner-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th>Gear</th>
                <th>Braking Point</th>
                <th>Line Notes</th>
                <th>My Notes</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {corners.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <div className="empty-state-title">No Corners Added</div>
                      <div className="empty-state-desc">Click "Add Corner" to start building your breakdown.</div>
                    </div>
                  </td>
                </tr>
              ) : corners.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)' }}>{c.number}</td>
                  <td><EditableCell value={c.name} onSave={v => saveCorner(c.id, 'name', v)} placeholder="Corner name" /></td>
                  <td><EditableCell value={c.gear} onSave={v => saveCorner(c.id, 'gear', v)} placeholder="e.g. 3" /></td>
                  <td><EditableCell value={c.brakingPoint} onSave={v => saveCorner(c.id, 'brakingPoint', v)} placeholder="e.g. 150m" /></td>
                  <td><EditableCell value={c.lineNotes} onSave={v => saveCorner(c.id, 'lineNotes', v)} placeholder="click to add" /></td>
                  <td><EditableCell value={c.myNotes} onSave={v => saveCorner(c.id, 'myNotes', v)} placeholder="click to add" /></td>
                  <td>
                    <button className="btn-danger" style={{ padding: '2px 6px', fontSize: 14, lineHeight: 1 }} onClick={() => deleteCorner(c.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title">Sessions at {track.short}</div>
      {trackSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Logged</div>
            <div className="empty-state-desc">Log a session at {track.short} to see it here.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Car</th>
                <th>Best Lap</th>
                <th>Type</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {[...trackSessions].sort((a,b) => b.date.localeCompare(a.date)).map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td>{s.car}</td>
                  <td>
                    <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                    {s.isPB && <span className="pb-badge">★ PB</span>}
                  </td>
                  <td><span className={`badge ${TYPE_BADGE[s.type] || 'badge-practice'}`}>{s.type}</span></td>
                  <td><RatingDots rating={s.rating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Circuit School ────────────────────────────────────────────────────────────

function CircuitSchoolSection({ trackId }: { trackId: string }) {
  const guide = CIRCUIT_SCHOOL[trackId];
  const [expanded, setExpanded] = useState(false);
  if (!guide) return null;

  const sectionStyle = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-light)', lineHeight: 1.7 };
  const labelStyle = { fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--teal)', marginBottom: 6, marginTop: 16 };

  return (
    <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden', border: '1px solid rgba(0,210,190,0.2)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'rgba(0,210,190,0.04)', padding: '12px 20px', borderBottom: expanded ? '1px solid rgba(0,210,190,0.15)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📚</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--teal)' }}>Circuit School</span>
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--gray-mid)' }} /> : <ChevronDown size={14} style={{ color: 'var(--gray-mid)' }} />}
      </div>
      {expanded && (
        <div style={{ padding: '8px 20px 20px' }}>
          <div style={sectionStyle}>{guide.characteristics}</div>

          <div style={labelStyle}>DRS Zones</div>
          <ul style={{ ...sectionStyle, paddingLeft: 18, margin: 0 }}>
            {guide.drsZones.map((z, i) => <li key={i}>{z}</li>)}
          </ul>

          <div style={labelStyle}>Tyre Behaviour</div>
          <div style={sectionStyle}>{guide.tyreBehaviour}</div>

          <div style={labelStyle}>Common Mistakes</div>
          <ul style={{ ...sectionStyle, paddingLeft: 18, margin: 0 }}>
            {guide.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
          </ul>

          <div style={labelStyle}>ERS Deployment</div>
          <div style={sectionStyle}>{guide.ersTips}</div>

          <div style={labelStyle}>Key Corners</div>
          <ul style={{ ...sectionStyle, paddingLeft: 18, margin: 0 }}>
            {guide.keyCorners.map((c, i) => <li key={i}>{c}</li>)}
          </ul>

          <div style={labelStyle}>Setup Tips</div>
          <div style={sectionStyle}>{guide.setupTips}</div>
        </div>
      )}
    </div>
  );
}

// ─── Video Clip Library ────────────────────────────────────────────────────────

interface VideoClip {
  id: string;
  url: string;
  label: string;
  votes: number;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return m ? m[1] : null;
}

function VideoClipLibrary({ trackId }: { trackId: string }) {
  const storageKey = `video-clips-${trackId}`;
  const [clips, setClips] = useState<VideoClip[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const save = (updated: VideoClip[]) => {
    setClips(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const addClip = () => {
    const ytId = extractYouTubeId(newUrl);
    if (!ytId) return;
    save([...clips, { id: crypto.randomUUID(), url: newUrl, label: newLabel || 'Untitled', votes: 0 }]);
    setNewUrl('');
    setNewLabel('');
    setShowAdd(false);
  };

  const upvote = (id: string) => {
    save(clips.map(c => c.id === id ? { ...c, votes: c.votes + 1 } : c).sort((a, b) => b.votes - a.votes));
  };

  const remove = (id: string) => {
    save(clips.filter(c => c.id !== id));
  };

  const sorted = [...clips].sort((a, b) => b.votes - a.votes);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Play size={14} style={{ color: 'var(--red)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gray-light)' }}>Video Clips</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : <><Plus size={11} /> Add Clip</>}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 14, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>YouTube URL</label>
            <input className="form-control" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." style={{ fontSize: 12 }} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Label</label>
            <input className="form-control" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Turn 4 reference lap" style={{ fontSize: 12 }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={addClip} disabled={!extractYouTubeId(newUrl)}>Add</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>No video clips yet — add a YouTube link to build your reference library for this track.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {sorted.map(clip => {
            const ytId = extractYouTubeId(clip.url);
            return (
              <div key={clip.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {ytId && (
                  <a href={clip.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative' }}>
                    <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                      <Play size={32} style={{ color: 'white', opacity: 0.9 }} />
                    </div>
                  </a>
                )}
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => upvote(clip.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, color: 'var(--gray-mid)', fontSize: 11 }}>
                      <ThumbsUp size={12} /> {clip.votes}
                    </button>
                    <button onClick={() => remove(clip.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: 10 }}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Tracks() {
  const { data: sessions = [] } = useGetSessions();
  const [selectedTrack, setSelectedTrack] = useState<F1Track | null>(null);

  if (selectedTrack) {
    return <TrackDetail track={selectedTrack} onBack={() => setSelectedTrack(null)} sessions={sessions} />;
  }
  return <TrackGrid onSelect={setSelectedTrack} sessions={sessions} />;
}
