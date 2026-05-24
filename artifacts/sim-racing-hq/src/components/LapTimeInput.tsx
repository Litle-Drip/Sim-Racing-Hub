import { useRef } from 'react';

interface LapTimeInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}

/**
 * Auto-formats lap times as the user types digits.
 * Typing "123456" produces "1:23.456".
 * Accepts and preserves already-formatted values (e.g. pasted "1:23.456").
 */
export function LapTimeInput({
  value,
  onChange,
  placeholder = '1:23.456',
  error,
}: LapTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (raw: string) => {
    // Strip everything except digits, colon, and dot
    const cleaned = raw.replace(/[^\d:.]/g, '');

    // If user typed/pasted something with colons or dots, accept as-is
    if (cleaned.includes(':') || cleaned.includes('.')) {
      onChange(cleaned);
      return;
    }

    // Pure digits → auto-format as M:SS.SSS
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 0) {
      onChange('');
      return;
    }

    let formatted = '';
    if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, -2)}:${digits.slice(-2)}`;
    } else {
      const millis = digits.slice(-3);
      const rest = digits.slice(0, -3);
      if (rest.length <= 2) {
        formatted = `${rest}.${millis}`;
      } else {
        formatted = `${rest.slice(0, -2)}:${rest.slice(-2)}.${millis}`;
      }
    }

    onChange(formatted);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => handleChange(e.target.value)}
      placeholder={placeholder}
      style={error ? { borderBottomColor: 'var(--red)' } : {}}
    />
  );
}
