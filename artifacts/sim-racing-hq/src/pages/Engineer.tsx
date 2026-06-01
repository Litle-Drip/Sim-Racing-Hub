import { useState, useEffect, useRef, useCallback } from 'react';
import { useGetSessions } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import type { SessionRecord } from '@workspace/api-client-react';

const QUICK_QS = [
  'Where am I losing the most time?',
  'What should I work on tonight?',
  'How consistent am I?',
  'Which track needs the most work?',
  'What target should I set next session?',
  'Compare my best and worst sessions',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface EngineerUserData {
  name: string;
  platform: string | null;
  hardware: string | null;
  goals: string | null;
  sessions: Array<{
    date: string;
    trackId: string;
    car: string;
    bestLap: string;
    avgLap: string | null;
    worstLap: string | null;
    s1: string | null;
    s2: string | null;
    s3: string | null;
    type: string;
    tires: string | null;
    notes: string | null;
    isPB: boolean;
  }>;
}

function buildUserData(sessions: SessionRecord[], user: { firstName?: string | null; username?: string | null }): EngineerUserData {
  return {
    name: user.firstName ?? user.username ?? 'Driver',
    platform: null,
    hardware: null,
    goals: null,
    sessions: sessions.map((s) => ({
      date: s.date,
      trackId: s.trackId,
      car: s.car,
      bestLap: s.bestLap,
      avgLap: s.avgLap || null,
      worstLap: s.worstLap || null,
      s1: s.s1 || null,
      s2: s.s2 || null,
      s3: s.s3 || null,
      type: s.type,
      tires: s.tires || null,
      notes: s.notes || null,
      isPB: s.isPB,
    })),
  };
}

export default function Engineer() {
  const { data: sessions = [] } = useGetSessions();
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [started, setStarted] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setStreaming('');

    try {
      const res = await fetch('/api/engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          userData: buildUserData(sessions, {
            firstName: user?.firstName,
            username: user?.username,
          }),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setStreaming(full);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
      setStreaming('');
    } catch (err) {
      console.error('Engineer error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Radio check \u2014 having trouble connecting. Check your API key is set in Vercel environment variables, then try again.',
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, messages, sessions, user]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startDebrief = () => {
    setStarted(true);
    sendMessage('Analyse my recent data and tell me the single most important thing I should work on right now.');
  };

  const resetChat = () => {
    if (window.confirm('Clear this debrief session?')) {
      setMessages([]);
      setStreaming('');
      setStarted(false);
    }
  };

  const hasSessions = sessions.length >= 3;
  const hasAvgLaps = sessions.filter((s) => s.avgLap).length >= 2;
  const hasSectors = sessions.filter((s) => s.s1).length >= 2;
  const uniqueTracks = [...new Set(sessions.map((s) => s.trackId))].length;

  return (
    <div className="eng-page">
      {/* Header */}
      <div className="eng-header">
        <div className="eng-avatar">{'\uD83C\uDFA7'}</div>
        <div>
          <div className="eng-title">Race Engineer</div>
          <div className="eng-sub">AI coaching powered by your session data</div>
          <div className="eng-status">
            <span className="eng-status-dot" />
            Live &middot; Claude Haiku 4.5
          </div>
        </div>
        {started && (
          <button className="eng-reset" onClick={resetChat}>
            New Debrief
          </button>
        )}
      </div>

      {/* Data readiness warning */}
      {!hasSessions && (
        <div className="eng-warning">
          <span style={{ fontSize: 18 }}>{'\u26A0\uFE0F'}</span>
          <span>
            Log at least <strong style={{ color: 'var(--yellow)' }}>3 sessions</strong> to unlock the Race Engineer. The more you log, the more specific the coaching gets.
          </span>
        </div>
      )}

      {/* Pre-start card */}
      {!started ? (
        <div className="eng-start-card">
          <span className="eng-start-icon">{'\uD83C\uDFA7'}</span>
          <div className="eng-start-title">Ready for Debrief</div>
          <div className="eng-start-desc">
            Your engineer has reviewed your session data. The more you've logged, the more specific the analysis.
          </div>

          {/* Data quality pills */}
          <div className="eng-data-pills">
            <span className={`eng-pill${sessions.length > 0 ? ' eng-pill--active' : ''}`}>
              {sessions.length} sessions
            </span>
            <span className={`eng-pill${uniqueTracks > 0 ? ' eng-pill--active' : ''}`}>
              {uniqueTracks} tracks
            </span>
            <span className={`eng-pill${hasAvgLaps ? ' eng-pill--active' : ''}`}>
              avg laps {hasAvgLaps ? '\u2713' : '\u2014'}
            </span>
            <span className={`eng-pill${hasSectors ? ' eng-pill--active' : ''}`}>
              sectors {hasSectors ? '\u2713' : '\u2014'}
            </span>
          </div>

          <button
            className="btn btn-primary"
            onClick={startDebrief}
            disabled={!hasSessions}
            style={{ fontSize: 13, padding: '13px 32px' }}
          >
            {hasSessions ? 'Start Debrief' : 'Log 3+ Sessions First'}
          </button>
        </div>
      ) : (
        /* Chat interface */
        <>
          <div className="eng-chat" ref={chatRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`eng-msg ${msg.role === 'assistant' ? 'eng-msg--eng' : 'eng-msg--driver'}`}>
                <div className="eng-msg-label">
                  {msg.role === 'assistant' ? '\uD83C\uDFA7 Race Engineer' : '\uD83E\uDE96 You'}
                </div>
                <div className="eng-bubble">{msg.content}</div>
              </div>
            ))}

            {loading &&
              (streaming ? (
                <div className="eng-msg eng-msg--eng">
                  <div className="eng-msg-label">{'\uD83C\uDFA7'} Race Engineer</div>
                  <div className="eng-bubble">
                    {streaming}
                    <span className="eng-cursor" />
                  </div>
                </div>
              ) : (
                <div className="eng-typing">
                  <div className="eng-typing-dot" />
                  <div className="eng-typing-dot" />
                  <div className="eng-typing-dot" />
                </div>
              ))}
          </div>

          {/* Input row */}
          <div className="eng-input-row">
            <input
              ref={inputRef}
              className="eng-input"
              placeholder="Ask your engineer anything\u2026"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoFocus
            />
            <button
              className="eng-send"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              Send
            </button>
          </div>

          {/* Quick questions */}
          <div className="eng-quick">
            {QUICK_QS.map((q, i) => (
              <button key={i} className="eng-quick-btn" onClick={() => sendMessage(q)} disabled={loading}>
                {q}
              </button>
            ))}
          </div>

          <div className="eng-footer-note">
            ~$0.003 per message &middot; Your data is never stored by the AI
          </div>
        </>
      )}
    </div>
  );
}
