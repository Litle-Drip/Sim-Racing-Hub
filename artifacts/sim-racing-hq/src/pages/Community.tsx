import { useState, useMemo, useEffect, useRef } from 'react';
import { Download, Users } from 'lucide-react';
import {
  useGetCommunitySetups,
  useGetCommunitySessions,
  useRateSetup,
  useImportSetup,
  getGetSetupsQueryKey,
  getGetCommunitySetupsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommunitySetupRecord, CommunitySessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS, F1_25_CARS, getTypeBadgeClass } from '../data/f1Tracks';
import { getDailyChallenge } from '../lib/engagement';
import { useRivalNotifications } from '../lib/rivalNotifications';
import { takeFocusTrack } from '../lib/storage';
import Rivals from './Rivals';

const TAG_BADGE: Record<string, string> = {
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Wet: 'badge-wet',
  Test: 'badge-practice',
  Sprint: 'badge-hotlap',
};

// How many circuits the leaderboard shows before "Show More".
const LEADERBOARD_PAGE_SIZE = 10;

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

export type CommunityTab = 'leaderboard' | 'rivals' | 'setups';

const TAB_LABELS: Record<CommunityTab, string> = {
  leaderboard: 'Leaderboard',
  rivals: 'Rivals',
  setups: 'Setups',
};

// Rivals sits second — it's the tab with a notification on it, so it reads
// before Setups rather than after.
const TABS: CommunityTab[] = ['leaderboard', 'rivals', 'setups'];

export default function Community({ isGuest, initialTab }: { isGuest?: boolean; initialTab?: CommunityTab }) {
  const qc = useQueryClient();
  const { count: rivalNotificationCount } = useRivalNotifications();
  const [tab, setTab] = useState<CommunityTab>(initialTab ?? 'leaderboard');
  // Set when arrived at from a track page's "Leaderboard" quick-link.
  const [focusTrack] = useState(() => takeFocusTrack());

  // Land on Rivals when a challenge is waiting on you. The challenge list
  // usually hasn't loaded on first render, so this waits for it — but only
  // switches while the driver is still on the tab they landed on, so it can
  // never yank the tab out from under someone mid-browse.
  const autoTabbed = useRef(false);
  useEffect(() => {
    if (autoTabbed.current || rivalNotificationCount === 0) return;
    autoTabbed.current = true;
    setTab(current => (current === 'leaderboard' ? 'rivals' : current));
  }, [rivalNotificationCount]);
  const [filterTrack, setFilterTrack] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [importError, setImportError] = useState('');
  const [visibleCircuits, setVisibleCircuits] = useState(LEADERBOARD_PAGE_SIZE);
  const [detailSession, setDetailSession] = useState<CommunitySessionRecord | null>(null);

  const { data: setups = [], isLoading: setupsLoading } = useGetCommunitySetups({
    trackId: filterTrack || undefined,
    car: filterCar || undefined,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useGetCommunitySessions();

  const { mutate: rateSetup } = useRateSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCommunitySetupsQueryKey() });
      },
    },
  });

  const { mutate: importSetup } = useImportSetup({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSetupsQueryKey() });
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

  // Top 5 per circuit, one entry per driver so a prolific driver can't occupy
  // the whole board. This absorbs both the old standalone /leaderboard page and
  // the 'sessions' browse tab — a ranked list of shared laps is what that tab
  // was, only with six filters bolted on top.
  const leaderboard = useMemo(() => {
    const byTrack: Record<string, CommunitySessionRecord[]> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      if (!byTrack[s.trackId]) byTrack[s.trackId] = [];
      byTrack[s.trackId].push(s);
    });

    // A track arrived at from its own page sorts to the front of the board so
    // it's on screen without paging through "Show More".
    const ordered = focusTrack
      ? [...F1_TRACKS].sort((a, b) => Number(b.id === focusTrack) - Number(a.id === focusTrack))
      : F1_TRACKS;

    return ordered
      .filter(t => byTrack[t.id])
      .map(t => {
        const sorted = [...byTrack[t.id]].sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap));
        const seenDrivers = new Set<string>();
        const deduped = sorted.filter(s => {
          if (seenDrivers.has(s.authorName)) return false;
          seenDrivers.add(s.authorName);
          return true;
        });
        return { track: t, entries: deduped.slice(0, 5) };
      });
  }, [sessions, focusTrack]);

  // Today's challenge is just the leaderboard scoped to one track + car, so it
  // sits pinned at the top of the board instead of owning a tab of its own.
  const daily = useMemo(() => {
    const today = getDailyChallenge();
    const entries = sessions
      .filter(s => s.trackId === today.track.id && s.car === today.car && s.date === today.date && s.bestLap && s.bestLap.trim() !== '')
      .sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap))
      .slice(0, 10);
    return { ...today, entries };
  }, [sessions]);

  const headerCount = tab === 'setups'
    ? `${setups.length} shared setup${setups.length !== 1 ? 's' : ''}`
    : tab === 'leaderboard'
    ? `${leaderboard.length} circuit${leaderboard.length !== 1 ? 's' : ''}`
    : '';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Community</h1>
        {headerCount && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
            {headerCount}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
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
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {TAB_LABELS[t]}
            {/* Mirrors the sidebar badge, and clears on the same condition:
                the challenge is answered, not merely looked at. */}
            {t === 'rivals' && rivalNotificationCount > 0 && (
              <span style={{
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                background: 'var(--red)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>
                {rivalNotificationCount}
              </span>
            )}
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

      {tab === 'leaderboard' && (
        <>
          {/* Today's Challenge — pinned above the board */}
          <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden', border: '1px solid rgba(0,210,190,0.3)' }}>
            <div style={{ background: 'rgba(0,210,190,0.06)', padding: '14px 20px', borderBottom: '1px solid rgba(0,210,190,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--teal)' }}>Today's Challenge</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--white)', marginTop: 2 }}>
                  {daily.track.flag} {daily.track.name} — {daily.car}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
                Log and share a session here today to compete
              </span>
            </div>
            {daily.entries.length > 0 ? (
              <div style={{ padding: '12px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {daily.entries.map((s, i) => (
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
                No times submitted today yet — be the first on the board.
              </div>
            )}
          </div>

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
                  Share a session with a best lap time to put the first name on the board.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {leaderboard.slice(0, visibleCircuits).map(({ track, entries }) => (
                <div key={track.id}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 8 }}>
                    {track.flag} {track.name}
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}>#</th>
                          <th>Time</th>
                          <th>Driver</th>
                          <th>Car</th>
                          <th>Platform</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((s, idx) => (
                          <tr
                            key={s.id}
                            style={{ cursor: 'pointer' }}
                            title="View session details"
                            onClick={() => setDetailSession(s)}
                          >
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: idx === 0 ? 'var(--teal)' : 'var(--gray-mid)' }}>{idx + 1}</td>
                            <td><span className={idx === 0 ? 'pb-time' : 'lap-time'}>{s.bestLap}</span></td>
                            <td style={{ fontFamily: 'var(--font-body)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{s.authorName}</td>
                            <td>{s.car}</td>
                            <td>{s.platform || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {leaderboard.length > visibleCircuits && (
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 13, padding: '10px 24px' }}
                    onClick={() => setVisibleCircuits(c => c + LEADERBOARD_PAGE_SIZE)}
                  >
                    Show More Circuits ({leaderboard.length - visibleCircuits} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
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
            <select className="filter-select" value={filterCar} onChange={(e) => setFilterCar(e.target.value)}>
              <option value="">All Cars</option>
              {F1_25_CARS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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

      {tab === 'rivals' && (
        isGuest ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="empty-state">
              <div className="empty-state-title">Sign in to challenge someone</div>
              <div className="empty-state-desc">
                Rivals matches you head-to-head against another driver's lap. Create a free account to send and accept challenges.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => window.dispatchEvent(new CustomEvent('guestSignIn'))}
              >
                Create Free Account
              </button>
            </div>
          </div>
        ) : (
          <Rivals />
        )
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
                <span className={`badge ${getTypeBadgeClass(detailSession.type)}`}>{detailSession.type}</span>
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
