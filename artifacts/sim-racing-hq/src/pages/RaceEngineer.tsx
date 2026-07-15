import { useState, useEffect, useRef, useMemo } from 'react';
import { Headphones } from 'lucide-react';
import { useUser } from '@clerk/react';
import { useGetSessions } from '@workspace/api-client-react';

const QUICK_QUESTIONS = [
  'Where am I losing the most time?',
  'What should I work on tonight?',
  'How consistent am I?',
  'Which track needs the most work?',
  'What target should I set next session?',
  'Compare my best and worst sessions',
];

export default function RaceEngineer() {
  const { user } = useUser();
  const { data: sessions = [] } = useGetSessions();

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [started, setStarted] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!trimmed || loading) return;

    const userMsg = { role: 'user' as const, content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            })),
          },
        }),
      });

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
    }
  };

  const hasSessions = sessions.length >= 3;
  const hasAvgLaps = sessions.filter(s => s.avgLap).length >= 2;
  const hasSectors = sessions.filter(s => s.s1).length >= 2;
  const uniqueTracks = new Set(sessions.map(s => s.trackId)).size;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Headphones size={20} style={{ color: 'var(--red)' }} />
            <h1 className="page-title" style={{ marginBottom: 0 }}>Race Engineer</h1>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-mid)', marginTop: 6 }}>
            AI coaching powered by your session data
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <span className="engineer-live-dot" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--teal)', textTransform: 'uppercase' }}>
              Live · Claude Haiku 4.5
            </span>
          </div>
        </div>
        {started && (
          <button className="btn btn-secondary" onClick={resetDebrief}>
            New Debrief
          </button>
        )}
      </div>

      {!started ? (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🎧</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--white)', marginBottom: 10, textTransform: 'uppercase' }}>
            Ready for Debrief
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 28 }}>
            Your engineer reads your real session history — lap times, sectors, consistency — and gives you specific,
            data-driven coaching. No generic advice.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24, textAlign: 'left' }}>
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: hasAvgLaps ? 'var(--teal)' : 'var(--gray-mid)' }}>{hasAvgLaps ? '✓' : '—'}</div>
            </div>
            <div className={`engineer-data-pill${hasSectors ? ' engineer-data-pill--ready' : ''}`}>
              <div className="field-label">Sectors</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: hasSectors ? 'var(--teal)' : 'var(--gray-mid)' }}>{hasSectors ? '✓' : '—'}</div>
            </div>
          </div>

          {!hasSessions && (
            <div style={{ borderLeft: '3px solid var(--red)', background: 'rgba(232,0,45,0.06)', padding: '10px 14px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>
                Log at least <strong style={{ color: 'var(--white)' }}>3 sessions</strong> to unlock a real debrief — the engineer needs data to work from.
              </div>
            </div>
          )}

          <button className="btn btn-primary" style={{ minWidth: 220, padding: '14px 28px', fontSize: 14 }} onClick={startDebrief} disabled={!hasSessions}>
            Start Debrief
          </button>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxWidth: 780, margin: '0 auto', height: '65vh', minHeight: 420 }}>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 5, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {m.role === 'assistant' ? '🎧 Race Engineer' : '🪖 You'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--gray-light)',
                  whiteSpace: 'pre-wrap',
                  padding: '10px 14px',
                  background: m.role === 'assistant' ? 'var(--surface)' : 'transparent',
                  borderLeft: m.role === 'assistant' ? '2px solid var(--red)' : undefined,
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && !streamingText && (
              <div style={{ alignSelf: 'flex-start' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 5 }}>
                  🎧 Race Engineer
                </div>
                <div style={{ display: 'flex', gap: 4, padding: '12px 14px', background: 'var(--surface)', borderLeft: '2px solid var(--red)' }}>
                  <span className="engineer-typing-dot" />
                  <span className="engineer-typing-dot" />
                  <span className="engineer-typing-dot" />
                </div>
              </div>
            )}

            {loading && streamingText && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--gray-mid)', textTransform: 'uppercase', marginBottom: 5 }}>
                  🎧 Race Engineer
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7, color: 'var(--gray-light)', whiteSpace: 'pre-wrap', padding: '10px 14px', background: 'var(--surface)', borderLeft: '2px solid var(--red)' }}>
                  {streamingText}<span className="engineer-cursor" />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask your engineer anything…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
              style={{ flex: 1, padding: '14px 16px', background: 'transparent', border: 'none', color: 'var(--white)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }}
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: 0, textTransform: 'uppercase', padding: '0 24px' }}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              Send
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 24px', borderTop: '1px solid var(--border)' }}>
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

      <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gray-mid)' }}>
        ~$0.003 per message · Your data is never stored by the AI
      </div>
    </div>
  );
}
