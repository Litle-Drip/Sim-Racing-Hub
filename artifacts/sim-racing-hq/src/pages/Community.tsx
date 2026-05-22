import { useState, useMemo } from 'react';
import { Star, Download, Users } from 'lucide-react';
import {
  useGetCommunitySetups,
  useRateSetup,
  useImportSetup,
  getGetSetupsQueryKey,
  getGetCommunitySetupsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import type { CommunitySetupRecord } from '@workspace/api-client-react';
import { F1_TRACKS, SETUP_TAGS } from '../data/f1Tracks';

const TAG_BADGE: Record<string, string> = {
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Wet: 'badge-wet',
  Test: 'badge-practice',
  Sprint: 'badge-hotlap',
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

function CommunityCard({
  setup,
  currentUserId,
  onRate,
  onImport,
  importing,
  localRating,
}: {
  setup: CommunitySetupRecord;
  currentUserId?: string;
  onRate: (id: string, stars: number) => void;
  onImport: (id: string) => void;
  importing: boolean;
  localRating?: number;
}) {
  const trackName = (id: string) => {
    const t = F1_TRACKS.find((t) => t.id === id);
    return t ? `${t.flag} ${t.short}` : id;
  };
  const isOwn = setup.authorId === currentUserId;

  return (
    <div className="community-card">
      <div className="community-card-header">
        <div className="community-card-left">
          <div className="community-card-title">{setup.label}</div>
          <div className="community-card-car">{setup.car}</div>
          <div className="community-card-track">{trackName(setup.trackId)}</div>
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

export default function Community() {
  const qc = useQueryClient();
  const { user } = useUser();
  const [filterTrack, setFilterTrack] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [importError, setImportError] = useState('');

  const { data: setups = [], isLoading } = useGetCommunitySetups(
    {
      trackId: filterTrack || undefined,
      tag: filterTag || undefined,
      car: filterCar || undefined,
    },
    { query: { staleTime: 30_000 } },
  );

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

  const sorted = useMemo(
    () => [...setups].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0)),
    [setups],
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Community Setups</h1>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
          {setups.length} shared setup{setups.length !== 1 ? 's' : ''}
        </div>
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

      {isLoading ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-title">Loading Community Setups…</div>
          </div>
        </div>
      ) : sorted.length === 0 ? (
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
          {sorted.map((setup) => (
            <CommunityCard
              key={setup.id}
              setup={setup}
              currentUserId={user?.id}
              onRate={handleRate}
              onImport={handleImport}
              importing={importingId === setup.id}
              localRating={localRatings[setup.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
