import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCarAliases,
  useUpsertCarAlias,
  getGetCarAliasesQueryKey,
  getGetSessionsQueryKey,
  type UnidentifiedCar,
} from '@workspace/api-client-react';
import { HelpCircle, X } from 'lucide-react';

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

// The driver can close the card when they can't remember what they drove —
// easy to lose track of after a long race. Closing hides the cars listed at
// that moment, by team id, in this browser; a car that turns up unnamed later
// brings the card back with just that car on it.
const DISMISSED_KEY = 'f1simhub-unidentified-cars-dismissed';

function readDismissed(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: number[]) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

// "27 Sep, 8:42 pm" in the driver's own time zone. The date on its own can't
// tell apart two cars driven the same day; the time of the last session can.
function formatLastDriven(car: UnidentifiedCar): string {
  const at = new Date(car.lastSeenAt);
  if (Number.isNaN(at.getTime())) return car.lastSeen;
  const date = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

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
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gray-mid)', whiteSpace: 'nowrap' }}>{formatLastDriven(car)}</td>
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
  const [dismissed, setDismissed] = useState(readDismissed);
  const unidentified = (data?.unidentified ?? []).filter(car => !dismissed.includes(car.teamId));

  if (unidentified.length === 0) return null;

  const dismiss = () => {
    const ids = [...dismissed, ...unidentified.map(car => car.teamId)];
    writeDismissed(ids);
    setDismissed(ids);
  };

  return (
    <div className="card card-accent card-accent--teal card-pad" style={{ marginBottom: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          <HelpCircle size={13} />
          {unidentified.length === 1 ? '1 car needs a name' : `${unidentified.length} cars need a name`}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={dismiss}
          aria-label="Close — I don't remember these cars"
          title="Close — I don't remember these cars"
          style={{ flexShrink: 0, padding: 'var(--space-1)' }}
        >
          <X size={14} />
        </button>
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
