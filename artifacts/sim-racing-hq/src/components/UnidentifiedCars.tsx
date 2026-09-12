import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCarAliases,
  useUpsertCarAlias,
  getGetCarAliasesQueryKey,
  getGetSessionsQueryKey,
  type UnidentifiedCar,
} from '@workspace/api-client-react';
import { HelpCircle } from 'lucide-react';

// Cars the companion logged but couldn't name.
//
// The game reports the player's car as a numeric team id. The companion only
// translates ids someone has confirmed against a real session — guessing the
// rest is what once labelled a Mercedes "Ferrari '26" — so a car from content
// nobody has logged yet arrives as "Unknown car (#129)", and an unbranded one
// as "F1 Generic". Both are honest and neither is readable on a lap chart.
//
// The driver was there and knows what they drove, so they get to say. The name
// is stored against the team id, applied to the sessions already logged with
// it, and used for every future upload of the same car.

function CarRow({ car, onSaved }: { car: UnidentifiedCar; onSaved: (message: string) => void }) {
  const [label, setLabel] = useState('');
  const qc = useQueryClient();
  const { mutate: save, isPending, isError, reset } = useUpsertCarAlias({
    mutation: {
      onSuccess: result => {
        qc.invalidateQueries({ queryKey: getGetCarAliasesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSessionsQueryKey() });
        onSaved(
          result.sessionsUpdated === 1
            ? `Renamed 1 session to "${result.label}"`
            : `Renamed ${result.sessionsUpdated} sessions to "${result.label}"`,
        );
      },
    },
  });

  const trimmed = label.trim();
  const submit = () => {
    if (trimmed === '' || isPending) return;
    reset();
    save({ teamId: car.teamId, data: { label: trimmed } });
  };

  return (
    <tr>
      <td style={{ color: 'var(--white)', fontWeight: 600 }}>{car.car}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)' }}>{car.teamId}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{car.sessions}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)' }}>{car.lastSeen}</td>
      <td>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={label}
            maxLength={60}
            placeholder="What was it?"
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={{ minWidth: 150, flex: 1 }}
            aria-label={`Name for ${car.car}`}
          />
          <button className="btn btn-sm" onClick={submit} disabled={trimmed === '' || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {isError && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 'var(--space-1)' }}>
            Couldn't save that name — try again.
          </div>
        )}
      </td>
    </tr>
  );
}

export function UnidentifiedCars({ onToast }: { onToast: (message: string) => void }) {
  const { data } = useGetCarAliases();
  const unidentified = data?.unidentified ?? [];

  if (unidentified.length === 0) return null;

  return (
    <div className="card card-accent card-accent--teal card-pad" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
        <HelpCircle size={13} />
        {unidentified.length === 1 ? '1 car needs a name' : `${unidentified.length} cars need a name`}
      </div>
      <div className="card-text">
        Your game reported these cars by a number the companion doesn't recognise yet — new season
        content, usually. Name one and every session you've logged with it is renamed, along with
        anything you drive in it from here on.
      </div>
      <div className="table-wrap" style={{ marginTop: 'var(--space-4)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Logged as</th>
              <th>Team ID</th>
              <th>Sessions</th>
              <th>Last driven</th>
              <th>Your name for it</th>
            </tr>
          </thead>
          <tbody>
            {unidentified.map(car => (
              <CarRow key={car.teamId} car={car} onSaved={onToast} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
