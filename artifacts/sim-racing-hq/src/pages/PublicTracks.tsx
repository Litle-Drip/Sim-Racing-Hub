import { F1_TRACKS, CORNER_NAMES } from '../data/f1Tracks';

const TRACK_INFO: Record<string, { drs: number; length: string; note: string }> = {
  bahrain: { drs: 3, length: '5.412 km', note: 'High tyre degradation. Heavy braking zones. Night race.' },
  jeddah: { drs: 3, length: '6.174 km', note: 'Fastest street circuit. Narrow walls. High-speed blind corners.' },
  albert_park: { drs: 3, length: '5.278 km', note: 'Semi-street circuit. Bumpy surface. Low-grip off-line.' },
  suzuka: { drs: 2, length: '5.807 km', note: 'Figure-of-eight layout. Technical S-curves. Fast and flowing.' },
  shanghai: { drs: 2, length: '5.451 km', note: 'Long back straight. Heavy braking into T14 hairpin.' },
  miami: { drs: 3, length: '5.412 km', note: 'Street circuit with high-speed sections. Bumpy surface.' },
  imola: { drs: 2, length: '4.909 km', note: 'Old-school flow. Elevation changes. Narrow run-off.' },
  monaco: { drs: 1, length: '3.337 km', note: 'Shortest, slowest circuit. Zero margin for error. Overtaking nearly impossible.' },
  barcelona: { drs: 2, length: '4.657 km', note: 'Benchmark testing circuit. High-speed final sector.' },
  montreal: { drs: 2, length: '4.361 km', note: 'Wall of Champions. Stop-start layout. Street circuit with kerbs.' },
  red_bull_ring: { drs: 2, length: '4.318 km', note: 'Short lap. Steep elevation changes. Heavy braking zones.' },
  silverstone: { drs: 2, length: '5.891 km', note: 'Fast and flowing. Maggots-Becketts-Chapel iconic complex.' },
  hungaroring: { drs: 1, length: '4.381 km', note: 'Twisty, Monaco without walls. Low overtaking. Aero-dependent.' },
  spa: { drs: 2, length: '7.004 km', note: 'Longest circuit. Eau Rouge iconic. Unpredictable weather.' },
  zandvoort: { drs: 1, length: '4.259 km', note: 'Banked corners. Narrow track. Beach-side winds.' },
  monza: { drs: 2, length: '5.793 km', note: 'Temple of Speed. Low downforce. Heavy braking chicanes.' },
  baku: { drs: 2, length: '6.003 km', note: 'Street circuit. Castle section narrow. Massive straight.' },
  marina_bay: { drs: 3, length: '4.940 km', note: 'Night street race. Bumpy. High physical demand.' },
  cota: { drs: 2, length: '5.513 km', note: 'Elevation change into T1. Multi-apex corners. Technical.' },
  rodriguez: { drs: 3, length: '4.304 km', note: 'High altitude reduces downforce. Stadium section unique.' },
  interlagos: { drs: 2, length: '4.309 km', note: 'Anti-clockwise. Elevation changes. Unpredictable weather.' },
  las_vegas: { drs: 2, length: '6.201 km', note: 'Night race. Long straights. Low-grip surface.' },
  losail: { drs: 2, length: '5.380 km', note: 'Fast and flowing. Medium-speed corners. Night race.' },
  yas_marina: { drs: 2, length: '5.281 km', note: 'Season finale venue. Hotel section technical. Night race.' },
};

export default function PublicTracks({ onBack }: { onBack?: () => void }) {
  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {onBack && (
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Back
        </button>
      )}

      <h1 className="page-title" style={{ marginBottom: 8 }}>F1 2025 Circuit Guide</h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginBottom: 28, lineHeight: 1.6 }}>
        All {F1_TRACKS.length} circuits on the F1 25 calendar. Corner names, DRS zones, track length, and key characteristics for every circuit.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {F1_TRACKS.map(track => {
          const info = TRACK_INFO[track.id];
          const corners = CORNER_NAMES[track.id] || [];
          const named = corners.filter(c => !c.match(/^Turn \d+$/));
          return (
            <div key={track.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{track.flag}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--white)', letterSpacing: '0.04em' }}>{track.name}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 2 }}>{track.country}</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Corners</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--teal)', marginTop: 2 }}>{track.corners}</div>
                </div>
                {info && (
                  <>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>Length</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--white)', marginTop: 2 }}>{info.length}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>DRS Zones</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--white)', marginTop: 2 }}>{info.drs}</div>
                    </div>
                  </>
                )}
              </div>

              {info && (
                <div style={{ padding: '0 20px 14px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-light)', lineHeight: 1.5 }}>
                  {info.note}
                </div>
              )}

              {named.length > 0 && (
                <div style={{ padding: '0 20px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', marginBottom: 6 }}>Key Corners</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {named.map(n => (
                      <span key={n} className="badge badge-practice" style={{ fontSize: 10 }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
