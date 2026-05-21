import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { F1_TRACKS, F1Track } from '../data/f1Tracks';
import { useGetSessions, useGetTrackNotes, useUpsertTrackNotes, getGetTrackNotesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CornerNote, SessionRecord } from '@workspace/api-client-react';
import { lapToSeconds } from '../lib/storage';

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
          return (
            <div key={track.id} className="track-card" onClick={() => onSelect(track)}>
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
        color: val ? 'var(--white)' : 'var(--gray)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
      }}
    >
      {val || <span style={{ color: 'var(--gray)', fontStyle: 'italic' }}>{placeholder || 'Click to edit'}</span>}
    </span>
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
  const { mutate: upsertTrackNotes } = useUpsertTrackNotes({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetTrackNotesQueryKey(track.id) });
      },
    },
  });

  const [notesId] = useState(() => crypto.randomUUID());
  const [corners, setCorners] = useState<CornerNote[]>(() => {
    return Array.from({ length: track.corners }, (_, i) => ({
      id: crypto.randomUUID(),
      number: i + 1,
      name: '',
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

  const bestLap = trackSessions.reduce((best, s) => {
    if (!s.bestLap || s.bestLap.trim() === '') return best;
    if (!best || lapToSeconds(s.bestLap) < lapToSeconds(best)) return s.bestLap;
    return best;
  }, '');
  const bestS1 = trackSessions.reduce((best, s) => (!s.s1 || s.s1.trim() === '') ? best : (!best || parseFloat(s.s1) < parseFloat(best)) ? s.s1 : best, '');
  const bestS2 = trackSessions.reduce((best, s) => (!s.s2 || s.s2.trim() === '') ? best : (!best || parseFloat(s.s2) < parseFloat(best)) ? s.s2 : best, '');
  const bestS3 = trackSessions.reduce((best, s) => (!s.s3 || s.s3.trim() === '') ? best : (!best || parseFloat(s.s3) < parseFloat(best)) ? s.s3 : best, '');
  const lastDriven = trackSessions.length > 0 ? [...trackSessions].sort((a,b) => b.date.localeCompare(a.date))[0].date : '';

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
        </div>
      </div>

      <div className="track-stats-row">
        {[
          { label: 'PB Time', value: bestLap || '—', mono: true },
          { label: 'Best S1', value: bestS1 || '—', mono: true },
          { label: 'Best S2', value: bestS2 || '—', mono: true },
          { label: 'Best S3', value: bestS3 || '—', mono: true },
          { label: 'Sessions', value: String(trackSessions.length), mono: false },
          { label: 'Last Driven', value: lastDriven || 'Never', mono: false },
        ].map(({ label, value, mono }) => (
          <div key={label} className="track-stat">
            <div className="track-stat-label">{label}</div>
            <div className={`track-stat-value${!mono || value === '—' || value === 'Never' ? ' gray' : ''}`}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Corner Breakdown</div>
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
                  <td><EditableCell value={c.gear} onSave={v => saveCorner(c.id, 'gear', v)} placeholder="3" /></td>
                  <td><EditableCell value={c.brakingPoint} onSave={v => saveCorner(c.id, 'brakingPoint', v)} placeholder="150m board" /></td>
                  <td><EditableCell value={c.lineNotes} onSave={v => saveCorner(c.id, 'lineNotes', v)} placeholder="Line notes..." /></td>
                  <td><EditableCell value={c.myNotes} onSave={v => saveCorner(c.id, 'myNotes', v)} placeholder="Personal notes..." /></td>
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

export default function Tracks() {
  const { data: sessions = [] } = useGetSessions();
  const [selectedTrack, setSelectedTrack] = useState<F1Track | null>(null);

  if (selectedTrack) {
    return <TrackDetail track={selectedTrack} onBack={() => setSelectedTrack(null)} sessions={sessions} />;
  }
  return <TrackGrid onSelect={setSelectedTrack} sessions={sessions} />;
}
