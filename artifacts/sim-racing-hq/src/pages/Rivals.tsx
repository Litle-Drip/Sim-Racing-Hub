import { useState, useMemo } from 'react';
import { Swords, Trophy } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetRivalChallenges,
  useCreateRivalChallenge,
  useSubmitRivalChallengeAttempt,
  useCancelRivalChallenge,
  lookupRivalChallengeUser,
  getGetRivalChallengesQueryKey,
  useGetSessions,
} from '@workspace/api-client-react';
import type { RivalChallengeRecord, SessionRecord } from '@workspace/api-client-react';
import { F1_TRACKS } from '../data/f1Tracks';
import { Toast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';

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
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--white)', letterSpacing: '0.03em' }}>
            {trackLabel(c.trackId)} · {c.car}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', marginTop: 2 }}>
            {lapCountLabel(c.lapCount)} · {c.creator.name}{c.creator.isMe ? ' (You)' : ''} vs {c.opponent.name}{c.opponent.isMe ? ' (You)' : ''}
          </div>
          {c.message && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', marginTop: 8, fontStyle: 'italic' }}>
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
          <div className="table-wrap" style={{ marginTop: 14 }}>
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
          <div style={{ marginTop: 10, fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.05em', color: winner ? 'var(--teal)' : 'var(--gray-mid)' }}>
            {winner ? `🏁 ${winner.name}${winner.isMe ? ' (You)' : ''} wins` : "Couldn't determine a winner from the recorded times"}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isYourTurn && (
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={onSubmitAttempt}>
              Submit Your Attempt
            </button>
          )}
          {isWaiting && (
            <>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', alignSelf: 'center', marginRight: 'auto' }}>
                Waiting for {c.opponent.name} to respond
              </span>
              <button className="btn btn-secondary" style={{ fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }} onClick={onCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel Challenge'}
              </button>
            </>
          )}
        </div>
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
      const status = (e as { status?: number } | null)?.status;
      setLookupError(status === 404 ? "Couldn't find that username" : 'Something went wrong looking that user up');
    } finally {
      setLooking(false);
    }
  };

  const { mutate: create, isPending } = useCreateRivalChallenge({
    mutation: {
      onSuccess: onCreated,
      onError: () => onError('Failed to send challenge'),
    },
  });

  const handleSubmit = () => {
    if (!sessionId || !opponent) return;
    create({
      data: {
        sessionId,
        opponentUsername: username.trim(),
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
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>
              Log a session first — you need a lap or race on record to challenge someone to beat it.
            </p>
          ) : (
            <>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label">Session to Challenge With</label>
                <select value={sessionId} onChange={e => setSessionId(e.target.value)}>
                  {sorted.map(s => (
                    <option key={s.id} value={s.id}>
                      {trackLabel(s.trackId)} · {s.car} · {s.bestLap || 'no time'} · {s.date}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none' }}>
                  <input type="checkbox" checked={isRace} onChange={e => setIsRace(e.target.checked)} style={{ accentColor: 'var(--red)' }} />
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
                      style={{ marginTop: 8, maxWidth: 100 }}
                    />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)', marginTop: 4 }}>
                      Compares total time across the first {lapCount} laps
                      {availableLaps > 0 ? ` (this session has ${availableLaps} logged).` : ' — this session has no per-lap times logged, so avg lap × laps will be used as an estimate.'}
                    </div>
                  </>
                )}
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label">Opponent's Username</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="their-username"
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
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--teal)', marginTop: 6 }}>
                    ✓ Found {opponent.name}
                  </div>
                )}
                {lookupError && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
                    {lookupError}
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">Message <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(optional)</span></label>
                <textarea rows={2} placeholder="Beat this if you can..." value={message} onChange={e => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
            </>
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
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const eligible = useMemo(
    () => sortedByRecent(sessions.filter(s => s.trackId === challenge.trackId)),
    [sessions, challenge.trackId],
  );
  const [sessionId, setSessionId] = useState(eligible[0]?.id ?? '');

  const { mutate: submit, isPending } = useSubmitRivalChallengeAttempt({
    mutation: {
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
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', marginBottom: 14, lineHeight: 1.6 }}>
            {challenge.creator.name} is challenging you to beat their {lapCountLabel(challenge.lapCount).toLowerCase()} at {trackLabel(challenge.trackId)} in the {challenge.car}.
          </p>
          {eligible.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--yellow)', lineHeight: 1.6 }}>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const yourTurn = challenges.filter(c => c.status === 'pending' && c.opponent.isMe);
  const waiting = challenges.filter(c => c.status === 'pending' && c.creator.isMe);
  const completed = challenges.filter(c => c.status === 'completed');
  const visible = tab === 'yourTurn' ? yourTurn : tab === 'waiting' ? waiting : completed;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Rivals</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Swords size={12} /> Challenge Someone
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={`badge-tab${tab === 'yourTurn' ? ' badge-tab-active' : ''}`} onClick={() => setTab('yourTurn')}>
          Your Turn{yourTurn.length > 0 ? ` (${yourTurn.length})` : ''}
        </button>
        <button className={`badge-tab${tab === 'waiting' ? ' badge-tab-active' : ''}`} onClick={() => setTab('waiting')}>
          Waiting on Them{waiting.length > 0 ? ` (${waiting.length})` : ''}
        </button>
        <button className={`badge-tab${tab === 'completed' ? ' badge-tab-active' : ''}`} onClick={() => setTab('completed')}>
          Completed{completed.length > 0 ? ` (${completed.length})` : ''}
        </button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          onCreated={() => { setShowNew(false); invalidate(); setToastVariant('success'); setToast('Challenge sent 🏁'); }}
          onError={(msg) => { setToastVariant('error'); setToast(msg); }}
        />
      )}

      {attemptFor && (
        <AttemptModal
          challenge={attemptFor}
          sessions={sessions}
          onClose={() => setAttemptFor(null)}
          onSubmitted={() => { setAttemptFor(null); invalidate(); setToastVariant('success'); setToast('Attempt submitted ✓'); }}
          onError={(msg) => { setToastVariant('error'); setToast(msg); }}
        />
      )}

      {toast && <Toast message={toast} variant={toastVariant} onDone={() => setToast('')} />}
    </div>
  );
}
