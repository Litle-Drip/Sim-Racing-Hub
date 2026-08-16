import { useState, useEffect, useRef, useMemo } from 'react';
import { Check, Headphones, Key, Lock, User as UserIcon } from 'lucide-react';
import { useUser, useAuth } from '@clerk/react';
import {
  useGetSessions,
  useGetEngineerUsage,
  useUnlockEngineerUsage,
  getGetEngineerUsageQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getSessionRecommendation } from '../lib/engagement';

const HISTORY_STORAGE_PREFIX = 'f1simhub-engineer-history-';
const MAX_STORED_MESSAGES = 50;

// Bring-your-own-key. The driver's Anthropic key stays in their own browser —
// it's sent as a request header on each message so the tokens bill to them, and
// it is never written to the F1SimHub database.
const API_KEY_STORAGE_PREFIX = 'f1simhub-engineer-apikey-';

function loadApiKey(userId: string): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_PREFIX + userId) ?? '';
  } catch {
    return '';
  }
}

function saveApiKey(userId: string, key: string) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE_PREFIX + userId, key);
    else localStorage.removeItem(API_KEY_STORAGE_PREFIX + userId);
  } catch {
    // Storage unavailable — the key just won't persist past this tab.
  }
}

function isPlausibleApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(key);
}

/** sk-ant-…a1b2 — enough to recognise which key is in use, not enough to leak it. */
function maskApiKey(key: string): string {
  return `sk-ant-…${key.slice(-4)}`;
}

type EngineerMessage = { role: 'user' | 'assistant'; content: string };

function loadHistory(userId: string): { messages: EngineerMessage[]; started: boolean } {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_PREFIX + userId);
    if (!raw) return { messages: [], started: false };
    const messages = JSON.parse(raw) as EngineerMessage[];
    return { messages, started: messages.length > 0 };
  } catch {
    return { messages: [], started: false };
  }
}

function saveHistory(userId: string, messages: EngineerMessage[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_PREFIX + userId, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {
    // Storage full or unavailable — history just won't persist this session.
  }
}

const QUICK_QUESTIONS = [
  'Where am I losing the most time?',
  'What should I work on tonight?',
  'How consistent am I?',
  'Which track needs the most work?',
  'What target should I set next session?',
  'Compare my best and worst sessions',
];

/** Speaker attribution above each chat bubble — icon + name, mirrored for the driver's own messages. */
function SpeakerLabel({ role }: { role: 'assistant' | 'user' }) {
  const Icon = role === 'assistant' ? Headphones : UserIcon;
  return (
    <div className="radio-callsign">
      <Icon size={11} aria-hidden="true" />
      {role === 'assistant' ? 'Race Engineer' : 'You'}
    </div>
  );
}

/**
 * The engineer's replies come back with markdown emphasis around the figures
 * that matter — "**0.131s**", "**What to log first:**". Unrendered, those
 * asterisks sat in the middle of the transmission as literal characters. This
 * renders the bold runs and nothing else: no HTML is interpreted, the text is
 * split on the delimiter and the pieces are returned as React nodes.
 */
function RadioText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/gs);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

/**
 * Bring-your-own-key panel. The key never leaves the driver's browser except as
 * a request header on their own messages, so this is the "unlimited, and it
 * costs F1SimHub nothing" path out of the free-tier limit.
 */
function ApiKeyPanel({
  apiKey, draft, error, onDraftChange, onSave, onRemove,
}: {
  apiKey: string;
  draft: string;
  error: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <Key size={14} aria-hidden="true" style={{ color: 'var(--teal)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.06em', color: 'var(--white)', textTransform: 'uppercase' }}>
          Your Own API Key
        </span>
      </div>

      {apiKey ? (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            Using <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{maskApiKey(apiKey)}</span> — unlimited debriefs on the stronger model, billed to your Anthropic account.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={onRemove}>Remove key</button>
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            Paste an Anthropic API key for unlimited debriefs on a stronger model. Typical cost is a fraction of a cent per message, billed to you.
            The key is stored only in this browser and is never saved to F1SimHub — it's sent with your own messages so Anthropic can bill them.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <input
              type="password"
              aria-label="Anthropic API key"
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); }}
              style={{ flex: 1, padding: 'var(--space-3) var(--space-4)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
            <button className="btn btn-primary" onClick={onSave} disabled={!draft.trim()}>Save</button>
          </div>
          {error && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--red)', marginBottom: 'var(--space-2)' }}>{error}</div>
          )}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gray-mid)', textDecoration: 'underline' }}
          >
            Get a key from the Anthropic Console
          </a>
        </>
      )}
    </div>
  );
}

export default function RaceEngineer() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useGetSessions();
  const { data: usage } = useGetEngineerUsage();
  const unlockMutation = useUnlockEngineerUsage();

  const userId = user?.id ?? 'guest';

  const [messages, setMessages] = useState<EngineerMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [keyError, setKeyError] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore the driver's last debrief for this account once Clerk has
  // resolved who's signed in, so a reload or revisit picks up where they left off.
  useEffect(() => {
    if (!userLoaded) return;
    const { messages: restored, started: restoredStarted } = loadHistory(userId);
    setMessages(restored);
    setStarted(restoredStarted);
    setApiKey(loadApiKey(userId));
    setHistoryLoaded(true);
  }, [userLoaded, userId]);

  useEffect(() => {
    if (!historyLoaded) return;
    saveHistory(userId, messages);
  }, [historyLoaded, userId, messages]);

  // Drivers on their own key aren't metered at all, so the free-tier lockout
  // never applies to them.
  useEffect(() => {
    if (apiKey) setLocked(false);
    else if (usage && !usage.allowed) setLocked(true);
  }, [usage, apiKey]);

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!isPlausibleApiKey(trimmed)) {
      setKeyError('That doesn’t look like an Anthropic key — it should start with sk-ant-.');
      return;
    }
    setKeyError('');
    setApiKey(trimmed);
    saveApiKey(userId, trimmed);
    setKeyDraft('');
    setKeyPanelOpen(false);
    setLocked(false);
  };

  const removeKey = () => {
    setApiKey('');
    saveApiKey(userId, '');
    setKeyError('');
    if (usage && !usage.allowed) setLocked(true);
  };

  const submitUnlock = async () => {
    setUnlockError('');
    try {
      await unlockMutation.mutateAsync({ data: { password: unlockPassword } });
      setUnlockPassword('');
      setLocked(false);
      queryClient.invalidateQueries({ queryKey: getGetEngineerUsageQueryKey() });
    } catch {
      setUnlockError('Incorrect password.');
    }
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Most-used platform across logged sessions — the app doesn't collect a
  // dedicated per-user platform/hardware profile, so this is the best signal.
  const platform = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach(s => { if (s.platform) counts[s.platform] = (counts[s.platform] ?? 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top?.[0];
  }, [sessions]);

  const userProfile = {
    name: user?.fullName ?? user?.firstName ?? undefined,
    platform,
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || locked) return;

    const userMsg = { role: 'user' as const, content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      const token = await getToken();
      const res = await fetch('/api/engineer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // Present only for BYOK drivers — the edge function bills this key
          // instead of F1SimHub's and skips the free-tier meter entirely.
          ...(apiKey ? { 'X-Anthropic-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          messages: updatedMessages,
          userData: {
            name: userProfile.name,
            platform: userProfile.platform,
            sessions: sessions.map(s => ({
              date: s.date,
              trackId: s.trackId,
              car: s.car,
              bestLap: s.bestLap || null,
              avgLap: s.avgLap || null,
              worstLap: s.worstLap || null,
              s1: s.s1 || null,
              s2: s.s2 || null,
              s3: s.s3 || null,
              type: s.type,
              tires: s.tires || null,
              notes: s.notes || null,
              isPB: s.isPB ?? false,
              // Strip the per-sample telemetry trace — the engineer only
              // needs lap/sector/tyre/penalty per lap, and traces (up to
              // 3000 points per lap) bloat the request enough to fail.
              laps: s.laps && s.laps.length > 0
                ? s.laps.map(l => ({ lap: l.lap, time: l.time, s1: l.s1, s2: l.s2, s3: l.s3, tires: l.tires, penalty: l.penalty }))
                : null,
            })),
          },
        }),
      });

      if (res.status === 403) {
        setLocked(true);
        setMessages(messages);
        setInput(trimmed);
        queryClient.invalidateQueries({ queryKey: getGetEngineerUsageQueryKey() });
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreamingText(full);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: full }]);
      setStreamingText('');
      // BYOK messages don't touch the counter, so there's nothing to refetch.
      if (!apiKey) queryClient.invalidateQueries({ queryKey: getGetEngineerUsageQueryKey() });
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Radio check — having trouble connecting. Try again in a moment.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const startDebrief = () => {
    setStarted(true);
    sendMessage('Analyse my recent data and tell me the single most important thing I should work on right now.');
  };

  const resetDebrief = () => {
    if (window.confirm('Clear this debrief session and start fresh?')) {
      setMessages([]);
      setStreamingText('');
      setStarted(false);
      saveHistory(userId, []);
    }
  };

  // "What should I drive next" belongs with the engineer, not on the dashboard —
  // it's the same question the debrief answers, and here it can be handed
  // straight to the engineer as a prompt.
  const recommendation = useMemo(() => getSessionRecommendation(sessions), [sessions]);

  const hasSessions = sessions.length >= 3;
  const hasAvgLaps = sessions.filter(s => s.avgLap).length >= 2;
  const hasSectors = sessions.filter(s => s.s1).length >= 2;
  const uniqueTracks = new Set(sessions.map(s => s.trackId)).size;

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Headphones size={20} style={{ color: 'var(--red)' }} />
            <h1 className="page-title">Race Engineer</h1>
          </div>
          <div className="page-subtitle">AI coaching powered by your session data</div>
        </div>
        {/* Link status sits with the controls, the way a pit wall keeps its
            connection state beside the switches — it was a third stacked line
            under the subtitle. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="engineer-status">
            <span className="engineer-live-dot" />
            {apiKey ? 'Live · Your key · Claude Sonnet 5' : 'Live · Claude Haiku 4.5'}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => { setKeyPanelOpen(o => !o); setKeyError(''); }}
            aria-expanded={keyPanelOpen}
          >
            <Key size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {apiKey ? 'Your Key' : 'Use Own Key'}
          </button>
          {started && (
            <button className="btn btn-secondary" onClick={resetDebrief}>
              New Debrief
            </button>
          )}
        </div>
      </div>

      {keyPanelOpen && (
        <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
          <ApiKeyPanel
            apiKey={apiKey}
            draft={keyDraft}
            error={keyError}
            onDraftChange={setKeyDraft}
            onSave={saveKey}
            onRemove={removeKey}
          />
        </div>
      )}

      {/* ── Recommended Session ─────────────────────────────────────────
          Moved off the Dashboard: the circuit most likely to yield a PB is
          engineer territory, and here the driver can put it straight to them. */}
      {recommendation && !locked && (
        <div
          className="card card-accent card-accent--red"
          style={{ padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-5)' }}
        >
          {/* Call and action on one row: the button had a band of its own
              below the readout, right-aligned against nothing. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 'var(--space-1)' }}>
                Recommended Session
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--white)' }}>
                {recommendation.trackFlag} {recommendation.trackName} — {recommendation.car}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-mid)', marginTop: 'var(--space-1)' }}>
                {recommendation.reason}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => {
                setStarted(true);
                sendMessage(`Why is ${recommendation.trackName} in the ${recommendation.car} my best shot at a PB right now, and what should I focus on for that run?`);
              }}
            >
              Ask Engineer
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--teal)' }}>Est. gain: {recommendation.gain}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Confidence: {recommendation.confidence}%</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>Consistency: {recommendation.avgConsistency.toFixed(1)}%</span>
            {recommendation.lastDaysAgo !== null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-label)', color: 'var(--gray)' }}>
                Last: {recommendation.lastDaysAgo === 0 ? 'Today' : recommendation.lastDaysAgo === 1 ? 'Yesterday' : `${recommendation.lastDaysAgo}d ago`}
              </span>
            )}
          </div>
        </div>
      )}

      {!historyLoaded ? (
        // Wait for the persisted debrief to load before deciding whether to
        // show the "Ready for Debrief" empty state — otherwise a returning
        // user briefly sees (and can click into) the empty state before
        // their restored chat history snaps in.
        <div className="card" style={{ padding: 'var(--space-7) var(--space-6)', textAlign: 'center' }} />
      ) : locked ? (
        <div className="card" style={{ padding: 'var(--space-7) var(--space-6)', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <Lock size={36} aria-hidden="true" style={{ color: 'var(--red)', marginBottom: 'var(--space-4)' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>
            Free Debriefs Used Up
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
            You've used your {usage?.limit ?? 3} free Race Engineer messages. Enter the unlock password for unlimited access.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <input
              type="password"
              aria-label="Unlock password"
              placeholder="Unlock password"
              value={unlockPassword}
              onChange={e => setUnlockPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitUnlock(); }}
              style={{ flex: 1, padding: 'var(--space-3) var(--space-4)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--font-body)', fontSize: 14 }}
            />
            <button
              className="btn btn-primary"
              onClick={submitUnlock}
              disabled={!unlockPassword.trim() || unlockMutation.isPending}
            >
              Unlock
            </button>
          </div>
          {unlockError && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--red)' }}>{unlockError}</div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '24px 0 20px' }} />

          <ApiKeyPanel
            apiKey={apiKey}
            draft={keyDraft}
            error={keyError}
            onDraftChange={setKeyDraft}
            onSave={saveKey}
            onRemove={removeKey}
          />
        </div>
      ) : !started ? (
        <div className="card" style={{ padding: 'var(--space-7) var(--space-6)', textAlign: 'center' }}>
          <Headphones size={36} aria-hidden="true" style={{ color: 'var(--red)', marginBottom: 'var(--space-4)' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 'var(--space-3)', textTransform: 'uppercase' }}>
            Ready for Debrief
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)', color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 'var(--space-6)', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            Your engineer reads your real session history — lap times, sectors, consistency — and gives you specific,
            data-driven coaching. No generic advice.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', textAlign: 'left' }}>
            <div className={`engineer-data-pill${sessions.length > 0 ? ' engineer-data-pill--ready' : ''}`}>
              <div className="field-label">Sessions</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: sessions.length > 0 ? 'var(--teal)' : 'var(--gray-mid)' }}>{sessions.length}</div>
            </div>
            <div className={`engineer-data-pill${uniqueTracks > 0 ? ' engineer-data-pill--ready' : ''}`}>
              <div className="field-label">Tracks</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: uniqueTracks > 0 ? 'var(--teal)' : 'var(--gray-mid)' }}>{uniqueTracks}</div>
            </div>
            <div className={`engineer-data-pill${hasAvgLaps ? ' engineer-data-pill--ready' : ''}`}>
              <div className="field-label">Avg Laps</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: hasAvgLaps ? 'var(--teal)' : 'var(--gray-mid)' }}>{hasAvgLaps ? <Check size={16} aria-label="Available" /> : '—'}</div>
            </div>
            <div className={`engineer-data-pill${hasSectors ? ' engineer-data-pill--ready' : ''}`}>
              <div className="field-label">Sectors</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: hasSectors ? 'var(--teal)' : 'var(--gray-mid)' }}>{hasSectors ? <Check size={16} aria-label="Available" /> : '—'}</div>
            </div>
          </div>

          {!hasSessions && (
            <div style={{ borderLeft: '3px solid var(--red)', background: 'rgba(232,0,45,0.06)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-5)', textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--gray-light)', lineHeight: 1.6 }}>
                Log at least <strong style={{ color: 'var(--white)' }}>3 sessions</strong> to unlock a real debrief — the engineer needs data to work from.
              </div>
            </div>
          )}

          <button className="btn btn-primary" style={{ minWidth: 220, padding: 'var(--space-4) var(--space-6)' }} onClick={startDebrief} disabled={!hasSessions}>
            Start Debrief
          </button>
        </div>
      ) : (
        <div className="card engineer-console">
          <div ref={chatRef} className="engineer-transcript">
            {messages.map((m, i) => (
              <div key={i} className={`radio-line radio-line--${m.role === 'user' ? 'driver' : 'engineer'}`}>
                <SpeakerLabel role={m.role} />
                <div className={`radio-msg radio-msg--${m.role === 'user' ? 'driver' : 'engineer'}`}>
                  <RadioText text={m.content} />
                </div>
              </div>
            ))}

            {loading && !streamingText && (
              <div className="radio-line radio-line--engineer">
                <SpeakerLabel role="assistant" />
                <div className="radio-msg radio-msg--engineer" style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  <span className="engineer-typing-dot" />
                  <span className="engineer-typing-dot" />
                  <span className="engineer-typing-dot" />
                </div>
              </div>
            )}

            {loading && streamingText && (
              <div className="radio-line radio-line--engineer">
                <SpeakerLabel role="assistant" />
                <div className="radio-msg radio-msg--engineer">
                  <RadioText text={streamingText} /><span className="engineer-cursor" />
                </div>
              </div>
            )}
          </div>

          <div className="engineer-composer">
            <input
              ref={inputRef}
              type="text"
              aria-label="Message your race engineer"
              placeholder="Ask your engineer anything…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '0 var(--space-5)' }}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              Send
            </button>
          </div>

          <div className="engineer-suggestions">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                className="btn btn-ghost btn-sm"
                onClick={() => sendMessage(q)}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message allowance reads as its own chip rather than trailing a line of
          fine print — a driver about to run out needs to see it, not find it.
          Per-message cost is gone: it's noise to the driver and reads as a
          charge they're about to pay. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
        {apiKey ? (
          <span className="engineer-quota engineer-quota--unlimited">
            <Key size={12} aria-hidden="true" />
            Unlimited — billed to your Anthropic key
          </span>
        ) : usage && !usage.unlocked ? (
          (() => {
            const left = Math.max(usage.limit - usage.count, 0);
            const tone = left === 0 ? 'out' : left <= 1 ? 'low' : 'ok';
            return (
              <span className={`engineer-quota engineer-quota--${tone}`}>
                <span className="engineer-quota-count">{left}</span>
                free message{left === 1 ? '' : 's'} left
              </span>
            );
          })()
        ) : null}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--gray-mid)' }}>
          Your data is never stored by the AI
        </div>
      </div>
    </div>
  );
}
