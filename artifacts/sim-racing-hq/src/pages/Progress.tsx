import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useGetSessions } from '@workspace/api-client-react';
import { lapToSeconds } from '../lib/storage';
import { F1_TRACKS } from '../data/f1Tracks';
import { lapTimeDelta, sessionConsistency } from '../lib/engagement';
import { LapTimeInput } from '../components/LapTimeInput';
import { EmptyState } from '../components/EmptyState';
import { TrendingUp } from 'lucide-react';

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

export default function Progress({ setPage }: { setPage?: (p: string) => void }) {
  const { data: allSessions = [] } = useGetSessions();
  const [filterTrack, setFilterTrack] = useState(() => sessionStorage.getItem('progress-track') || '');
  const [filterCar, setFilterCar] = useState('');

  const handleTrackChange = (v: string) => {
    setFilterTrack(v);
    sessionStorage.setItem('progress-track', v);
  };

  // Auto-select the most recently used car when track filter changes
  useEffect(() => {
    if (!filterTrack) { setFilterCar(''); return; }
    const trackSessions = allSessions.filter(s => s.trackId === filterTrack);
    if (trackSessions.length === 0) { setFilterCar(''); return; }
    const latestCar = [...trackSessions].sort((a, b) => b.date.localeCompare(a.date))[0].car;
    setFilterCar(latestCar);
  }, [filterTrack, allSessions]);

  // Unique cars for the selected track (for dropdown)
  const carsForTrack = useMemo(() => {
    if (!filterTrack) return [];
    const cars = [...new Set(allSessions.filter(s => s.trackId === filterTrack).map(s => s.car).filter(Boolean))];
    return cars.sort();
  }, [allSessions, filterTrack]);

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

      {allSessions.length === 0 ? (
        <div style={{ marginTop: 40 }}>
          <EmptyState
            icon={<TrendingUp size={40} />}
            headline="No sessions logged yet"
            subtext="Personal bests are tracked automatically from your session data — best lap, average lap, and worst lap. Log your first session to see your progression charts come to life."
            ctaLabel="Log a Session"
            onCta={() => setPage?.('sessions')}
          />
        </div>
      ) : (
      <>
      <div className="filter-bar" style={{ marginBottom: 28 }}>
        <select className="filter-select" value={filterTrack} onChange={e => handleTrackChange(e.target.value)}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
        </select>
        <select
          className="filter-select"
          value={filterCar}
          onChange={e => setFilterCar(e.target.value)}
          disabled={carsForTrack.length === 0}
        >
          <option value="">All Cars</option>
          {carsForTrack.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
        {!filterTrack ? (
          <div className="empty-state">
            <div className="empty-state-title">Select a Track</div>
            <div className="empty-state-desc">Choose a specific track above to see lap time variance.</div>
          </div>
        ) : varianceData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No Data Yet</div>
            <div className="empty-state-desc">Log sessions with best, avg, and worst laps to see variance.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={varianceData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#1E1E1E" strokeDasharray="0" />
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
              <Line type="monotone" dataKey="worst" name="Worst" stroke="rgba(232,0,45,0.6)" strokeWidth={1.5} dot={{ r: 3, fill: 'rgba(232,0,45,0.6)' }} />
              <Line type="monotone" dataKey="avg" name="Average" stroke="#555555" strokeWidth={1.5} dot={{ r: 3, fill: '#555555' }} />
              <Line type="monotone" dataKey="best" name="Best" stroke="#00D2BE" strokeWidth={2} dot={{ r: 3, fill: '#00D2BE' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {filterTrack && varianceData.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
              <span style={{ width: 20, height: 2, background: '#00D2BE', display: 'inline-block' }} />
              Best
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
              <span style={{ width: 20, height: 2, background: '#555555', display: 'inline-block' }} />
              Average
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
              <span style={{ width: 20, height: 2, background: 'rgba(232,0,45,0.6)', display: 'inline-block' }} />
              Worst
            </div>
          </div>
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
      {/* Best Sectors per Track */}
      {filterTrack && (() => {
        type SectorEntry = { val: string; secs: number; date: string; car: string };
        const bestSectors: { s1: SectorEntry | null; s2: SectorEntry | null; s3: SectorEntry | null } = { s1: null, s2: null, s3: null };
        filtered.forEach(s => {
          const laps = (s.laps ?? []) as Array<{ s1: string; s2: string; s3: string }>;
          const checkSector = (key: 's1' | 's2' | 's3', val: string) => {
            if (!val || !val.trim()) return;
            const secs = parseFloat(val);
            if (isNaN(secs) || secs <= 0) return;
            if (!bestSectors[key] || secs < bestSectors[key]!.secs) {
              bestSectors[key] = { val, secs, date: s.date, car: s.car };
            }
          };
          if (laps.length > 0) {
            laps.forEach(l => { checkSector('s1', l.s1); checkSector('s2', l.s2); checkSector('s3', l.s3); });
          } else {
            checkSector('s1', s.s1); checkSector('s2', s.s2); checkSector('s3', s.s3);
          }
        });
        const hasSectors = bestSectors.s1 || bestSectors.s2 || bestSectors.s3;
        if (!hasSectors) return null;
        return (
          <>
            <div className="section-title" style={{ marginTop: 40 }}>Best Sectors — {trackName(filterTrack)}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {(['s1', 's2', 's3'] as const).map(key => {
                const s = bestSectors[key];
                if (!s) return null;
                return (
                  <div key={key} className="card" style={{ flex: '1 1 140px', padding: '16px 20px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 8 }}>
                      Sector {key.slice(1)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: '#a855f7', fontWeight: 700 }}>{s.val}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 6 }}>{s.car} · {s.date}</div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Consistency Trend */}
      <div className="section-title" style={{ marginTop: 40 }}>Consistency Score Trend</div>
      {!filterTrack ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-title">Select a Track</div>
            <div className="empty-state-desc">Pick a specific track above to see your consistency trend.</div>
          </div>
        </div>
      ) : (() => {
        const consistencyData = filtered
          .filter(s => s.bestLap && s.bestLap.trim() !== '' && s.avgLap && s.avgLap.trim() !== '')
          .map(s => ({ date: s.date, consistency: sessionConsistency(s) }))
          .filter((d): d is { date: string; consistency: number } => d.consistency !== null);
        return consistencyData.length < 2 ? (
          <div className="table-wrap">
            <div className="empty-state">
              <div className="empty-state-desc">Log more sessions with best and average lap times to see your consistency trend.</div>
            </div>
          </div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={consistencyData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }} />
                <YAxis domain={[90, 100]} tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--gray-mid)' }} tickFormatter={v => `${v}%`} />
                <Tooltip content={({ active, payload, label }) => active && payload && payload.length > 0 ? (
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--teal)' }}>{(payload[0].value as number).toFixed(1)}%</div>
                  </div>
                ) : null} />
                <Line type="monotone" dataKey="consistency" stroke="var(--teal)" strokeWidth={2} dot={{ fill: 'var(--teal)', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Lap Time Delta Tool */}
      <LapTimeDeltaTool />
      </>
      )}
    </div>
  );
}

function LapTimeDeltaTool() {
  const [time1, setTime1] = useState('');
  const [time2, setTime2] = useState('');
  const result = lapTimeDelta(time1, time2);

  return (
    <div style={{ marginTop: 40 }}>
      <div className="section-title">Lap Time Delta Tool</div>
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Time 1</label>
            <LapTimeInput value={time1} onChange={setTime1} style={{ width: 140 }} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gray)', marginTop: 16 }}>vs</span>
          <div>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Time 2</label>
            <LapTimeInput value={time2} onChange={setTime2} style={{ width: 140 }} />
          </div>
        </div>
        {result && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>Gap</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--teal)', marginTop: 4 }}>
                {result.diffMs >= 1000 ? `${(result.diffMs / 1000).toFixed(3)}s` : `${result.diffMs}ms`}
              </div>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>Percentage</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--white)', marginTop: 4 }}>
                {result.diffPercent.toFixed(2)}%
              </div>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--gray-mid)', textTransform: 'uppercase' }}>Faster</span>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--white)', marginTop: 4 }}>
                Time {result.faster}
              </div>
            </div>
          </div>
        )}
        {!result && (time1 || time2) && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)' }}>
            Enter both lap times in M:SS.SSS format to compare
          </div>
        )}
      </div>
    </div>
  );
}
