import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';

// F1 25 telemetry is always captured in metric (km/h, °C). This provider lets
// the UI display it as either "US" (mph, °F) or "UK" (mph, °C) — the two
// regional conventions drivers actually asked for — while the underlying
// session data never changes.
export type UnitSystem = 'us' | 'uk';

export interface UnitsContextValue {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
  toggleSystem: () => void;
  speedUnit: 'mph' | 'km/h';
  tempUnit: '°F' | '°C';
  /** Convert a km/h value to the display speed number (unrounded). */
  convertSpeed: (kph: number) => number;
  /** Convert a °C value to the display temperature number (unrounded). */
  convertTemp: (celsius: number) => number;
  /** Format a km/h value as a display string, e.g. "217 mph". */
  formatSpeed: (kph: number | null | undefined, digits?: number) => string;
  /** Format a °C value as a display string, e.g. "104°F". */
  formatTemp: (celsius: number | null | undefined) => string;
}

const STORAGE_KEY = 'f1simhub-unit-system';

const UnitsContext = createContext<UnitsContextValue | null>(null);

function kphToMph(kph: number): number {
  return kph * 0.621371;
}

function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

// Countries that use Fahrenheit day-to-day (the "US" preset here is really
// "mph + °F"). Everyone else defaults to the "UK" preset (mph + °C), which
// matches how most drivers on this app already talk about lap telemetry.
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW', 'FM', 'MH']);

// No stored preference yet — guess from the browser's locale region (and, if
// that's unavailable, its timezone) so a US-based driver sees mph/°F on
// their very first visit instead of having to find the toggle.
function guessDefaultSystem(): UnitSystem {
  if (typeof navigator === 'undefined') return 'uk';
  const locales = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const loc of locales) {
    if (!loc) continue;
    try {
      const region = new Intl.Locale(loc).maximize().region;
      if (region) return FAHRENHEIT_REGIONS.has(region) ? 'us' : 'uk';
    } catch {
      // Intl.Locale not supported or locale string malformed — fall through.
    }
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.startsWith('America/') && !['America/Toronto', 'America/Vancouver', 'America/Montreal', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax'].includes(tz)) {
      return 'us';
    }
  } catch {
    // Intl.DateTimeFormat timezone resolution unavailable.
  }
  return 'uk';
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'us' || stored === 'uk' ? stored : guessDefaultSystem();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, system);
  }, [system]);

  const setSystem = useCallback((s: UnitSystem) => setSystemState(s), []);
  const toggleSystem = useCallback(() => setSystemState(s => s === 'us' ? 'uk' : 'us'), []);

  const value = useMemo<UnitsContextValue>(() => {
    // Both regional presets display speed in mph — the difference is temperature.
    const convertSpeed = (kph: number) => kphToMph(kph);
    const convertTemp = (celsius: number) => system === 'us' ? celsiusToFahrenheit(celsius) : celsius;

    return {
      system,
      setSystem,
      toggleSystem,
      speedUnit: 'mph',
      tempUnit: system === 'us' ? '°F' : '°C',
      convertSpeed,
      convertTemp,
      formatSpeed: (kph, digits = 0) => {
        if (kph == null || !isFinite(kph)) return '—';
        return `${convertSpeed(kph).toFixed(digits)} mph`;
      },
      formatTemp: (celsius) => {
        if (celsius == null || !isFinite(celsius)) return '—';
        return `${Math.round(convertTemp(celsius))}${system === 'us' ? '°F' : '°C'}`;
      },
    };
  }, [system, setSystem, toggleSystem]);

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used within a UnitsProvider');
  return ctx;
}
