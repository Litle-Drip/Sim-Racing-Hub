import { useState, useMemo, Fragment } from 'react';
import { Star, Download, Users } from 'lucide-react';
import {
  useGetCommunitySetups,
  useGetCommunitySessions,
  useRateSetup,
  useImportSetup,
  getGetSetupsQueryKey,
  getGetCommunitySetupsQueryKey,
  getGetCommunitySessionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommunitySetupRecord, CommunitySessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, F1_25_CARS, SETUP_TAGS, SESSION_TYPES, PLATFORMS, INPUT_DEVICES } from '../data/f1Tracks';

const TAG_BADGE: Record<string, string> = {
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Wet: 'badge-wet',
  Test: 'badge-practice',
  Sprint: 'badge-hotlap',
};

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
  'Time Trial': 'badge-hotlap',
};

function StarRating({
  avg,
  count,
  interactive,
  onRate,
  userRating,
}: {
  avg: number | null | undefined;
  count: number;
  interactive?: boolean;
  onRate?: (stars: number) => void;
  userRating?: number;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || userRating || 0;

  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`star${(interactive ? display : Math.round(avg ?? 0)) >= s ? ' star--filled' : ''}`}
          onMouseEnter={interactive ? () => setHover(s) : undefined}
          onMouseLeave={interactive ? () => setHover(0) : undefined}
          onClick={interactive && onRate ? () => onRate(s) : undefined}
          style={interactive ? { cursor: 'pointer' } : undefined}
        >
          ★
        </span>
      ))}
      {avg != null && (
        <span className="star-avg">{avg.toFixed(1)}</span>
      )}
      <span className="star-count">({count})</span>
    </div>
  );
}

function lapToSeconds(lap: string): number {
  const parts = lap.split(':');
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(lap) || Infinity;
}

function trackLabel(id: string) {
  const t = F1_TRACKS.find((t) => t.id === id);
  return t ? `${t.flag} ${t.short}` : id;
}

function CommunitySetupCard({
  setup,
  onRate,
  onImport,
  importing,
  localRating,
}: {
  setup: CommunitySetupRecord;
  onRate: (id: string, stars: number) => void;
  onImport: (id: string) => void;
  importing: boolean;
  localRating?: number;
}) {
  const isOwn = setup.isOwn ?? false;

  return (
    <div className="community-card">
      <div className="community-card-header">
        <div className="community-card-left">
          <div className="community-card-title">{setup.label}</div>
          <div className="community-card-car">{setup.car}</div>
          <div className="community-card-track">{trackLabel(setup.trackId)}</div>
        </div>
        <div className="community-card-right">
          {setup.tag && (
            <span className={`badge ${TAG_BADGE[setup.tag] || 'badge-practice'}`}>{setup.tag}</span>
          )}
          <div className="community-card-author">
            <Users size={10} />
            {setup.authorName}
          </div>
        </div>
      </div>

      <div className="community-card-params">
        {[
          { label: 'Front Wing', value: setup.frontWing },
          { label: 'Rear Wing', value: setup.rearWing },
          { label: 'Brake Bias', value: setup.brakeBias ? `${setup.brakeBias}%` : '—' },
          { label: 'On Throttle', value: setup.onThrottle ? `${setup.onThrottle}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="community-param-item">
            <div className="community-param-label">{label}</div>
            <div className="community-param-value">{value || '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 4 }}>
        {setup.gameVersion?.trim() || '—'}
      </div>

      <div className="community-card-footer">
        <StarRating
          avg={setup.avgRating}
          count={setup.ratingCount}
          interactive={!isOwn}
          onRate={isOwn ? undefined : (stars) => onRate(setup.id, stars)}
          userRating={localRating}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onImport(setup.id)}
          disabled={importing}
          title="Import to My Vault"
        >
          <Download size={11} />
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  );
}

function CommunitySessionCard({ session, onClick }: { session: CommunitySessionRecord; onClick?: () => void }) {
  const params = [
    { label: 'Avg Lap', value: session.avgLap || '—' },
    { label: 'Tires', value: session.tires },
    { label: 'Conditions', value: session.conditions },
  ];
  if (session.penalty && session.penalty.trim() !== '') {
    params.push({ label: 'Penalty', value: session.penalty });
  }

  return (
    <div className="community-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="community-card-header">
        <div className="community-card-left">
          <div className="community-card-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--teal)' }}>
            {session.bestLap || '—'}
          </div>
          <div className="community-card-car">{session.car}</div>
          <div className="community-card-track">{trackLabel(session.trackId)}</div>
        </div>
        <div className="community-card-right">
          <span className={`badge ${TYPE_BADGE[session.type] || 'badge-practice'}`}>{session.type}</span>
          {session.platform && <span className="badge badge-practice">{session.platform}</span>}
          {session.inputDevice && <span className="badge badge-practice">{session.inputDevice}</span>}
          <div className="community-card-author">
            <Users size={10} />
            {session.authorName}
          </div>
        </div>
      </div>

      <div className="community-card-params">
        {params.map(({ label, value }) => (
          <div key={label} className="community-param-item">
            <div className="community-param-label">{label}</div>
            <div className="community-param-value" style={label === 'Penalty' ? { color: 'var(--red)' } : {}}>{value}</div>
          </div>
        ))}
      </div>

      {session.gameVersion && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 4 }}>
          {session.gameVersion}
        </div>
      )}

      {session.publicNote && (
        <div className="community-card-notes">{session.publicNote}</div>
      )}

      <div className="community-card-footer">
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
          {session.date}
        </span>
        {onClick && <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--gray)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>View Details →</span>}
      </div>
    </div>
  );
}

export default function Community() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'setups' | 'sessions' | 'leaderboard'>('leaderboard');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterGameVersion, setFilterGameVersion] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [sessionSort, setSessionSort] = useState<'fastest' | 'recent' | 'rating'>('fastest');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [importError, setImportError] = useState('');

  const { data: setups = [], isLoading: setupsLoading } = useGetCommunitySetups({
    trackId: filterTrack || undefined,
    tag: filterTag || undefined,
    car: filterCar || undefined,
    gameVersion: filterGameVersion || undefined,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useGetCommunitySessions({
    sort: sessionSort === 'fastest' ? undefined : sessionSort,
  });

  const { mutate: rateSetup } = useRateSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCommunitySetupsQueryKey() });
      },
    },
  });

  const { mutate: importSetup } = useImportSetup({
    mutation: {
      onSuccess: (_, vars) => {
        qc.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
        setImportedIds((s) => new Set(s).add(vars.id));
        setImportingId(null);
      },
      onError: () => {
        setImportingId(null);
        setImportError('Import failed. Please try again.');
        setTimeout(() => setImportError(''), 4000);
      },
    },
  });

  const handleRate = (id: string, stars: number) => {
    setLocalRatings((r) => ({ ...r, [id]: stars }));
    rateSetup({ id, data: { stars } });
  };

  const handleImport = (id: string) => {
    setImportingId(id);
    setImportError('');
    importSetup({ id });
  };

  const sortedSetups = useMemo(
    () => [...setups].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0)),
    [setups],
  );

  const filteredSessions = useMemo(() => {
    return [...sessions].filter(s => {
      if (filterTrack && s.trackId !== filterTrack) return false;
      if (filterType && s.type !== filterType) return false;
      if (filterCar && !s.car.toLowerCase().includes(filterCar.toLowerCase())) return false;
      if (filterPlatform && s.platform !== filterPlatform) return false;
      if (filterInput && s.inputDevice !== filterInput) return false;
      return true;
    });
  }, [sessions, filterTrack, filterType, filterCar, filterPlatform, filterInput]);

  const leaderboard = useMemo(() => {
    const byTrack: Record<string, CommunitySessionRecord> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      const existing = byTrack[s.trackId];
      if (!existing || lapToSeconds(s.bestLap) < lapToSeconds(existing.bestLap)) {
        byTrack[s.trackId] = s;
      }
    });
    return F1_TRACKS
      .filter(t => byTrack[t.id])
      .map(t => ({ track: t, session: byTrack[t.id] }));
  }, [sessions]);

  const [detailSession, setDetailSession] = useState<CommunitySessionRecord | null>(null);

  const challenge = useMemo(() => {
    const now = new Date();
    // ISO week number (Monday-based, UTC-stable)
    const day = now.getUTCDay(); // 0=Sun, 1=Mon
    const mondayOffset = day === 0 ? 6 : day - 1;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
    const week = Math.floor(monday.getTime() / (7 * 24 * 3600 * 1000));
    const track = F1_TRACKS[week % F1_TRACKS.length];
    const challengeSessions = sessions
      .filter(s => s.trackId === track.id && s.bestLap && s.bestLap.trim() !== '')
      .sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap))
      .slice(0, 3);
    return { track, entries: challengeSessions, week };
  }, [sessions]);

  return (
    <div className="page">
      {/* Weekly Challenge */}
      <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden', border: '1px solid rgba(232,0,45,0.3)' }}>
        <div style={{ background: 'rgba(232,0,45,0.08)', padding: '14px 20px', borderBottom: '1px solid rgba(232,0,45,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)' }}>Weekly Challenge</span>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--white)', marginTop: 2 }}>
              {challenge.track.flag} Fastest Lap at {challenge.track.name}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
            Share a session at {challenge.track.short} to compete
          </span>
        </div>
        {challenge.entries.length > 0 ? (
          <div style={{ padding: '12px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {challenge.entries.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-body)', fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: i === 0 ? 'var(--teal)' : 'var(--gray-mid)', width: 16 }}>{i + 1}.</span>
                  <span className={i === 0 ? 'pb-time' : 'lap-time'}>{s.bestLap}</span>
                  <span style={{ color: 'var(--gray-light)' }}>{s.authorName}</span>
                  <span style={{ color: 'var(--gray-mid)', marginLeft: 'auto' }}>{s.car}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px 20px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
            No times submitted yet — be the first to set the pace!
          </div>
        )}
      </div>

      <div className="page-header">
        <h1 className="page-title">Community</h1>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
          {tab === 'setups'
            ? `${setups.length} shared setup${setups.length !== 1 ? 's' : ''}`
            : tab === 'sessions'
            ? `${sessions.length} shared session${sessions.length !== 1 ? 's' : ''}`
            : `${leaderboard.length} track${leaderboard.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['leaderboard', 'sessions', 'setups'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--red)' : '2px solid transparent',
              color: tab === t ? 'var(--white)' : 'var(--gray-mid)',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t === 'setups' ? 'Setups' : t === 'sessions' ? 'Sessions' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {importError && (
        <div style={{
          background: 'rgba(232,0,45,0.12)',
          border: '1px solid rgba(232,0,45,0.4)',
          color: 'var(--red)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          {importError}
        </div>
      )}

      {tab === 'setups' && (
        <>
          <div className="filter-bar" style={{ marginBottom: 24 }}>
            <select className="filter-select" value={filterTrack} onChange={(e) => setFilterTrack(e.target.value)}>
              <option value="">All Tracks</option>
              {F1_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>{t.flag} {t.short}</option>
              ))}
            </select>
            <select className="filter-select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">All Tags</option>
              {SETUP_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={filterCar} onChange={(e) => setFilterCar(e.target.value)}>
              <option value="">All Cars</option>
              {F1_25_CARS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="filter-select"
              type="text"
              placeholder="Filter by version…"
              value={filterGameVersion}
              onChange={(e) => setFilterGameVersion(e.target.value)}
            />
          </div>

          {setupsLoading ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">Loading Community Setups…</div>
              </div>
            </div>
          ) : sortedSetups.length === 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">No Community Setups</div>
                <div className="empty-state-desc">
                  Be the first! Share a setup from your Setup Vault using the "Share" button.
                </div>
              </div>
            </div>
          ) : (
            <div className="community-grid">
              {sortedSetups.map((setup) => (
                <CommunitySetupCard
                  key={setup.id}
                  setup={setup}
                  onRate={handleRate}
                  onImport={handleImport}
                  importing={importingId === setup.id}
                  localRating={localRatings[setup.id]}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'sessions' && (
        <>
          <div className="filter-bar" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
            <select className="filter-select" value={filterTrack} onChange={(e) => setFilterTrack(e.target.value)}>
              <option value="">All Tracks</option>
              {F1_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>{t.flag} {t.short}</option>
              ))}
            </select>
            <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
              <option value="">All Platforms</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="filter-select" value={filterInput} onChange={(e) => setFilterInput(e.target.value)}>
              <option value="">All Inputs</option>
              {INPUT_DEVICES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="filter-select" value={filterCar} onChange={(e) => setFilterCar(e.target.value)}>
              <option value="">All Cars</option>
              {F1_25_CARS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="filter-select" value={sessionSort} onChange={(e) => setSessionSort(e.target.value as 'fastest' | 'recent' | 'rating')}>
              <option value="fastest">Fastest First</option>
              <option value="recent">Most Recent</option>
              <option value="rating">Best Session Rating</option>
            </select>
          </div>

          {sessionsLoading ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">Loading Community Sessions…</div>
              </div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">No Community Sessions</div>
                <div className="empty-state-desc">
                  Share a session from your Session Log using the "Share" button on any session.
                </div>
              </div>
            </div>
          ) : (
            <div className="community-grid">
              {filteredSessions.map((session) => (
                <CommunitySessionCard key={session.id} session={session} onClick={() => setDetailSession(session)} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'leaderboard' && (
        <>
          {sessionsLoading ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">Loading Leaderboard…</div>
              </div>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-title">No Leaderboard Data</div>
                <div className="empty-state-desc">
                  Share sessions with best lap times to populate the leaderboard.
                </div>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Track</th>
                    <th>Best Time</th>
                    <th>Driver</th>
                    <th>Car</th>
                    <th>Platform</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(({ track, session }) => (
                    <tr key={track.id}>
                      <td>{track.flag} {track.short}</td>
                      <td><span className="pb-time">{session.bestLap}</span></td>
                      <td style={{ fontFamily: 'var(--font-body)' }}>{session.authorName}</td>
                      <td>{session.car}</td>
                      <td>{session.platform || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{session.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Session detail modal */}
      {detailSession && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDetailSession(null); }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">Session Details</span>
              <button className="modal-close" onClick={() => setDetailSession(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--teal)' }}>
                  {detailSession.bestLap || '—'}
                </span>
                <span className={`badge ${TYPE_BADGE[detailSession.type] || 'badge-practice'}`}>{detailSession.type}</span>
              </div>

              <div className="form-grid" style={{ gap: '12px 24px' }}>
                {[
                  { label: 'Track', value: trackLabel(detailSession.trackId) },
                  { label: 'Car', value: detailSession.car },
                  { label: 'Driver', value: detailSession.authorName },
                  { label: 'Date', value: detailSession.date },
                  { label: 'Avg Lap', value: detailSession.avgLap || '—' },
                  { label: 'Tires', value: detailSession.tires },
                  { label: 'Conditions', value: detailSession.conditions },
                  { label: 'Rating', value: detailSession.rating ? `${detailSession.rating}/5` : '—' },
                  ...(detailSession.platform ? [{ label: 'Platform', value: detailSession.platform }] : []),
                  ...(detailSession.inputDevice ? [{ label: 'Input', value: detailSession.inputDevice }] : []),
                  ...(detailSession.gameVersion ? [{ label: 'Game Version', value: detailSession.gameVersion }] : []),
                  ...(detailSession.penalty && detailSession.penalty.trim() !== '' ? [{ label: 'Penalty', value: detailSession.penalty }] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--white)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {detailSession.publicNote && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 4 }}>Note</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>{detailSession.publicNote}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
