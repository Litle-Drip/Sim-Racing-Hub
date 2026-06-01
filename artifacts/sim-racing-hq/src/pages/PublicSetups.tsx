import { useState, useMemo } from 'react';
import { useGetCommunitySetups } from '@workspace/api-client-react';
import type { CommunitySetupRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';

function trackLabel(id: string) {
  const t = F1_TRACKS.find(t => t.id === id);
  return t ? `${t.flag} ${t.short}` : id;
}

export default function PublicSetups({ onBack }: { onBack?: () => void }) {
  const { data: setups = [], isLoading } = useGetCommunitySetups();
  const [filterTrack, setFilterTrack] = useState('');
  const [filterCar, setFilterCar] = useState('');

  const filtered = useMemo(() => {
    return setups.filter(s => {
      if (filterTrack && s.trackId !== filterTrack) return false;
      if (filterCar && !s.car.toLowerCase().includes(filterCar.toLowerCase())) return false;
      return true;
    });
  }, [setups, filterTrack, filterCar]);

  const cars = useMemo(() => [...new Set(setups.map(s => s.car).filter(Boolean))].sort(), [setups]);

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {onBack && (
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Back
        </button>
      )}

      <h1 className="page-title" style={{ marginBottom: 8 }}>Community Setups</h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginBottom: 24, lineHeight: 1.6 }}>
        Browse F1 25 setups shared by the community. Filter by track or car to find exactly what you need.
        {' '}<strong>{setups.length}</strong> setups available.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select value={filterTrack} onChange={e => setFilterTrack(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Tracks</option>
          {F1_TRACKS.map(t => <option key={t.id} value={t.id}>{t.flag} {t.short}</option>)}
        </select>
        <select value={filterCar} onChange={e => setFilterCar(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Cars</option>
          {cars.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <div className="empty-state-title">Loading Setups…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No Setups Found</div>
          <div className="empty-state-desc">No community setups match your filters. Try adjusting them or check back later.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Setup</th>
                <th>Track</th>
                <th>Car</th>
                <th>Tag</th>
                <th>Author</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: CommunitySetupRecord) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{s.label || 'Untitled'}</td>
                  <td>{trackLabel(s.trackId)}</td>
                  <td>{s.car}</td>
                  <td>{s.tag && <span className="badge badge-practice">{s.tag}</span>}</td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{s.authorName}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.avgRating != null ? `${s.avgRating.toFixed(1)} ★` : '—'}
                    <span style={{ color: 'var(--gray-mid)', fontSize: 10, marginLeft: 4 }}>({s.ratingCount})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
