import type { SessionRecord } from '@workspace/api-client-react';

const DEMO_MODE_KEY = 'f1simhub-demo-mode';
const GUEST_SESSIONS_KEY = 'f1simhub-guest-sessions';

export function isDemoMode(): boolean {
  try { return sessionStorage.getItem(DEMO_MODE_KEY) === '1'; } catch { return false; }
}

/** Seeds guest storage with sample sessions (only if the guest hasn't logged anything of their own yet) and flags this browsing session as a demo. */
export function enterDemoMode(sampleSessions: SessionRecord[]): void {
  try {
    sessionStorage.setItem(DEMO_MODE_KEY, '1');
    const existing = localStorage.getItem(GUEST_SESSIONS_KEY);
    const hasExisting = existing ? (JSON.parse(existing) as unknown[]).length > 0 : false;
    if (!hasExisting) {
      localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(sampleSessions));
    }
  } catch { /* ignore */ }
}

/** Clears sample data before a demo visitor signs up, so fake sessions never get migrated into their real account. */
export function exitDemoMode(): void {
  try {
    if (isDemoMode()) {
      localStorage.removeItem(GUEST_SESSIONS_KEY);
    }
    sessionStorage.removeItem(DEMO_MODE_KEY);
  } catch { /* ignore */ }
}
