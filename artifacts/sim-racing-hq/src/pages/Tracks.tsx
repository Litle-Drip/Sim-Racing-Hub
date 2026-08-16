import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp, Play, ThumbsUp, BookOpen, CircleDot, Settings2, Trophy, ChevronRight } from 'lucide-react';
import { Toast } from '../components/Toast';
import { F1_TRACKS, F1Track, CORNER_NAMES, getTypeBadgeClass } from '../data/f1Tracks';
import {
  useGetSessions,
  useGetTrackNotes,
  useUpsertTrackNotes,
  getGetTrackNotesQueryKey,
  useGetTrackDifficulty,
  useUpsertTrackDifficulty,
  getGetTrackDifficultyQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CornerNote, SessionRecord, TrackDifficultyRecord } from '@workspace/api-client-react';
import { lapToSeconds, FOCUS_SESSION_KEY, FOCUS_TRACK_KEY } from '../lib/storage';
import { trackConsistency, TYRE_GUIDES } from '../lib/engagement';
import { CIRCUIT_SCHOOL } from '../data/circuitSchool';
import { SessionDetailModal } from '../components/SessionDetail';

const DIFFICULTY_LABELS = ['', 'Easy', 'Moderate', 'Tricky', 'Hard', 'Brutal'];

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

function DifficultyRating({
  trackId,
  rating,
  onRate,
  isGuest,
}: {
  trackId: string;
  rating: number;
  onRate: (trackId: string, rating: number) => void;
  isGuest?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const [guestFlash, setGuestFlash] = useState(false);

  const handleClick = (v: number) => {
    if (isGuest) {
      setGuestFlash(true);
      setTimeout(() => setGuestFlash(false), 2500);
      return;
    }
    const next = v === rating ? 0 : v;
    onRate(trackId, next);
  };

  const display = hover || rating;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <span className="stat-label" style={{ marginBottom: 0 }}>Difficulty</span>
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
              background: i <= display ? 'var(--red)' : 'var(--border-accent)',
              transition: 'background 0.15s',
            }}
          />
        ))}
      </div>
      {guestFlash && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--teal)' }}>Sign in to save ratings</span>
      )}
      {!guestFlash && display > 0 && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>{DIFFICULTY_LABELS[display]}</span>
      )}
    </div>
  );
}

type SortMode = 'name' | 'sessions' | 'pb' | 'hardest' | 'easiest';

function CardDifficultyDots({
  trackId,
  rating,
  onRate,
  isGuest,
}: {
  trackId: string;
  rating: number;
  onRate: (trackId: string, rating: number) => void;
  isGuest?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const [guestFlash, setGuestFlash] = useState(false);
  const display = hover || rating;

  const handleDotClick = (e: React.MouseEvent, v: number) => {
    e.stopPropagation();
    if (isGuest) {
      setGuestFlash(true);
      setTimeout(() => setGuestFlash(false), 2000);
      return;
    }
    onRate(trackId, v === rating ? 0 : v);
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={e => handleDotClick(e, i)}
            style={{
              cursor: 'pointer',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i <= display ? 'var(--red)' : 'var(--border-accent)',
              transition: 'background 0.12s',
            }}
          />
        ))}
      </div>
      <span className="track-card-difficulty-label" style={guestFlash ? { color: 'var(--teal)' } : undefined}>
        {guestFlash ? 'Sign in to save' : display > 0 ? DIFFICULTY_LABELS[display] : ''}
      </span>
    </div>
  );
}

function TrackGrid({
  onSelect,
  sessions,
  ratingsMap,
  onRate,
  isGuest,
}: {
  onSelect: (t: F1Track) => void;
  sessions: SessionRecord[];
  ratingsMap: Record<string, number>;
  onRate: (trackId: string, rating: number) => void;
  isGuest?: boolean;
}) {
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

  const [sort, setSort] = useState<SortMode>('name');
  const gridRef = useRef<HTMLDivElement>(null);

  const sortedTracks = useMemo(() => {
    const tracks = [...F1_TRACKS];
    switch (sort) {
      case 'sessions':
        return tracks.sort((a, b) => (countByTrack[b.id] || 0) - (countByTrack[a.id] || 0));
      case 'pb':
        return tracks.sort((a, b) => {
          const aPb = pbByTrack[a.id];
          const bPb = pbByTrack[b.id];
          if (!aPb && !bPb) return 0;
          if (!aPb) return 1;
          if (!bPb) return -1;
          return lapToSeconds(aPb) - lapToSeconds(bPb);
        });
      case 'hardest':
        return tracks.sort((a, b) => (ratingsMap[b.id] || 0) - (ratingsMap[a.id] || 0));
      case 'easiest':
        return tracks.sort((a, b) => {
          const ra = ratingsMap[a.id] || 0;
          const rb = ratingsMap[b.id] || 0;
          if (!ra && !rb) return 0;
          if (!ra) return 1;
          if (!rb) return -1;
          return ra - rb;
        });
      default:
        return tracks;
    }
  }, [sort, countByTrack, pbByTrack, ratingsMap]);

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'pb', label: 'PB' },
    { key: 'hardest', label: 'Hardest' },
    { key: 'easiest', label: 'Easiest' },
  ];

  return (
    <div className="page">
      {/* Title and sort share the page header every other screen uses, and the
          sort options are the app's chip (.badge-tab) rather than a fifth chip
          style with its own radius, height and active treatment. */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <h1 className="page-title">Track Bible</h1>
        <div className="toolbar-chips">
          <span className="stat-label" style={{ marginBottom: 0 }}>Sort</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`badge-tab${sort === key ? ' badge-tab-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* The first-run explainer was a full-height empty state with a red
          primary CTA whose only job was to scroll to the grid already on
          screen — it out-shouted the circuits it was pointing at. Same copy,
          same scroll, as the app's inline notice. */}
      {allSessions.length === 0 && (
        <div className="notice notice--teal">
          <BookOpen size={16} aria-hidden="true" style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span className="notice-text">
            <strong>Annotate every circuit.</strong> Each track has a corner-by-corner notes editor — braking points, throttle zones, tyre strategy. Pick a circuit below to start your knowledge base.
          </span>
          <span className="notice-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Explore Circuits
            </button>
          </span>
        </div>
      )}
      <div ref={gridRef} className="track-grid">
        {sortedTracks.map(track => {
          const count = countByTrack[track.id] || 0;
          const pb = pbByTrack[track.id];
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
              <CardDifficultyDots
                trackId={track.id}
                rating={ratingsMap[track.id] || 0}
                onRate={onRate}
                isGuest={isGuest}
              />
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

/**
 * Cross-links from a track to the pages that hold the rest of that track's
 * data. Each one hands the track id off through sessionStorage so the
 * destination opens scoped to this circuit instead of the full list.
 */
function TrackQuickLinks({ trackId, isGuest }: { trackId: string; isGuest?: boolean }) {
  const go = (page: string) => {
    try { sessionStorage.setItem(FOCUS_TRACK_KEY, trackId); } catch { /* storage unavailable — destination just opens unfiltered */ }
    window.dispatchEvent(new CustomEvent('nav', { detail: page }));
  };

  const links: { label: string; sub: string; Icon: typeof Settings2; page: string; guestOk: boolean }[] = [
    { label: 'Setups', sub: 'Your saved setups here', Icon: Settings2, page: 'setups', guestOk: false },
    { label: 'Leaderboard', sub: 'Community times here', Icon: Trophy, page: 'community', guestOk: true },
    { label: 'Sessions', sub: 'Every lap you’ve logged', Icon: BookOpen, page: 'sessions', guestOk: true },
  ];

  return (
    <div className="track-quick-links">
      {links.filter(l => l.guestOk || !isGuest).map(({ label, sub, Icon, page }) => (
        <button key={label} className="track-quick-link" onClick={() => go(page)}>
          <span className="track-quick-link-icon"><Icon size={15} aria-hidden="true" /></span>
          <span className="track-quick-link-text">
            <span className="track-quick-link-label">{label}</span>
            <span className="track-quick-link-sub">{sub}</span>
          </span>
          <ChevronRight size={14} aria-hidden="true" className="track-quick-link-chevron" />
        </button>
      ))}
    </div>
  );
}

function TrackDetail({
  track,
  onBack,
  sessions,
  ratingsMap,
  onRate,
  isGuest,
}: {
  track: F1Track;
  onBack: () => void;
  sessions: SessionRecord[];
  ratingsMap: Record<string, number>;
  onRate: (trackId: string, rating: number) => void;
  isGuest?: boolean;
}) {
  const qc = useQueryClient();
  const allSessions = sessions;
  const trackSessions = allSessions.filter(s => s.trackId === track.id);
  const [detailSession, setDetailSession] = useState<SessionRecord | null>(null);

  const { data: trackNotesData } = useGetTrackNotes(track.id);
  const [notesToast, setNotesToast] = useState<{ message: string; variant?: 'success' | 'error' } | null>(null);
  const { mutate: upsertTrackNotes, isPending: isSaving, isError: hasSaveError, reset: resetSave } = useUpsertTrackNotes({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetTrackNotesQueryKey(track.id) });
        setNotesToast({ message: 'Notes saved' });
      },
      onError: () => {
        setNotesToast({ message: 'Failed to save notes — tap Retry below.', variant: 'error' });
      },
    },
  });

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => saveCorners(updated), 600);
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
      {notesToast && (
        <Toast
          message={notesToast.message}
          variant={notesToast.variant}
          onDone={() => setNotesToast(null)}
        />
      )}
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={12} /> Back to Tracks
      </button>

      <div className="track-detail-header">
        <div className="track-detail-flag">{track.flag}</div>
        <div className="track-detail-info">
          <h1>{track.name}</h1>
          <p>{track.country} · {trackSessions.length} session{trackSessions.length !== 1 ? 's' : ''}</p>
          <DifficultyRating
            trackId={track.id}
            rating={ratingsMap[track.id] || 0}
            onRate={onRate}
            isGuest={isGuest}
          />
        </div>
      </div>

      <TrackQuickLinks trackId={track.id} isGuest={isGuest} />

      <div className="track-stats-row">
        {[
          { label: 'PB Time', value: bestLap || '—', mono: true, sub: pbCar, onClick: pbSession ? () => {
              sessionStorage.setItem(FOCUS_SESSION_KEY, pbSession.id);
              window.dispatchEvent(new CustomEvent('nav', { detail: 'sessions' }));
            } : undefined },
          { label: 'Best S1', value: bestS1 || '—', mono: true },
          { label: 'Best S2', value: bestS2 || '—', mono: true },
          { label: 'Best S3', value: bestS3 || '—', mono: true },
          { label: 'Consistency', value: consistency !== null ? `${consistency.toFixed(1)}%` : '—', mono: true },
          { label: 'Sessions', value: String(trackSessions.length), mono: false },
          { label: 'Last Driven', value: lastDriven || 'Never', mono: false },
        ].map(({ label, value, mono, sub, onClick }) => (
          <div
            key={label}
            className="track-stat"
            onClick={onClick}
            title={onClick ? 'View this session' : undefined}
            style={onClick ? { cursor: 'pointer' } : undefined}
          >
            <div className="track-stat-label">{label}</div>
            <div className={`track-stat-value${!mono || value === '—' || value === 'Never' ? ' gray' : ''}`} style={onClick ? { textDecoration: 'underline', textUnderlineOffset: 3 } : undefined}>{value}</div>
            {sub && <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)', marginTop: 'var(--space-1)' }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tyre Compound Guide */}
      {tyreGuide && (
        <div className="card" style={{ padding: 0, marginBottom: 'var(--space-5)', overflow: 'hidden' }}>
          <div className="panel-header panel-header--bar">
            <span className="panel-title">
              <CircleDot size={13} aria-hidden="true" />
              Tyre Strategy Guide
            </span>
          </div>
          <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-3) var(--space-5)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', alignItems: 'baseline' }}>
            <span className="stat-label" style={{ marginBottom: 0 }}>Compounds</span>
            <span style={{ color: 'var(--white)' }}>{tyreGuide.compounds}</span>
            <span className="stat-label" style={{ marginBottom: 0 }}>Strategy</span>
            <span style={{ color: 'var(--white)' }}>{tyreGuide.strategy}</span>
            <span className="stat-label" style={{ marginBottom: 0 }}>Notes</span>
            <span style={{ color: 'var(--gray-light)' }}>{tyreGuide.notes}</span>
          </div>
        </div>
      )}

      {/* Circuit School */}
      <CircuitSchoolSection trackId={track.id} />

      {/* Video Clip Library */}
      <VideoClipLibrary trackId={track.id} />

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Corner Breakdown</div>
            {isSaving && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Saving…</span>
            )}
            {!isSaving && hasSaveError && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                Save failed —{' '}
                <button
                  className="btn btn-secondary btn-sm"
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
                    <button className="btn btn-danger" aria-label={`Delete corner ${c.number}`} onClick={() => deleteCorner(c.id)}><X size={12} /></button>
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
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setDetailSession(s)} title="Click to view full session details">
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td>{s.car}</td>
                  <td>
                    <span className={s.isPB ? 'pb-time' : 'lap-time'}>{s.bestLap || '—'}</span>
                    {s.isPB && <span className="pb-badge">★ PB</span>}
                  </td>
                  <td><span className={`badge ${getTypeBadgeClass(s.type)}`}>{s.type}</span></td>
                  <td><RatingDots rating={s.rating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailSession && (
        <SessionDetailModal session={detailSession} onClose={() => setDetailSession(null)} />
      )}
    </div>
  );
}

// ─── Circuit School ────────────────────────────────────────────────────────────

function CircuitSchoolSection({ trackId }: { trackId: string }) {
  const guide = CIRCUIT_SCHOOL[trackId];
  const [expanded, setExpanded] = useState(false);
  if (!guide) return null;

  const sectionStyle = { fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', lineHeight: 1.7 };
  const labelStyle = { fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--teal)', marginBottom: 'var(--space-2)', marginTop: 'var(--space-5)' };

  return (
    <div className="card card-accent card-accent--teal" style={{ padding: 0, marginBottom: 'var(--space-5)', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        className="panel-header panel-header--bar"
        style={{ borderBottom: expanded ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
      >
        <span className="panel-title panel-title--teal">
          <BookOpen size={13} aria-hidden="true" />
          Circuit School
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--gray-mid)' }} /> : <ChevronDown size={14} style={{ color: 'var(--gray-mid)' }} />}
      </div>
      {expanded && (
        <div style={{ padding: 'var(--space-3) var(--space-5) var(--space-5)' }}>
          <div style={sectionStyle}>{guide.characteristics}</div>

          <div style={labelStyle}>DRS Zones</div>
          <ul style={{ ...sectionStyle, paddingLeft: 'var(--space-4)', margin: 0 }}>
            {guide.drsZones.map((z, i) => <li key={i}>{z}</li>)}
          </ul>

          <div style={labelStyle}>Tyre Behaviour</div>
          <div style={sectionStyle}>{guide.tyreBehaviour}</div>

          <div style={labelStyle}>Common Mistakes</div>
          <ul style={{ ...sectionStyle, paddingLeft: 'var(--space-4)', margin: 0 }}>
            {guide.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
          </ul>

          <div style={labelStyle}>ERS Deployment</div>
          <div style={sectionStyle}>{guide.ersTips}</div>

          <div style={labelStyle}>Key Corners</div>
          <ul style={{ ...sectionStyle, paddingLeft: 'var(--space-4)', margin: 0 }}>
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
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="panel-title">
          <Play size={14} style={{ color: 'var(--red)' }} />
          Video Clip Library
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <><X size={11} /> Cancel</> : <><Plus size={11} /> Add Clip</>}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            className="input"
            placeholder="YouTube URL"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            style={{ fontSize: 12 }}
          />
          <input
            className="input"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            style={{ fontSize: 12 }}
          />
          <button className="btn btn-primary btn-sm" onClick={addClip} disabled={!extractYouTubeId(newUrl)}>
            Add
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)' }}>No video clips yet — add a YouTube link to build your reference library for this track.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
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
                <div style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
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

export default function Tracks({ isGuest, initialTrackId }: { isGuest?: boolean; initialTrackId?: string }) {
  const { data: sessions = [] } = useGetSessions();
  const [, setLocation] = useLocation();
  // Opened straight onto a circuit when the URL names one. An id that matches
  // no circuit falls through to the grid rather than erroring.
  const [selectedTrack, setSelectedTrack] = useState<F1Track | null>(
    () => F1_TRACKS.find(t => t.id === initialTrackId) ?? null,
  );
  const qc = useQueryClient();

  // Each circuit has its own address, so a track page can be linked, shared
  // and indexed. Selection drives the URL rather than the other way round —
  // the rest of the app navigates by page state, not by route.
  const openTrack = useCallback((track: F1Track) => {
    setSelectedTrack(track);
    setLocation(`/tracks/${track.id}`);
  }, [setLocation]);

  const closeTrack = useCallback(() => {
    setSelectedTrack(null);
    setLocation('/tracks');
  }, [setLocation]);

  const { data: difficultyData = [] } = useGetTrackDifficulty();

  const ratingsMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    (difficultyData as TrackDifficultyRecord[]).forEach(d => { map[d.trackId] = d.rating; });
    return map;
  }, [difficultyData]);

  const { mutate: upsertDifficulty } = useUpsertTrackDifficulty({
    mutation: {
      onMutate: async ({ trackId, data }) => {
        await qc.cancelQueries({ queryKey: getGetTrackDifficultyQueryKey() });
        const prev = qc.getQueryData<TrackDifficultyRecord[]>(getGetTrackDifficultyQueryKey());
        qc.setQueryData<TrackDifficultyRecord[]>(getGetTrackDifficultyQueryKey(), (old = []) => {
          if (data.rating === 0) return old.filter(r => r.trackId !== trackId);
          const exists = old.find(r => r.trackId === trackId);
          if (exists) return old.map(r => r.trackId === trackId ? { ...r, rating: data.rating } : r);
          return [...old, { trackId, rating: data.rating }];
        });
        return { prev };
      },
      onError: (_err, _vars, ctx) => {
        const context = ctx as { prev?: TrackDifficultyRecord[] } | undefined;
        if (context?.prev) qc.setQueryData(getGetTrackDifficultyQueryKey(), context.prev);
      },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: getGetTrackDifficultyQueryKey() });
      },
    },
  });

  const handleRate = useCallback((trackId: string, rating: number) => {
    upsertDifficulty({ trackId, data: { rating } });
  }, [upsertDifficulty]);

  if (selectedTrack) {
    return (
      <TrackDetail
        track={selectedTrack}
        onBack={closeTrack}
        sessions={sessions}
        ratingsMap={ratingsMap}
        onRate={handleRate}
        isGuest={isGuest}
      />
    );
  }
  return (
    <TrackGrid
      onSelect={openTrack}
      sessions={sessions}
      ratingsMap={ratingsMap}
      onRate={handleRate}
      isGuest={isGuest}
    />
  );
}
