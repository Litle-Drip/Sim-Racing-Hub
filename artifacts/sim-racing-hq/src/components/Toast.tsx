import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  onDone: () => void;
  duration?: number;
  variant?: 'success' | 'error';
}

export function Toast({ message, onDone, duration = 3000, variant = 'success' }: ToastProps) {
  const [fading, setFading] = useState(false);

  const isError = variant === 'error';

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration);
    const doneTimer = setTimeout(onDone, duration + 300);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [duration, onDone]);

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 9999,
        background: isError ? 'rgba(232,0,45,0.11)' : 'rgba(0,210,190,0.11)',
        border: `1px solid ${isError ? 'rgba(232,0,45,0.42)' : 'rgba(0,210,190,0.42)'}`,
        borderRadius: 4,
        padding: '11px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        letterSpacing: '0.07em',
        color: isError ? 'var(--red)' : 'var(--teal)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {isError ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
      {message}
    </div>
  );
}
