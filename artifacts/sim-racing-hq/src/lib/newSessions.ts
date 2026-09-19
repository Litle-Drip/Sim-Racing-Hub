import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/react';
import type { SessionRecord } from '@workspace/api-client-react';

/**
 * Tracks which sessions the driver has already looked at, so a session that
 * lands while they're using the app (a companion-app upload finishing mid-race,
 * a session logged on another device) can announce itself with a glow until
 * it's opened.
 *
 * The seen-set is persisted per account. The first time an account is seen on
 * this browser every existing session is marked read in one go — otherwise a
 * fresh sign-in would light up the driver's entire history.
 */

const SEEN_PREFIX = 'f1simhub-seen-sessions-';

function storageKey(userId: string): string {
  return SEEN_PREFIX + userId;
}

function loadSeen(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === null) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Unreadable or corrupt — treat as "never initialised" so the next write
    // re-baselines instead of glowing everything.
    return null;
  }
}

function persistSeen(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  } catch {
    // Storage full or unavailable — the glow just won't survive a reload.
  }
}

export interface UnseenSessions {
  /** True for a session that has arrived since the driver last looked. */
  isNew: (sessionId: string) => boolean;
  /** Count of sessions currently glowing. */
  newCount: number;
  /** Mark one session read — call it when the driver opens the session. */
  markSeen: (sessionId: string) => void;
  /** Mark every currently-unseen session read. */
  markAllSeen: () => void;
}

export function useUnseenSessions(sessions: SessionRecord[]): UnseenSessions {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? 'guest';

  // null = not yet loaded for this account; the glow stays off until it is,
  // so a session never flashes new on the way to being recognised as old.
  const [seen, setSeen] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    setSeen(loadSeen(userId));
  }, [isLoaded, userId]);

  // First run for this account: everything already on file counts as read.
  useEffect(() => {
    if (!isLoaded || seen !== null || sessions.length === 0) return;
    if (loadSeen(userId) !== null) return;
    const baseline = new Set(sessions.map(s => s.id));
    persistSeen(userId, baseline);
    setSeen(baseline);
  }, [isLoaded, seen, sessions, userId]);

  const unseenIds = useMemo(() => {
    if (seen === null) return new Set<string>();
    return new Set(sessions.filter(s => !seen.has(s.id)).map(s => s.id));
  }, [sessions, seen]);

  // Drop ids for sessions that no longer exist so the list can't grow without
  // bound as sessions are deleted and re-uploaded.
  const commit = useCallback((next: Set<string>) => {
    const live = new Set(sessions.map(s => s.id));
    const pruned = new Set([...next].filter(id => live.has(id)));
    persistSeen(userId, pruned);
    setSeen(pruned);
  }, [sessions, userId]);

  const markSeen = useCallback((sessionId: string) => {
    if (seen === null || seen.has(sessionId)) return;
    commit(new Set(seen).add(sessionId));
  }, [commit, seen]);

  const markAllSeen = useCallback(() => {
    if (seen === null) return;
    commit(new Set(sessions.map(s => s.id)));
  }, [commit, seen, sessions]);

  const isNew = useCallback((sessionId: string) => unseenIds.has(sessionId), [unseenIds]);

  return { isNew, newCount: unseenIds.size, markSeen, markAllSeen };
}
