import { useState } from 'react';
import { useCreateSession, getGetSessionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { F1_TRACKS, SESSION_TYPES, F1_25_CARS } from '../data/f1Tracks';
import { LapTimeInput } from '../components/LapTimeInput';

export default function QuickLog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { mutate: createSession, isPending } = useCreateSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
        setSaved(true);
      },
      onError: () => setError('Failed to save. Please try again.'),
    },
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [trackId, setTrackId] = useState('');
  const [car, setCar] = useState('');
  const [bestLap, setBestLap] = useState('');
  const [type, setType] = useState('Practice');

  const handleSubmit = () => {
    if (!trackId || !car.trim() || !bestLap.trim()) {
      setError('Track, car, and best lap are required.');
      return;
    }
    setError('');
    createSession({
      data: {
        id: crypto.randomUUID(),
        date: new Date().toISOString().slice(0, 10),
        trackId,
        car,
        type,
        bestLap,
        avgLap: '',
        worstLap: '',
        s1: '',
        s2: '',
        s3: '',
        tires: '',
        fuelLoad: 0,
        conditions: '',
        assists: '',
        rating: 0,
        notes: '',
        penalty: '',

      },
    });
  };

  if (saved) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 48 }}>🏁</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.08em', color: 'var(--white)' }}>Session Logged!</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', textAlign: 'center', lineHeight: 1.6 }}>
          {F1_TRACKS.find(t => t.id === trackId)?.flag} {F1_TRACKS.find(t => t.id === trackId)?.short} · {bestLap} · {car}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" style={{ fontSize: 14, padding: '12px 24px' }} onClick={() => { setSaved(false); setTrackId(''); setCar(''); setBestLap(''); }}>
            Log Another
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 14, padding: '12px 24px' }} onClick={onDone}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '24px 20px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '0.1em', color: 'var(--white)', margin: 0 }}>Quick Log</h1>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={onDone}>
          Cancel
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Track */}
        <div>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', display: 'block', marginBottom: 6 }}>
            Track <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select value={trackId} onChange={e => setTrackId(e.target.value)} style={{ width: '100%', fontSize: 16, padding: '14px 12px', minHeight: 48 }}>
            <option value="">Select Track</option>
            {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
          </select>
        </div>

        {/* Car */}
        <div>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', display: 'block', marginBottom: 6 }}>
            Car <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select value={car} onChange={e => setCar(e.target.value)} style={{ width: '100%', fontSize: 16, padding: '14px 12px', minHeight: 48 }}>
            <option value="">Select Car</option>
            {F1_25_CARS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Best Lap */}
        <div>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', display: 'block', marginBottom: 6 }}>
            Best Lap <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <LapTimeInput
            value={bestLap}
            onChange={setBestLap}
            style={{ width: '100%', fontSize: 20, padding: '14px 12px', minHeight: 48, fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: '0.1em' }}
          />
        </div>

        {/* Type */}
        <div>
          <label style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray-mid)', display: 'block', marginBottom: 6 }}>
            Session Type
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SESSION_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  border: type === t ? '2px solid var(--red)' : '1px solid var(--border)',
                  borderRadius: 6,
                  background: type === t ? 'rgba(232,0,45,0.12)' : 'transparent',
                  color: type === t ? 'var(--white)' : 'var(--gray-mid)',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'rgba(232,0,45,0.08)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={isPending}
          style={{ width: '100%', fontSize: 16, padding: '16px', minHeight: 52, marginTop: 8 }}
        >
          {isPending ? 'Saving…' : 'Log Session'}
        </button>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray)', textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
        Quick Log captures the essentials. Use the full Session Log for lap-by-lap data, sectors, and conditions.
      </p>
    </div>
  );
}
