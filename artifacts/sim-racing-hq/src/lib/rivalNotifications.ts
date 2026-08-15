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

// One place both the sidebar badge and the Community tab badge read from, so
// the two can never disagree about how many challenges are waiting. Polled and
// refetched on focus: the badge is a notification, and a notification that
// only appears on a full page reload isn't one.
export function useAwaitingMyAttempt(): RivalChallengeRecord[] {
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

  return useMemo(() => challenges.filter(isAwaitingMyAttempt), [challenges]);
}
