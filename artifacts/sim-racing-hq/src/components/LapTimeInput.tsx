import { useRef } from 'react';

interface LapTimeInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  readOnly?: boolean;
  style?: React.CSSProperties;
  className?: string;
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
  readOnly,
  style: styleProp,
  className,
}: LapTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (raw: string) => {
    // Strip everything except digits, colon, and dot
    const cleaned = raw.replace(/[^\d:.]/g, '');

    // If user typed/pasted something with colons or dots
    if (cleaned.includes(':') || cleaned.includes('.')) {
      // Handle mobile: user types "1.38.234" meaning "1:38.234"
      // If there are 2+ dots and no colon, convert the first dot to colon
      if (!cleaned.includes(':')) {
        const dotCount = (cleaned.match(/\./g) || []).length;
        if (dotCount >= 2) {
          const firstDotIdx = cleaned.indexOf('.');
          onChange(cleaned.slice(0, firstDotIdx) + ':' + cleaned.slice(firstDotIdx + 1));
          return;
        }
      }
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
      // Not enough digits yet to know where minutes end and seconds begin.
      formatted = digits;
    } else {
      // From the 3rd digit on, digit 1 is always minutes, the next two are
      // seconds, and anything after that is milliseconds — keeping this
      // mapping fixed as more digits arrive (rather than re-slicing from
      // the end) avoids a digit shifting from seconds into minutes mid-type
      // (e.g. "1234" briefly reading as "12:34" instead of "1:23.4").
      const capped = digits.slice(0, 6); // M + SS + SSS
      const minutes = capped.slice(0, 1);
      const seconds = capped.slice(1, 3);
      const millis = capped.slice(3, 6);
      formatted = millis ? `${minutes}:${seconds}.${millis}` : `${minutes}:${seconds}`;
    }

    onChange(formatted);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="text"
      value={value}
      onChange={readOnly ? undefined : e => handleChange(e.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      className={className}
      style={{
        ...(error ? { borderBottomColor: 'var(--red)' } : {}),
        ...(readOnly ? { opacity: 0.55, cursor: 'default' } : {}),
        ...styleProp,
      }}
    />
  );
}
