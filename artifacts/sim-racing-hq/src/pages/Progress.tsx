import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useGetSessions } from '@workspace/api-client-react';
import { lapToSeconds } from '../lib/storage';
import { F1_TRACKS } from '../data/f1Tracks';

function formatLapTime(seconds: number): string {
  if (!isFinite(seconds) || seconds === 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds - mins * 60).toFixed(3);
  return `${mins}:${parseFloat(secs) < 10 ? '0' : ''}${secs}`;
}

function formatAxisTick(seconds: number): string {
  if (!isFinite(seconds) || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}

function LapTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', padding: '10px 14px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: p.color, marginBottom: 2 }}>
          {p.name}: {formatLapTime(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function Progress() {
  const { data: allSessions = [] } = useGetSessions();
  const [filterTrack, setFilterTrack] = useState('');
  const [filterCar, setFilterCar] = useState('');

  const filtered = useMemo(() => {
    return allSessions
      .filter(s => {
        if (filterTrack && s.trackId !== filterTrack) return false;
        if (filterCar && !s.car.toLowerCase().includes(filterCar.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allSessions, filterTrack, filterCar]);

  const progressionData = useMemo(() => {
    let runningPB = Infinity;
    return filtered
      .filter(s => s.bestLap && s.bestLap.trim() !== '')
      .map(s => {
        const secs = lapToSeconds(s.bestLap);
        const isNewPB = secs < runningPB;
        if (isNewPB) runningPB = secs;
        return {
          date: s.date,
          lapSeconds: secs,
          lapFormatted: s.bestLap,
          isPB: isNewPB,
        };
      });
  }, [filtered]);

  const varianceData = useMemo(() => {
    return filtered
      .filter(s => s.bestLap && s.bestLap.trim() !== '')
      .map(s => ({
        date: s.date,
        best: lapToSeconds(s.bestLap),
        avg: s.avgLap && s.avgLap.trim() !== '' ? lapToSeconds(s.avgLap) : null,
        worst: s.worstLap && s.worstLap.trim() !== '' ? lapToSeconds(s.worstLap) : null,
      }));
  }, [filtered]);

  const allTimePBs = useMemo(() => {
    const pbMap: Record<string, { trackId: string; car: string; bestLap: string; date: string; sessions: number }> = {};
    const sessionCounts: Record<string, number> = {};

    const sessionsSorted = [...allSessions].sort((a, b) => a.date.localeCompare(b.date));

    sessionsSorted.forEach(s => {
      if (!s.bestLap || s.bestLap.trim() === '') return;
      const key = `${s.trackId}__${s.car}`;
      sessionCounts[key] = (sessionCounts[key] || 0) + 1;
      if (!pbMap[key] || lapToSeconds(s.bestLap) < lapToSeconds(pbMap[key].bestLap)) {
        pbMap[key] = {
          trackId: s.trackId,
          car: s.car,
          bestLap: s.bestLap,
          date: s.date,
          sessions: sessionCounts[key],
        };
      }
    });

    return Object.values(pbMap).sort((a, b) => a.trackId.localeCompare(b.trackId));
  }, [allSessions]);

  const trackName = (id: string) => F1_TRACKS.find(t => t.id === id)?.short || id;

  const minY = progressionData.length > 0
    ? Math.min(...progressionData.map(d => d.lapSeconds)) - 2
    : 0;
  const maxY = progressionData.length > 0
    ? Math.max(...progressionData.map(d => d.lapSeconds)) + 2
    : 100;

  const minVarianceY = varianceData.length > 0
    ? Math.min(...varianceData.map(d => d.best)) - 2
    : 0;
  const maxVarianceY = varianceData.length > 0
    ? Math.max(...varianceData.map(d => d.worst ?? d.best)) + 2
    : 100;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Progression</h1>
      </div>

      <div className="filter-bar" style={{ marginBottom: 28 }}>
        <select className="filter-select" value={filterTrack} onChange={e => setFilterTrack(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
        </select>
        <input
          className="filter-input"
          placeholder="Filter by car..."
          value={filterCar}
          onChange={e => setFilterCar(e.target.value)}
        />
      </div>

      <div className="chart-section">
        <div className="section-title">PB Progression</div>
        {!filterTrack ? (
          <div className="empty-state">
            <div className="empty-state-title">Select a Track to See PB Progression</div>
            <div className="empty-state-desc">Mixing lap times from different circuits produces a meaningless line. Choose a specific track above to see how your pace has improved over time.</div>
          </div>
        ) : progressionData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No Sessions at This Track Yet</div>
            <div className="empty-state-desc">Log a session at this circuit to start tracking your progression.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progressionData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#1E1E1E" strokeDasharray="0" />
              <XAxis
                dataKey="date"
                tick={{ fontFamily: 'var(--font-display)', fontSize: 8, fill: '#A8A8A8', letterSpacing: '0.06em' }}
                axisLine={{ stroke: '#1E1E1E' }}
                tickLine={false}
              />
              <YAxis
                domain={[minY, maxY]}
                tickFormatter={formatAxisTick}
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#A8A8A8' }}
                axisLine={{ stroke: '#1E1E1E' }}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<LapTooltip />} />
              <Line
                type="monotone"
                dataKey="lapSeconds"
                stroke="#00D2BE"
                strokeWidth={2}
                dot={({ cx, cy, payload }: { cx: number; cy: number; payload: { isPB: boolean } }) =>
                  payload.isPB ? (
                    <circle key={`pb-${cx}`} cx={cx} cy={cy} r={5} fill="#FFF200" stroke="#FFF200" strokeWidth={0} />
                  ) : (
                    <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill="#00D2BE" stroke="#00D2BE" strokeWidth={0} />
                  )
                }
                name="Best Lap"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        {progressionData.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
              <span style={{ width: 20, height: 2, background: '#00D2BE', display: 'inline-block' }} />
              Best Lap
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFF200', display: 'inline-block' }} />
              New PB
            </div>
          </div>
        )}
      </div>

      <div className="chart-section">
        <div className="section-title">Lap Time Variance</div>
        {varianceData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No Data Yet</div>
            <div className="empty-state-desc">Log sessions with best, avg, and worst laps to see variance.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={varianceData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#1E1E1E" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontFamily: 'var(--font-display)', fontSize: 8, fill: '#A8A8A8', letterSpacing: '0.06em' }}
                axisLine={{ stroke: '#1E1E1E' }}
                tickLine={false}
              />
              <YAxis
                domain={[minVarianceY, maxVarianceY]}
                tickFormatter={formatAxisTick}
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#A8A8A8' }}
                axisLine={{ stroke: '#1E1E1E' }}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<LapTooltip />} />
              <Bar dataKey="best" name="Best" fill="#00D2BE" />
              <Bar dataKey="avg" name="Average" fill="#555555" />
              <Bar dataKey="worst" name="Worst" fill="rgba(232,0,45,0.4)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="section-title">All-Time Personal Bests</div>
      {allTimePBs.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">No PBs Recorded Yet</div>
            <div className="empty-state-desc">Log sessions to start building your personal best records across all tracks.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Car</th>
                <th>PB Time</th>
                <th>Date Set</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {allTimePBs.map((pb, i) => (
                <tr key={i}>
                  <td>
                    {F1_TRACKS.find(t => t.id === pb.trackId)?.flag} {trackName(pb.trackId)}
                  </td>
                  <td style={{ color: 'var(--white)', fontWeight: 600 }}>{pb.car}</td>
                  <td><span className="pb-time">{pb.bestLap}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{pb.date}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)' }}>{pb.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
