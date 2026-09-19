import { useState, useMemo } from 'react';
import { Check, Flag, Swords, Trophy } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetRivalChallenges,
  useCreateRivalChallenge,
  useSubmitRivalChallengeAttempt,
  useCancelRivalChallenge,
  useMarkRivalChallengeSeen,
  useGetFriends,
  lookupRivalChallengeUser,
  getGetRivalChallengesQueryKey,
  useGetSessions,
} from '@workspace/api-client-react';
import type { RivalChallengeRecord, SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { Toast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { isAwaitingMyAttempt, isUnseenResult } from '../lib/rivalNotifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trackLabel(id: string): string {
  const t = F1_TRACKS.find(t => t.id === id);
  return t ? `${t.flag} ${t.short}` : id;
}

function secsToClock(secs: number): string {
  const m = Math.floor(secs / 60);
  const rem = secs - m * 60;
  return `${m}:${rem.toFixed(3).padStart(6, '0')}`;
}

function lapCountLabel(n: number): string {
  return n <= 1 ? 'Time Trial · Best Lap' : `${n}-Lap Race`;
}

function sortedByRecent(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// The time the challenger set — what the other driver actually has to beat.
// A 1-lap challenge is judged on best lap, so show the lap itself; anything
// longer is judged on total race time, so show that.
function targetTime(c: RivalChallengeRecord): string | null {
  if (!c.creatorSession) return null;
  if (c.lapCount <= 1) return c.creatorSession.bestLap || null;
  return c.creatorSession.raceTimeSeconds != null ? secsToClock(c.creatorSession.raceTimeSeconds) : null;
}

// How a finished challenge reads to the driver looking at it.
function resultFor(c: RivalChallengeRecord): 'won' | 'lost' | 'draw' {
  if (!c.winnerUserId) return 'draw';
  const me = c.creator.isMe ? c.creator.userId : c.opponent.userId;
  return c.winnerUserId === me ? 'won' : 'lost';
}

function resultHeadline(c: RivalChallengeRecord): string {
  const them = c.creator.isMe ? c.opponent.name : c.creator.name;
  switch (resultFor(c)) {
    case 'won': return `You beat ${them}`;
    case 'lost': return `${them} beat you`;
    default: return `You and ${them} couldn't be separated`;
  }
}

function resultColor(c: RivalChallengeRecord): string {
  switch (resultFor(c)) {
    case 'won': return 'var(--teal)';
    case 'lost': return 'var(--red)';
    default: return 'var(--gray-mid)';
  }
}

// ─── Challenge Card ───────────────────────────────────────────────────────────

function ChallengeCard({
  challenge: c,
  onSubmitAttempt,
  onCancel,
  cancelling,
}: {
  challenge: RivalChallengeRecord;
  onSubmitAttempt: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const isYourTurn = c.status === 'pending' && c.opponent.isMe;
  const isWaiting = c.status === 'pending' && c.creator.isMe;
  const winner = c.winnerUserId === c.creator.userId ? c.creator : c.winnerUserId === c.opponent.userId ? c.opponent : null;

  return (
    <div className="card" style={{ padding: 'var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.03em' }}>
            {trackLabel(c.trackId)} · {c.car}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)', marginTop: 'var(--space-1)' }}>
            {lapCountLabel(c.lapCount)} · {c.creator.name}{c.creator.isMe ? ' (You)' : ''} vs {c.opponent.name}{c.opponent.isMe ? ' (You)' : ''}
          </div>
          {c.message && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
              "{c.message}"
            </div>
          )}
        </div>
        <span className={`badge ${c.status === 'completed' ? 'badge-hotlap' : 'badge-qualifying'}`}>
          {c.status === 'completed' ? 'Completed' : isYourTurn ? 'Your Turn' : 'Pending'}
        </span>
      </div>

      {c.status === 'completed' && c.opponentSession ? (
        <>
          <div className="table-wrap" style={{ marginTop: 'var(--space-4)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Best Lap</th>
                  <th>Avg Lap</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  {c.lapCount > 1 && <th>Race Time</th>}
                </tr>
              </thead>
              <tbody>
                {[
                  { p: c.creator, s: c.creatorSession },
                  { p: c.opponent, s: c.opponentSession },
                ].map(({ p, s }) => s && (
                  <tr key={p.userId}>
                    <td style={{ color: 'var(--white)', fontWeight: 600 }}>
                      {p.userId === c.winnerUserId && <Trophy size={12} style={{ color: 'var(--yellow)', marginRight: 5, verticalAlign: 'middle' }} />}
                      {p.name}{p.isMe ? ' (You)' : ''}
                    </td>
                    <td><span className="lap-time">{s.bestLap || '—'}</span></td>
                    <td style={{ color: 'var(--gray-light)', fontSize: 12 }}>{s.avgLap || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.s1 || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.s2 || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.s3 || '—'}</td>
                    {c.lapCount > 1 && (
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--teal)' }}>
                        {s.raceTimeSeconds != null ? secsToClock(s.raceTimeSeconds) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: resultColor(c) }}>
            <Flag size={13} aria-hidden="true" />
            {winner ? `${winner.name}${winner.isMe ? ' (You)' : ''} wins` : 'Dead heat — nothing between them'}
          </div>
        </>
      ) : (
        <>
          {/* The time on the table and the move you make about it sit on one
              row. Both drivers see the target from the moment the challenge is
              sent — the whole point is knowing what you have to beat before
              you go out — and the action belongs next to it, not in a band of
              its own below. */}
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>
                Time to beat
              </span>
              <span className="lap-time" style={{ fontSize: 18 }}>{targetTime(c) ?? '—'}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>
                set by {c.creator.name}{c.creator.isMe ? ' (You)' : ''}
                {c.lapCount > 1 ? ` across ${c.lapCount} laps` : ''}
              </span>
            </div>

            {isYourTurn && (
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={onSubmitAttempt}>
                Submit Your Attempt
              </button>
            )}
            {isWaiting && (
              <>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)', marginLeft: 'auto' }}>
                  Waiting for {c.opponent.name} to respond
                </span>
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={onCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel Challenge'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── New Challenge Modal ──────────────────────────────────────────────────────

function NewChallengeModal({
  sessions,
  onClose,
  onCreated,
  onError,
}: {
  sessions: SessionRecord[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const sorted = useMemo(() => sortedByRecent(sessions), [sessions]);
  const [sessionId, setSessionId] = useState(sorted[0]?.id ?? '');
  const selectedSession = sorted.find(s => s.id === sessionId) ?? null;
  const [username, setUsername] = useState('');
  const [opponent, setOpponent] = useState<{ userId: string; name: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [isRace, setIsRace] = useState(false);
  const [lapCount, setLapCount] = useState(5);
  const [message, setMessage] = useState('');

  const availableLaps = selectedSession?.laps?.filter(l => l.time && l.time.trim() !== '').length ?? 0;

  // Accepted friends are the people you challenge most, and they're already
  // resolved — picking one skips the lookup round-trip entirely.
  const { data: friendData } = useGetFriends();
  const friends = friendData?.friends ?? [];

  const pickFriend = (name: string) => {
    setLookupError('');
    const friend = friends.find(f => f.username === name);
    if (!friend) {
      // "Someone else" — fall back to typing a username.
      setUsername('');
      setOpponent(null);
      return;
    }
    setUsername(friend.username);
    setOpponent({ userId: friend.userId, name: friend.username });
  };

  const handleFind = async () => {
    const name = username.trim();
    if (!name) return;
    setLooking(true);
    setLookupError('');
    setOpponent(null);
    try {
      const result = await lookupRivalChallengeUser({ username: name });
      setOpponent({ userId: result.userId, name: result.name });
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } } | null;
      const serverMessage = err?.data?.error;
      setLookupError(
        err?.status === 404
          ? "Couldn't find that username — check the spelling, it has to match their profile username exactly"
          // 400 is the "that's you" case; show what the server actually said
          // rather than a generic failure the driver can't act on.
          : err?.status === 400 && serverMessage
          ? serverMessage
          : 'Something went wrong looking that user up',
      );
    } finally {
      setLooking(false);
    }
  };

  const { mutate: create, isPending } = useCreateRivalChallenge({
    mutation: {
      onSuccess: onCreated,
      onError: (e) => {
        const message = (e as { data?: { error?: string } } | null)?.data?.error;
        onError(message ? `Failed to send challenge — ${message}` : 'Failed to send challenge');
      },
    },
  });

  const handleSubmit = () => {
    if (!sessionId || !opponent) return;
    create({
      data: {
        sessionId,
        // The resolved username from the lookup, not the raw typed text —
        // the server looks the opponent up again, and this way a casing
        // difference can't make the second lookup disagree with the first.
        opponentUsername: opponent.name,
        lapCount: isRace ? lapCount : 1,
        message: message.trim() || undefined,
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">Challenge Someone</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {sorted.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', lineHeight: 1.6 }}>
              Log a session first — you need a lap or race on record to challenge someone to beat it.
            </p>
          ) : (
            <div className="form-stack">
              <div className="field">
                <label className="field-label">Session to Challenge With</label>
                <select value={sessionId} onChange={e => setSessionId(e.target.value)}>
                  {sorted.map(s => (
                    <option key={s.id} value={s.id}>
                      {trackLabel(s.trackId)} · {s.car} · {s.bestLap || 'no time'} · {s.date}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', textTransform: 'none' }}>
                  <input type="checkbox" checked={isRace} onChange={e => setIsRace(e.target.checked)} />
                  Race total time instead of best lap
                </label>
                {isRace && (
                  <>
                    <input
                      type="number"
                      min={2}
                      max={99}
                      value={lapCount}
                      onChange={e => setLapCount(Math.max(2, Number(e.target.value) || 2))}
                      style={{ marginTop: 'var(--space-2)', maxWidth: 100 }}
                    />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)', marginTop: 'var(--space-1)' }}>
                      Compares total time across the first {lapCount} laps
                      {availableLaps > 0 ? ` (this session has ${availableLaps} logged).` : ' — this session has no per-lap times logged, so avg lap × laps will be used as an estimate.'}
                    </div>
                  </>
                )}
              </div>

              <div className="field">
                <label className="field-label">Opponent</label>
                {friends.length > 0 && (
                  <select
                    value={opponent && friends.some(f => f.username === opponent.name) ? opponent.name : ''}
                    onChange={e => pickFriend(e.target.value)}
                    style={{ marginBottom: 'var(--space-2)' }}
                  >
                    <option value="">Pick a friend…</option>
                    {friends.map(f => (
                      <option key={f.userId} value={f.username}>{f.username}</option>
                    ))}
                    <option value="__other__">Someone else (type a username)</option>
                  </select>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    placeholder={friends.length > 0 ? 'or type any username' : 'their-username'}
                    value={username}
                    onChange={e => { setUsername(e.target.value); setOpponent(null); setLookupError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFind(); } }}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={handleFind} disabled={looking || !username.trim()}>
                    {looking ? '…' : 'Find'}
                  </button>
                </div>
                {opponent && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--teal)', marginTop: 'var(--space-2)' }}>
                    <Check size={13} aria-hidden="true" /> Challenging {opponent.name}
                  </div>
                )}
                {lookupError && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--red)', marginTop: 'var(--space-2)' }}>
                    {lookupError}
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">Message <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(optional)</span></label>
                <textarea rows={2} placeholder="Beat this if you can..." value={message} onChange={e => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={sorted.length === 0 || !sessionId || !opponent || isPending}>
            {isPending ? 'Sending…' : 'Send Challenge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Attempt Modal ─────────────────────────────────────────────────────

function AttemptModal({
  challenge,
  sessions,
  onClose,
  onSubmitted,
  onError,
}: {
  challenge: RivalChallengeRecord;
  sessions: SessionRecord[];
  onClose: () => void;
  onSubmitted: (result: RivalChallengeRecord) => void;
  onError: (msg: string) => void;
}) {
  const eligible = useMemo(
    () => sortedByRecent(sessions.filter(s => s.trackId === challenge.trackId)),
    [sessions, challenge.trackId],
  );
  const [sessionId, setSessionId] = useState(eligible[0]?.id ?? '');

  const { mutate: submit, isPending } = useSubmitRivalChallengeAttempt({
    mutation: {
      // The response carries the scored challenge, so the driver who just
      // submitted learns whether they won without hunting for it.
      onSuccess: onSubmitted,
      onError: () => onError('Failed to submit your attempt'),
    },
  });

  const handleSubmit = () => {
    if (!sessionId) return;
    submit({ id: challenge.id, data: { sessionId } });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <span className="modal-title">Submit Your Attempt</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            {challenge.creator.name} is challenging you to beat their {lapCountLabel(challenge.lapCount).toLowerCase()} at {trackLabel(challenge.trackId)} in the {challenge.car}.
          </p>
          {/* The number they set. Racing blind against an unknown time was
              the complaint — this is the whole brief for the session. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-mid)' }}>
              Time to beat
            </span>
            <span className="lap-time" style={{ fontSize: 22 }}>{targetTime(challenge) ?? '—'}</span>
            {challenge.lapCount > 1 && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>
                total across {challenge.lapCount} laps
              </span>
            )}
          </div>
          {eligible.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--yellow)', lineHeight: 1.6 }}>
              You haven't logged a session at {trackLabel(challenge.trackId)} yet. Race it, log the session, then come back here to submit it.
            </p>
          ) : (
            <div className="field">
              <label className="field-label">Your Session</label>
              <select value={sessionId} onChange={e => setSessionId(e.target.value)}>
                {eligible.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.car} · {s.bestLap || 'no time'} · {s.date}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!sessionId || isPending}>
            {isPending ? 'Submitting…' : 'Submit Attempt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
//
// Rivals used to be its own top-level page and nav item, duplicating the
// head-to-head idea Community already had a 'challenges' tab for. It's now a
// tab inside Community, so this renders bare — Community owns the page title.

type Tab = 'yourTurn' | 'waiting' | 'completed';

export default function Rivals() {
  const qc = useQueryClient();
  const { data: challenges = [], isLoading } = useGetRivalChallenges();
  const { data: sessions = [] } = useGetSessions();
  const [tab, setTab] = useState<Tab>('yourTurn');
  const [showNew, setShowNew] = useState(false);
  const [attemptFor, setAttemptFor] = useState<RivalChallengeRecord | null>(null);
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetRivalChallengesQueryKey() });

  const { mutate: cancelChallenge } = useCancelRivalChallenge({
    mutation: {
      onSuccess: () => { setCancellingId(null); invalidate(); },
      onError: () => { setCancellingId(null); setToastVariant('error'); setToast('Failed to cancel challenge'); },
    },
  });

  const { mutate: markSeen } = useMarkRivalChallengeSeen({
    mutation: {
      onSuccess: () => invalidate(),
      // Acknowledging is housekeeping — if it fails the banner simply stays,
      // which is the safe direction. No need to shout about it.
      onError: () => invalidate(),
    },
  });

  const yourTurn = challenges.filter(isAwaitingMyAttempt);
  const waiting = challenges.filter(c => c.status === 'pending' && c.creator.isMe);
  const completed = challenges.filter(c => c.status === 'completed');
  const unseenResults = challenges.filter(isUnseenResult);
  const visible = tab === 'yourTurn' ? yourTurn : tab === 'waiting' ? waiting : completed;

  return (
    <>
      {/* Your challenge came back. Raised for whoever wasn't the one to
          finish it, and it survives reloads until they acknowledge it —
          the result is the payoff, so it doesn't get to vanish silently. */}
      {unseenResults.map(c => {
        const outcome = resultFor(c);
        return (
          <div
            key={c.id}
            className={`notice notice--${outcome === 'won' ? 'teal' : outcome === 'lost' ? 'red' : 'gray'}`}
          >
            {outcome === 'won'
              ? <Trophy size={14} aria-hidden="true" style={{ color: resultColor(c), flexShrink: 0 }} />
              : <Flag size={14} aria-hidden="true" style={{ color: resultColor(c), flexShrink: 0 }} />}
            <span className="notice-text">
              <strong style={{ color: resultColor(c) }}>{resultHeadline(c)}</strong>
              {' '}at {trackLabel(c.trackId)} — {targetTime(c) ?? '—'} vs{' '}
              {c.lapCount > 1
                ? (c.opponentSession?.raceTimeSeconds != null ? secsToClock(c.opponentSession.raceTimeSeconds) : '—')
                : (c.opponentSession?.bestLap || '—')}
            </span>
            <div className="notice-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setTab('completed'); markSeen({ id: c.id }); }}
              >
                See Result
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => markSeen({ id: c.id })}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}

      {/* Stays put until the attempt is actually submitted — there is no
          dismiss, and simply opening this tab doesn't clear it. */}
      {yourTurn.length > 0 && (
        <div className="notice notice--red">
          <Swords size={14} aria-hidden="true" style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span className="notice-text">
            {yourTurn.length === 1
              ? `${yourTurn[0].creator.name} is waiting on your time at ${trackLabel(yourTurn[0].trackId)}.`
              : `${yourTurn.length} challenges are waiting on your time.`}
          </span>
          <div className="notice-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setTab('yourTurn'); if (yourTurn.length === 1) setAttemptFor(yourTurn[0]); }}
            >
              {yourTurn.length === 1 ? 'Submit Your Attempt' : 'See Them'}
            </button>
          </div>
        </div>
      )}

      {/* State chips and the one action that isn't tied to a card share a
          single row. They used to be two full-width rows — the button alone on
          the first, hard right, with nothing beside it. */}
      <div className="toolbar">
        <div className="toolbar-chips">
          <button className={`badge-tab${tab === 'yourTurn' ? ' badge-tab-active' : ''}`} onClick={() => setTab('yourTurn')}>
            Your Turn{yourTurn.length > 0 ? ` (${yourTurn.length})` : ''}
          </button>
          <button className={`badge-tab${tab === 'waiting' ? ' badge-tab-active' : ''}`} onClick={() => setTab('waiting')}>
            Waiting on Them{waiting.length > 0 ? ` (${waiting.length})` : ''}
          </button>
          <button className={`badge-tab${tab === 'completed' ? ' badge-tab-active' : ''}`} onClick={() => setTab('completed')}>
            Completed{completed.length > 0 ? ` (${completed.length})` : ''}
            {unseenResults.length > 0 && (
              <span
                aria-label={`${unseenResults.length} new result${unseenResults.length === 1 ? '' : 's'}`}
                style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--red)', marginLeft: 2, verticalAlign: 'middle',
                }}
              />
            )}
          </button>
        </div>
        <div className="toolbar-actions">
          {/* Solid red while it's the page's main move; when a challenge is
              actually waiting on you, that banner owns the red and this steps
              back so there's one obvious next step instead of two. */}
          <button
            className={`btn ${yourTurn.length > 0 ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowNew(true)}
          >
            <Swords size={12} /> Challenge Someone
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="table-wrap"><div className="empty-state"><div className="empty-state-title">Loading…</div></div></div>
      ) : visible.length === 0 ? (
        <div className="table-wrap">
          <EmptyState
            icon={<Swords size={40} />}
            headline={tab === 'yourTurn' ? 'Nothing waiting on you' : tab === 'waiting' ? 'No pending challenges' : 'No completed challenges yet'}
            subtext={
              tab === 'yourTurn'
                ? "When someone challenges you, it'll show up here."
                : "Challenge a friend to beat one of your lap times or race results — race async, whenever they're online."
            }
            ctaLabel="Challenge Someone"
            onCta={() => setShowNew(true)}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {visible.map(c => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onSubmitAttempt={() => setAttemptFor(c)}
              onCancel={() => { setCancellingId(c.id); cancelChallenge({ id: c.id }); }}
              cancelling={cancellingId === c.id}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewChallengeModal
          sessions={sessions}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); invalidate(); setToastVariant('success'); setToast('Challenge sent'); }}
          onError={(msg) => { setToastVariant('error'); setToast(msg); }}
        />
      )}

      {attemptFor && (
        <AttemptModal
          challenge={attemptFor}
          sessions={sessions}
          onClose={() => setAttemptFor(null)}
          onSubmitted={(result) => {
            setAttemptFor(null);
            invalidate();
            setTab('completed');
            const outcome = resultFor(result);
            setToastVariant(outcome === 'lost' ? 'error' : 'success');
            setToast(resultHeadline(result));
          }}
          onError={(msg) => { setToastVariant('error'); setToast(msg); }}
        />
      )}

      {toast && <Toast message={toast} variant={toastVariant} onDone={() => setToast('')} />}
    </>
  );
}
