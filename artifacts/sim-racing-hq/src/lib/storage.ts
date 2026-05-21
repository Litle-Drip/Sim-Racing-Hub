export interface Session {
  id: string;
  date: string;
  trackId: string;
  car: string;
  type: string;
  bestLap: string;
  avgLap: string;
  worstLap: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  fuelLoad: number;
  conditions: string;
  assists: string;
  rating: number;
  notes: string;
  isPB: boolean;
}

export interface Corner {
  id: string;
  number: number;
  name: string;
  gear: string;
  brakingPoint: string;
  lineNotes: string;
  myNotes: string;
}

export interface TrackNotes {
  corners: Corner[];
}

export interface Setup {
  id: string;
  label: string;
  car: string;
  trackId: string;
  tag: string;
  date: string;
  frontWing: number | string;
  rearWing: number | string;
  frontARB: number | string;
  rearARB: number | string;
  frontRideHeight: number | string;
  rearRideHeight: number | string;
  frontSprings: number | string;
  rearSprings: number | string;
  brakeBias: number | string;
  brakePressure: number | string;
  onThrottle: number | string;
  offThrottle: number | string;
  notes: string;
}

const SESSIONS_KEY = 'sim_sessions';
const TRACK_NOTES_KEY = 'sim_track_notes';
const SETUPS_KEY = 'sim_setups';

export function getSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  } catch { return []; }
}

export function saveSessions(sessions: Session[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getTrackNotes(): Record<string, TrackNotes> {
  try {
    return JSON.parse(localStorage.getItem(TRACK_NOTES_KEY) || '{}');
  } catch { return {}; }
}

export function saveTrackNotes(notes: Record<string, TrackNotes>): void {
  localStorage.setItem(TRACK_NOTES_KEY, JSON.stringify(notes));
}

export function getSetups(): Setup[] {
  try {
    return JSON.parse(localStorage.getItem(SETUPS_KEY) || '[]');
  } catch { return []; }
}

export function saveSetups(setups: Setup[]): void {
  localStorage.setItem(SETUPS_KEY, JSON.stringify(setups));
}

export function lapToSeconds(lap: string): number {
  if (!lap || !lap.includes(':')) {
    const n = parseFloat(lap);
    return isNaN(n) ? Infinity : n;
  }
  const parts = lap.split(':');
  const mins = parseFloat(parts[0]);
  const secs = parseFloat(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return Infinity;
  return mins * 60 + secs;
}

export function isFasterLap(a: string, b: string): boolean {
  if (!a || a.trim() === '') return false;
  if (!b || b.trim() === '') return true;
  return lapToSeconds(a) < lapToSeconds(b);
}

export function detectAndMarkPBs(sessions: Session[]): Session[] {
  const pbMap: Record<string, string> = {};
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const updated = sorted.map(s => {
    const key = `${s.trackId}__${s.car.toLowerCase().trim()}`;
    const currentPB = pbMap[key];
    const isNewPB = isFasterLap(s.bestLap, currentPB);
    if (isNewPB && s.bestLap && s.bestLap.trim() !== '') {
      pbMap[key] = s.bestLap;
    }
    return { ...s, isPB: isNewPB };
  });
  return updated;
}

export function addSession(session: Omit<Session, 'id' | 'isPB'>): void {
  const sessions = getSessions();
  const newSession: Session = { ...session, id: crypto.randomUUID(), isPB: false };
  const all = detectAndMarkPBs([...sessions, newSession]);
  saveSessions(all);
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter(s => s.id !== id);
  const updated = detectAndMarkPBs(sessions);
  saveSessions(updated);
}

export function getPBForTrackCar(trackId: string, car: string): string | null {
  const sessions = getSessions().filter(
    s => s.trackId === trackId && s.car.toLowerCase().trim() === car.toLowerCase().trim() && s.bestLap
  );
  if (sessions.length === 0) return null;
  const fastest = sessions.reduce((best, s) =>
    lapToSeconds(s.bestLap) < lapToSeconds(best.bestLap) ? s : best
  );
  return fastest.bestLap;
}

export function getTrackPB(trackId: string): string | null {
  const sessions = getSessions().filter(s => s.trackId === trackId && s.bestLap && s.bestLap.trim() !== '');
  if (sessions.length === 0) return null;
  const fastest = sessions.reduce((best, s) =>
    lapToSeconds(s.bestLap) < lapToSeconds(best.bestLap) ? s : best
  );
  return fastest.bestLap;
}
