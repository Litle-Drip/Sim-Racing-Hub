import { useMemo, useState } from 'react';
import { useGetCommunitySessions } from '@workspace/api-client-react';
import type { CommunitySessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';

function lapToSeconds(lap: string): number {
  const parts = lap.split(':');
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(lap) || Infinity;
}

const PAGE_SIZE = 8;

export default function PublicLeaderboard({ onBack }: { onBack?: () => void }) {
  const { data: sessions = [], isLoading } = useGetCommunitySessions();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const leaderboard = useMemo(() => {
    const byTrack: Record<string, CommunitySessionRecord[]> = {};
    sessions.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      if (!byTrack[s.trackId]) byTrack[s.trackId] = [];
      byTrack[s.trackId].push(s);
    });

    return F1_TRACKS
      .filter(t => byTrack[t.id])
      .map(t => {
        const sorted = byTrack[t.id].sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap));
        return { track: t, entries: sorted.slice(0, 5) };
      });
  }, [sessions]);

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {onBack && (
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Back
        </button>
      )}

      <h1 className="page-title" style={{ marginBottom: 8 }}>Community Leaderboard</h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginBottom: 28, lineHeight: 1.6 }}>
        Fastest lap times submitted by the F1 Sim Hub community. Top 5 per circuit. Share your sessions to compete.
      </p>

      {isLoading ? (
        <div className="empty-state">
          <div className="empty-state-title">Loading Leaderboard…</div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No Times Submitted</div>
          <div className="empty-state-desc">Be the first to share a session and claim the top spot.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {leaderboard.slice(0, visibleCount).map(({ track, entries }) => (
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
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: idx === 0 ? 'var(--teal)' : 'var(--gray-mid)' }}>{idx + 1}</td>
                        <td><span className={idx === 0 ? 'pb-time' : 'lap-time'}>{s.bestLap}</span></td>
                        <td style={{ fontFamily: 'var(--font-body)' }}>{s.authorName}</td>
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
          {leaderboard.length > visibleCount && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: '10px 24px' }}
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              >
                Show More Circuits ({leaderboard.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
