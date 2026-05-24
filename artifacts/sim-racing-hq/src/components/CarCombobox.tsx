import { useState, useRef, useEffect } from 'react';
import { F1_25_CARS } from '../data/f1Tracks';

interface CarComboboxProps {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  placeholder?: string;
}

export function CarCombobox({ value, onChange, error, placeholder = 'e.g. Ferrari SF-25' }: CarComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? F1_25_CARS.filter(c => c.toLowerCase().includes(value.toLowerCase()))
    : F1_25_CARS;

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={error ? { borderBottomColor: 'var(--red)', width: '100%' } : { width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          zIndex: 200,
          maxHeight: 220,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {filtered.map(car => {
            const isSelected = car === value;
            return (
              <div
                key={car}
                onMouseDown={e => { e.preventDefault(); onChange(car); setOpen(false); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: isSelected ? 'var(--teal)' : 'var(--gray-light)',
                  background: isSelected ? 'rgba(0,210,190,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--teal)' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(0,210,190,0.08)' : 'transparent'; }}
              >
                {car}
              </div>
            );
          })}
          {value.trim() && !F1_25_CARS.some(c => c.toLowerCase() === value.toLowerCase()) && (
            <div style={{
              padding: '7px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              color: 'var(--gray-mid)',
              borderTop: '1px solid var(--border)',
              letterSpacing: '0.04em',
            }}>
              Use "{value}" as custom car
            </div>
          )}
        </div>
      )}
    </div>
  );
}
