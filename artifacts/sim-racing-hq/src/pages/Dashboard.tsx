import { useMemo } from 'react';
import { useGetSessions, useGetSetups } from '@workspace/api-client-react';
import type { SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';

const TYPE_BADGE: Record<string, string> = {
  Practice: 'badge-practice',
  Qualifying: 'badge-qualifying',
  Race: 'badge-race',
  Hotlap: 'badge-hotlap',
};

function RatingDots({ rating }: { rating: number }) {
  return (
    <span className="rating-dots">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`rating-dot${i <= rating ? ' filled' : ''}`} />
      ))}
    </span>
  );
}

function buildHeatmap(sessions: SessionRecord[]) {
  const countMap: Record<string, number> = {};
  sessions.forEach(s => {
    if (s.date) countMap[s.date] = (countMap[s.date] || 0) + 1;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const cells: { date: string; count: number; level: number }[][] = [];
  let cur = new Date(startDate);

  while (cur <= today) {
    const col: { date: string; count: number; level: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10);
      const count = countMap[dateStr] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      col.push({ date: dateStr, count, level });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    }
    cells.push(col);
  }
  return { cells, startDate };
}

function buildMonthLabels(cells: { date: string }[][]) {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  cells.forEach((col, i) => {
    const m = new Date(col[0].date).getMonth();
    if (m !== lastMonth) {
      labels.push({ label: new Date(col[0].date).toLocaleString('en', { month: 'short' }).toUpperCase(), col: i });
      lastMonth = m;
    }
  });
  return labels;
}

interface DashboardProps {
  setPage: (p: string) => void;
}

export default function Dashboard({ setPage }: DashboardProps) {
  const { data: sessions = [] } = useGetSessions();
  const { data: setups = [] } = useGetSetups();

  const totalSessions = sessions.length;
  const tracksPracticed = new Set(sessions.map(s => s.trackId)).size;
  const pbsSet = sessions.filter(s => s.isPB).length;
  const setupsSaved = setups.length;

  const recentSessions = useMemo(() => [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5), [sessions]);

  const neglectedTracks = useMemo(() => {
    const lastDriven: Record<string, string> = {};
    sessions.forEach(s => {
      if (!lastDriven[s.trackId] || s.date > lastDriven[s.trackId]) {
        lastDriven[s.trackId] = s.date;
      }
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return F1_TRACKS
      .filter(t => lastDriven[t.id])
      .map(t => {
        const last = new Date(lastDriven[t.id]);
        const daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
        return { ...t, daysSince };
      })
      .filter(t => t.daysSince >= 14)
      .sort((a, b) => b.daysSince - a.daysSince);
  }, [sessions]);

  const { cells } = useMemo(() => buildHeatmap(sessions), [sessions]);
  const monthLabels = useMemo(() => buildMonthLabels(cells), [cells]);

  const trackName = (id: string) => {
    const t = F1_TRACKS.find(t => t.id === id);
    return t ? t.short : id;
  };

  return (
    <div className="page">
      {/* Stat Cards */}
      <div className="stat-grid">
        {[
          { label: 'Total Sessions', value: totalSessions },
          { label: 'Tracks Practiced', value: tracksPracticed },
          { label: 'Personal Bests', value: pbsSet },
          { label: 'Setups Saved', value: setupsSaved },
        ].map(({ label, value }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Activity Heatmap */}
      <div className="heatmap-section">
        <div className="heatmap-header">
          <div className="section-title" style={{ marginBottom: 0 }}>Activity — Last 365 Days</div>
          <div className="heatmap-legend">
            <span className="legend-dot" style={{ background: '#1E1E1E', border: '1px solid #333' }} />
            <span style={{ fontSize: 10 }}>None</span>
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.3)' }} />
            <span className="legend-dot" style={{ background: 'rgba(232,0,45,0.55)' }} />
            <span className="legend-dot" style={{ background: '#E8002D' }} />
            <span style={{ fontSize: 10 }}>Active</span>
          </div>
        </div>

        <div style={{ display: 'flex', marginBottom: 4, paddingLeft: 14 }}>
          {monthLabels.map(({ label, col }, idx) => {
            const nextCol = monthLabels[idx + 1]?.col ?? cells.length;
            const spanWidth = (nextCol - col) * 13;
            return (
              <div key={`${label}-${col}`} style={{ width: spanWidth, flexShrink: 0, overflow: 'hidden' }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 8,
                  color: 'var(--gray)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>{label}</span>
              </div>
            );
          })}
        </div>

        <div className="heatmap-grid">
          <div className="heatmap-day-labels">
            {['', 'M', '', 'W', '', 'F', ''].map((d, i) => (
              <div key={i} className="heatmap-day-label">{d}</div>
            ))}
          </div>
          <div className="heatmap-cols">
            {cells.map((col, ci) => (
              <div key={ci} className="heatmap-col">
                {col.map((cell, di) => (
                  <div
                    key={di}
                    className={`heatmap-cell${cell.level > 0 ? ` l${cell.level}` : ''}`}
                    title={`${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="section-title">Recent Sessions</div>
      {recentSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No Sessions Yet</div>
            <div className="empty-state-desc">Head to the Sessions page to log your first sim racing session.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Track</th>
                <th>Car</th>
                <th>Best Lap</th>
                <th>Type</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.date}</td>
                  <td>{trackName(s.trackId)}</td>
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

      {recentSessions.length === 0 && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={() => setPage('sessions')}>Log Your First Session</button>
        </div>
      )}

      {/* Tracks needing attention */}
      {neglectedTracks.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 32 }}>Needs Practice — 14+ Days</div>
          <div style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            padding: '14px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}>
            {neglectedTracks.map(t => (
              <div
                key={t.id}
                title={`${t.short} — ${t.daysSince} day${t.daysSince !== 1 ? 's' : ''} ago`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  opacity: 0.85,
                }}
                onClick={() => setPage('tracks')}
              >
                <span style={{ fontSize: 24 }}>{t.flag}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--gray-mid)' }}>{t.daysSince}d</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
