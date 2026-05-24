import { useState, useMemo } from 'react';
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
import { F1_TRACKS, SETUP_TAGS, SESSION_TYPES, PLATFORMS, INPUT_DEVICES } from '../data/f1Tracks';

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

      {setup.notes && (
        <div className="community-card-notes">{setup.notes}</div>
      )}

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

function CommunitySessionCard({ session }: { session: CommunitySessionRecord }) {
  const params = [
    { label: 'Avg Lap', value: session.avgLap || '—' },
    { label: 'Tires', value: session.tires },
    { label: 'Conditions', value: session.conditions },
  ];
  if (session.penalty && session.penalty.trim() !== '') {
    params.push({ label: 'Penalty', value: session.penalty });
  }

  return (
    <div className="community-card">
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
          {session.platform && <span className="badge badge-practice" style={{ fontSize: 9 }}>{session.platform}</span>}
          {session.inputDevice && <span className="badge badge-practice" style={{ fontSize: 9 }}>{session.inputDevice}</span>}
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
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--gray-mid)', marginTop: 4 }}>
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
      </div>
    </div>
  );
}

export default function Community() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'setups' | 'sessions'>('setups');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterCar, setFilterCar] = useState('');
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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Community</h1>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
          {tab === 'setups'
            ? `${setups.length} shared setup${setups.length !== 1 ? 's' : ''}`
            : `${sessions.length} shared session${sessions.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['setups', 'sessions'] as const).map(t => (
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
            {t === 'setups' ? 'Setups' : 'Sessions'}
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
            <input
              className="filter-select"
              placeholder="Filter by car…"
              value={filterCar}
              onChange={(e) => setFilterCar(e.target.value)}
              style={{ maxWidth: 180 }}
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
            <input
              className="filter-select"
              placeholder="Filter by car…"
              value={filterCar}
              onChange={(e) => setFilterCar(e.target.value)}
              style={{ maxWidth: 180 }}
            />
            <select className="filter-select" value={sessionSort} onChange={(e) => setSessionSort(e.target.value as 'fastest' | 'recent' | 'rating')}>
              <option value="fastest">Fastest First</option>
              <option value="recent">Most Recent</option>
              <option value="rating">Highest Rated</option>
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
                <CommunitySessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
