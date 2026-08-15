import { useMemo } from 'react';
import { useUser } from '@clerk/react';
import { useGetRivalChallenges, getGetRivalChallengesQueryKey } from '@workspace/api-client-react';
import type { RivalChallengeRecord } from '@workspace/api-client-react';

// A challenge counts as an outstanding notification for exactly as long as it
// is unanswered: you are the opponent and you haven't attached a session yet.
// It clears the moment the attempt is submitted (status flips to completed)
// and never before — opening the Rivals tab does not dismiss it.
export function isAwaitingMyAttempt(c: RivalChallengeRecord): boolean {
  return c.status === 'pending' && c.opponent.isMe;
}

// The other half of the notification: a challenge that came back finished
// while you weren't the one to finish it. `resultSeen` is per-viewer and set
// server-side — the opponent's is marked the moment they submit, so this is
// almost always the creator being told their challenge was answered. It
// survives reloads and only clears when the driver acknowledges the result.
export function isUnseenResult(c: RivalChallengeRecord): boolean {
  return c.status === 'completed' && !c.resultSeen;
}

export interface RivalRecord {
  completed: number;
  wins: number;
  losses: number;
  opponents: number;
}

// Your own head-to-head record, from the challenge list you already have.
// Same rules the server uses for the public profile: only completed
// challenges count, and one with no winner (a dead heat, or times that
// couldn't be compared) counts as completed without landing in either
// column — so wins + losses can come to less than the total.
export function useRivalRecord(): RivalRecord {
  const { isSignedIn } = useUser();
  const { data: challenges = [] } = useGetRivalChallenges({
    query: { queryKey: getGetRivalChallengesQueryKey(), enabled: !!isSignedIn },
  });

  return useMemo(() => {
    const record: RivalRecord = { completed: 0, wins: 0, losses: 0, opponents: 0 };
    const opponents = new Set<string>();

    for (const c of challenges) {
      if (c.status !== 'completed') continue;
      record.completed += 1;
      const me = c.creator.isMe ? c.creator : c.opponent;
      const them = c.creator.isMe ? c.opponent : c.creator;
      opponents.add(them.userId);
      if (!c.winnerUserId) continue;
      if (c.winnerUserId === me.userId) record.wins += 1;
      else record.losses += 1;
    }

    record.opponents = opponents.size;
    return record;
  }, [challenges]);
}

export interface RivalNotifications {
  /** Challenges waiting for you to log a time. */
  awaitingMyAttempt: RivalChallengeRecord[];
  /** Finished challenges whose result you haven't acknowledged. */
  unseenResults: RivalChallengeRecord[];
  /** What the badges show. */
  count: number;
}

// One place every badge reads from — sidebar, Community tab, Dashboard — so
// they can never disagree about how many things are waiting. Polled and
// refetched on focus: a notification that only appears on a full page reload
// isn't one.
export function useRivalNotifications(): RivalNotifications {
  const { isSignedIn } = useUser();
  const { data: challenges = [] } = useGetRivalChallenges({
    query: {
      queryKey: getGetRivalChallengesQueryKey(),
      // Signed out there is nothing to poll for, and the endpoint 401s —
      // don't put a guest's browser on a one-minute loop against it.
      enabled: !!isSignedIn,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  });

  return useMemo(() => {
    const awaitingMyAttempt = challenges.filter(isAwaitingMyAttempt);
    const unseenResults = challenges.filter(isUnseenResult);
    return {
      awaitingMyAttempt,
      unseenResults,
      count: awaitingMyAttempt.length + unseenResults.length,
    };
  }, [challenges]);
}
