export type { SessionRecord as Session, SessionRecord } from "@workspace/api-client-react";
export type { SetupRecord as Setup, SetupRecord } from "@workspace/api-client-react";
export type { CornerNote as Corner, CornerNote } from "@workspace/api-client-react";
export type { TrackNotesRecord } from "@workspace/api-client-react";

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

// Handoff key used to jump from another page (e.g. Tracks' PB tile) straight
// to a specific session on the Sessions page, expanded and scrolled into view.
export const FOCUS_SESSION_KEY = 'f1simhub-focus-session';
