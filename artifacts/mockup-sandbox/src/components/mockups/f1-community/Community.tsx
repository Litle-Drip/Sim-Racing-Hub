import { useState } from 'react';

const C = {
  bg: '#080808',
  card: '#111111',
  elevated: '#1A1A1A',
  border: '#1E1E1E',
  borderAccent: '#2A2A2A',
  red: '#E8002D',
  redDim: 'rgba(232,0,45,0.10)',
  teal: '#00D2BE',
  yellow: '#FFF200',
  white: '#F0F0F0',
  gray: '#777777',
  grayMid: '#A8A8A8',
  grayLight: '#C8C8C8',
  display: "'Orbitron', monospace",
  body: "'Rajdhani', sans-serif",
  mono: "'Space Mono', monospace",
};

const leaderboard = [
  { flag: '🇲🇨', track: 'Monaco', time: '1:09.841', driver: 'SkylineRacer', car: 'Ferrari SF-25', type: 'Qualifying' },
  { flag: '🇮🇹', track: 'Monza', time: '1:21.203', driver: 'PitLaneAlex', car: 'Red Bull RB21', type: 'Qualifying' },
  { flag: '🇬🇧', track: 'Silverstone', time: '1:25.731', driver: 'TarmacTyler', car: 'Mercedes W16', type: 'Qualifying' },
  { flag: '🇦🇺', track: 'Melbourne', time: '1:18.432', driver: 'DownforceKing', car: 'McLaren MCL39', type: 'Race' },
  { flag: '🇧🇭', track: 'Bahrain', time: '1:31.558', driver: 'SkylineRacer', car: 'Ferrari SF-25', type: 'Qualifying' },
  { flag: '🇸🇦', track: 'Jeddah', time: '1:27.315', driver: 'NightDriver99', car: 'Aston Martin AMR25', type: 'Race' },
  { flag: '🇯🇵', track: 'Suzuka', time: '1:30.112', driver: 'TarmacTyler', car: 'Mercedes W16', type: 'Qualifying' },
  { flag: '🇨🇳', track: 'Shanghai', time: '1:33.664', driver: 'PitLaneAlex', car: 'Red Bull RB21', type: 'Practice' },
];

const sessions = [
  { time: '1:09.841', track: '🇲🇨 Monaco', car: 'Ferrari SF-25', type: 'Qualifying', driver: 'SkylineRacer', laps: 18, date: 'Jun 24' },
  { time: '1:21.847', track: '🇮🇹 Monza', car: 'Red Bull RB21', type: 'Race', driver: 'PitLaneAlex', laps: 53, date: 'Jun 20' },
  { time: '1:25.142', track: '🇬🇧 Silverstone', car: 'McLaren MCL39', type: 'Qualifying', driver: 'DownforceKing', laps: 12, date: 'Jun 18' },
  { time: '1:31.558', track: '🇧🇭 Bahrain', car: 'Ferrari SF-25', type: 'Practice', driver: 'SkylineRacer', laps: 24, date: 'Jun 15' },
  { time: '1:18.432', track: '🇦🇺 Melbourne', car: 'Red Bull RB21', type: 'Race', driver: 'NightDriver99', laps: 58, date: 'Jun 12' },
];

const setups = [
  { label: 'Monaco Low-Drag Q Setup', car: 'Ferrari SF-25', track: '🇲🇨 Monaco', tag: 'Qualifying', rating: 4.8, count: 12, author: 'SkylineRacer', wing: '11 / 8', bias: '56%' },
  { label: 'Monza Slipstream Killer', car: 'Red Bull RB21', track: '🇮🇹 Monza', tag: 'Race', rating: 4.5, count: 8, author: 'PitLaneAlex', wing: '3 / 2', bias: '54%' },
  { label: 'Silverstone All-Weather', car: 'Mercedes W16', track: '🇬🇧 Silverstone', tag: 'Wet', rating: 4.2, count: 5, author: 'TarmacTyler', wing: '8 / 7', bias: '57%' },
  { label: 'Bahrain High-Traction Setup', car: 'McLaren MCL39', track: '🇧🇭 Bahrain', tag: 'Race', rating: 4.0, count: 3, author: 'DownforceKing', wing: '7 / 6', bias: '55%' },
];

const typeBadge: Record<string, { bg: string; color: string }> = {
  Qualifying: { bg: 'rgba(255,242,0,0.12)', color: '#FFF200' },
  Race:       { bg: 'rgba(232,0,45,0.15)',  color: '#E8002D' },
  Practice:   { bg: 'rgba(0,210,190,0.13)', color: '#00D2BE' },
  Wet:        { bg: 'rgba(0,120,255,0.15)', color: '#5599ff' },
};

function Badge({ type }: { type: string }) {
  const style = typeBadge[type] ?? typeBadge.Practice;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      fontFamily: C.display,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: style.bg,
      color: style.color,
    }}>
      {type}
    </span>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: C.yellow, fontSize: 12, letterSpacing: 1 }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      <span style={{ fontFamily: C.body, fontSize: 11, color: C.grayMid, marginLeft: 4 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export default function Community() {
  const [tab, setTab] = useState<'leaderboard' | 'sessions' | 'setups'>('leaderboard');

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: C.body }}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800;900&family=Rajdhani:wght@400;500;600;700&family=Space+Mono&display=swap" rel="stylesheet" />

      {/* Sidebar + Content layout */}
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* Sidebar */}
        <nav style={{ width: 240, minWidth: 240, background: C.card, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', padding: '28px 0 0' }}>
          <div style={{ padding: '0 20px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: C.display, fontSize: 13, fontWeight: 800, color: C.red, letterSpacing: '0.12em', textTransform: 'uppercase', borderBottom: `2px solid ${C.red}`, paddingBottom: 6, marginBottom: 6, display: 'inline-block' }}>F1 Sim Hub</div>
            <div style={{ fontFamily: C.body, fontSize: 10, color: C.grayMid, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Driver Dashboard</div>
          </div>
          <ul style={{ listStyle: 'none', padding: '16px 0', flex: 1, margin: 0 }}>
            {[
              { label: 'Dashboard', icon: '▪' },
              { label: 'Sessions', icon: '▪' },
              { label: 'Progress', icon: '▪' },
              { label: 'Setups', icon: '▪' },
              { label: 'Hardware', icon: '▪' },
              { label: 'Race Engineer', icon: '▪' },
              { label: 'Community', icon: '▪', active: true },
              { label: 'Account', icon: '▪' },
            ].map(({ label, active }) => (
              <li key={label}>
                <div style={{
                  padding: '11px 20px',
                  fontFamily: C.display,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: active ? C.red : C.grayMid,
                  borderLeft: `3px solid ${active ? C.red : 'transparent'}`,
                  background: active ? C.redDim : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}>
                  {label}
                </div>
              </li>
            ))}
          </ul>
          {/* Profile */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.redDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.display, fontSize: 12, fontWeight: 700, color: C.red, flexShrink: 0 }}>A</div>
            <div>
              <div style={{ fontFamily: C.display, fontSize: 11, fontWeight: 700, color: C.white }}>Alex</div>
              <div style={{ fontFamily: C.display, fontSize: 10, color: '#FFD700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Gold</div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '32px 36px', maxWidth: 1200 }}>

            {/* Weekly Challenge */}
            <div style={{ background: C.card, border: '1px solid rgba(232,0,45,0.3)', marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ background: 'rgba(232,0,45,0.08)', padding: '14px 20px', borderBottom: '1px solid rgba(232,0,45,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: C.display, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red }}>Weekly Challenge</div>
                  <div style={{ fontFamily: C.display, fontSize: 14, letterSpacing: '0.06em', color: C.white, marginTop: 4 }}>🇮🇹 Fastest Lap at Monza</div>
                </div>
                <span style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>Share a session at Monza to compete · Resets Monday</span>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { pos: 1, time: '1:21.203', driver: 'PitLaneAlex', car: 'Red Bull RB21' },
                  { pos: 2, time: '1:21.847', driver: 'SkylineRacer', car: 'Ferrari SF-25' },
                  { pos: 3, time: '1:22.415', driver: 'TarmacTyler', car: 'Mercedes W16' },
                ].map(({ pos, time, driver, car }) => (
                  <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: C.body, fontSize: 13 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: pos === 1 ? C.teal : C.grayMid, width: 16 }}>{pos}.</span>
                    <span style={{ fontFamily: C.mono, fontSize: 13, color: pos === 1 ? C.yellow : C.teal, fontWeight: 700 }}>{time}</span>
                    <span style={{ color: C.grayLight }}>{driver}</span>
                    <span style={{ color: C.grayMid, marginLeft: 'auto', fontSize: 12 }}>{car}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h1 style={{ fontFamily: C.display, fontSize: 20, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.white, margin: 0 }}>Community</h1>
              <span style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>
                {tab === 'leaderboard' ? '8 tracks · updated live' : tab === 'sessions' ? '5 shared sessions' : '4 shared setups'}
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
              {(['leaderboard', 'sessions', 'setups'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === t ? `2px solid ${C.red}` : '2px solid transparent',
                    color: tab === t ? C.white : C.grayMid,
                    fontFamily: C.display,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    marginBottom: -1,
                    transition: 'color 0.15s',
                  }}
                >
                  {t === 'leaderboard' ? 'Leaderboard' : t === 'sessions' ? 'Sessions' : 'Setups'}
                </button>
              ))}
            </div>

            {/* Leaderboard tab */}
            {tab === 'leaderboard' && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#', 'Track', 'Best Lap', 'Driver', 'Car', 'Type'].map(h => (
                        <th key={h} style={{ fontFamily: C.display, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gray, padding: '11px 16px', textAlign: 'left', borderBottom: `1px solid ${C.borderAccent}`, background: C.elevated, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(({ flag, track, time, driver, car, type }, i) => (
                      <tr key={track} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '12px 16px', fontFamily: C.mono, fontSize: 12, color: C.gray }}>{i + 1}</td>
                        <td style={{ padding: '12px 16px', fontFamily: C.body, fontSize: 14, fontWeight: 600, color: C.white }}>{flag} {track}</td>
                        <td style={{ padding: '12px 16px', fontFamily: C.mono, fontSize: 13, color: C.teal }}>{time}</td>
                        <td style={{ padding: '12px 16px', fontFamily: C.body, fontSize: 13, color: C.grayLight }}>{driver}</td>
                        <td style={{ padding: '12px 16px', fontFamily: C.body, fontSize: 13, color: C.grayMid }}>{car}</td>
                        <td style={{ padding: '12px 16px' }}><Badge type={type} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sessions tab */}
            {tab === 'sessions' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {sessions.map(({ time, track, car, type, driver, laps, date }) => (
                  <div key={time + track} style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.borderAccent}`, padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 20, color: C.teal, marginBottom: 4 }}>{time}</div>
                        <div style={{ fontFamily: C.body, fontSize: 13, fontWeight: 600, color: C.white }}>{track}</div>
                        <div style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>{car}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <Badge type={type} />
                        <span style={{ fontFamily: C.body, fontSize: 11, color: C.gray }}>{driver}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>{laps} laps</span>
                      <span style={{ fontFamily: C.body, fontSize: 11, color: C.gray }}>{date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Setups tab */}
            {tab === 'setups' && (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                  {['All Tracks', 'All Tags', 'All Cars'].map(f => (
                    <div key={f} style={{ background: C.card, border: `1px solid ${C.borderAccent}`, color: C.grayLight, padding: '8px 12px', fontFamily: C.body, fontSize: 13, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {f} <span style={{ color: C.gray, fontSize: 10 }}>▾</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                  {setups.map(({ label, car, track, tag, rating, count, author, wing, bias }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.red}`, padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontFamily: C.display, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: C.white, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>{car}</div>
                          <div style={{ fontFamily: C.body, fontSize: 12, color: C.grayMid }}>{track}</div>
                        </div>
                        <Badge type={tag} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14, padding: '10px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                        {[['Front / Rear Wing', wing], ['Brake Bias', bias]].map(([k, v]) => (
                          <div key={k} style={{ gridColumn: k === 'Front / Rear Wing' ? 'span 2' : 'span 1' }}>
                            <div style={{ fontFamily: C.display, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gray, marginBottom: 3 }}>{k}</div>
                            <div style={{ fontFamily: C.mono, fontSize: 13, color: C.white }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <Stars rating={rating} />
                          <div style={{ fontFamily: C.body, fontSize: 11, color: C.gray, marginTop: 2 }}>({count} ratings) · {author}</div>
                        </div>
                        <button style={{ background: 'transparent', border: `1px solid ${C.borderAccent}`, color: C.grayLight, fontFamily: C.display, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>
                          Import
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
