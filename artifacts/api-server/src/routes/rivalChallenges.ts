import { Router } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, rivalChallengesTable, sessionsTable, type DbRivalChallenge } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import { CreateRivalChallengeBody, SubmitRivalChallengeAttemptBody } from "@workspace/api-zod";
import { raceMetricSeconds, decideWinner } from "../lib/rivalResults";
import { lapsWithoutTrace } from "../lib/sessionQueries";

const router = Router();

async function getDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return {};
  try {
    const params = new URLSearchParams();
    userIds.forEach((id) => params.append("user_id[]", id));
    params.set("limit", "100");
    const resp = await fetch(`https://api.clerk.com/v1/users?${params}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!resp.ok) return {};
    const data = (await resp.json()) as Array<{
      id: string;
      first_name?: string | null;
      username?: string | null;
    }>;
    const map: Record<string, string> = {};
    for (const u of data) {
      map[u.id] = u.username ?? (u.first_name && !u.first_name.includes("@") ? u.first_name : "Anonymous");
    }
    return map;
  } catch {
    return {};
  }
}

// Never trust position in a Clerk result set — always confirm the user
// handed back actually owns the username that was asked for. Clerk returns
// a plain list, and any request it can't apply the username filter to
// degrades into "first user in the instance", which is how challenging
// `slumlordmillionaire` addressed a completely unrelated account. Same
// verification the public driver profile lookup does.
export async function findUserByUsername(
  username: string,
): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  type ClerkUser = {
    id: string;
    username?: string | null;
    first_name?: string | null;
    image_url?: string | null;
  };

  const wanted = username.trim().toLowerCase();
  const matches = (u: ClerkUser) => !!u.username && u.username.toLowerCase() === wanted;

  const lookup = async (query: string): Promise<ClerkUser[]> => {
    const resp = await fetch(`https://api.clerk.com/v1/users?${query}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!resp.ok) return [];
    return (await resp.json()) as ClerkUser[];
  };

  // Exact filter first. It's case-sensitive, so fall back to Clerk's fuzzy
  // `query` search for usernames typed with different casing.
  let user = (await lookup(`username[]=${encodeURIComponent(username.trim())}&limit=10`)).find(matches);
  if (!user) {
    user = (await lookup(`query=${encodeURIComponent(username.trim())}&limit=20`)).find(matches);
  }
  if (!user) return null;

  return {
    id: user.id,
    // Profiles are addressed by username, so that's the name shown — never
    // a real name off the account, which the driver never chose to publish.
    name: user.username ?? "Anonymous",
    avatarUrl: user.image_url ?? null,
  };
}

// Only the columns raceMetricSeconds/summarizeSession read — never the
// full row, and never per-lap telemetry traces (`laps` is fetched with
// trace already stripped, same as the session list endpoint).
const CHALLENGE_SESSION_COLUMNS = {
  id: sessionsTable.id,
  date: sessionsTable.date,
  bestLap: sessionsTable.bestLap,
  avgLap: sessionsTable.avgLap,
  s1: sessionsTable.s1,
  s2: sessionsTable.s2,
  s3: sessionsTable.s3,
  laps: lapsWithoutTrace,
};
type ChallengeSession = Awaited<ReturnType<typeof fetchChallengeSessions>>[number];

async function fetchChallengeSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  return db.select(CHALLENGE_SESSION_COLUMNS).from(sessionsTable).where(inArray(sessionsTable.id, sessionIds));
}

function summarizeSession(s: ChallengeSession) {
  return {
    id: s.id,
    date: s.date,
    bestLap: s.bestLap,
    avgLap: s.avgLap,
    s1: s.s1,
    s2: s.s2,
    s3: s.s3,
  };
}

// Serializes a batch of challenges in a fixed number of queries — one for
// every session referenced across the whole batch, and one for every
// player's display name — instead of one of each per challenge. This is
// the list endpoint's hot path: it's polled every 60s sitewide, so an
// N+1 here was re-running for every signed-in user regardless of what
// page they were on.
async function serializeChallenges(rows: DbRivalChallenge[], currentUserId: string) {
  const sessionIds = [...new Set(rows.flatMap((r) => [r.creatorSessionId, ...(r.opponentSessionId ? [r.opponentSessionId] : [])]))];
  const sessions = await fetchChallengeSessions(sessionIds);
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const userIds = [...new Set(rows.flatMap((r) => [r.creatorId, r.opponentId]))];
  const nameMap = await getDisplayNames(userIds);

  return rows.map((row) => {
    const creatorSession = sessionMap.get(row.creatorSessionId);
    const opponentSession = row.opponentSessionId ? sessionMap.get(row.opponentSessionId) : undefined;

    const winnerUserId =
      creatorSession && opponentSession
        ? decideWinner(
            raceMetricSeconds(creatorSession, row.lapCount),
            raceMetricSeconds(opponentSession, row.lapCount),
            row.creatorId,
            row.opponentId,
          )
        : null;

    const isCreator = row.creatorId === currentUserId;

    return {
      id: row.id,
      status: row.status,
      trackId: normalizeTrackId(row.trackId),
      car: row.car,
      lapCount: row.lapCount,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      creator: { userId: row.creatorId, name: nameMap[row.creatorId] ?? "Anonymous", isMe: row.creatorId === currentUserId },
      opponent: { userId: row.opponentId, name: nameMap[row.opponentId] ?? "Anonymous", isMe: row.opponentId === currentUserId },
      creatorSession: creatorSession
        ? { ...summarizeSession(creatorSession), raceTimeSeconds: raceMetricSeconds(creatorSession, row.lapCount) }
        : null,
      opponentSession: opponentSession
        ? { ...summarizeSession(opponentSession), raceTimeSeconds: raceMetricSeconds(opponentSession, row.lapCount) }
        : null,
      winnerUserId,
      // Whether *this* viewer has acknowledged the result. Only meaningful
      // once the challenge is completed; that's what keeps the "you won /
      // you lost" notification up for the driver who wasn't the one to
      // finish it.
      resultSeen: isCreator ? row.creatorSeenResult : row.opponentSeenResult,
    };
  });
}

async function serializeChallenge(row: DbRivalChallenge, currentUserId: string) {
  const [result] = await serializeChallenges([row], currentUserId);
  return result;
}

router.get("/rival-challenges", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(rivalChallengesTable)
      .where(or(eq(rivalChallengesTable.creatorId, userId), eq(rivalChallengesTable.opponentId, userId)));

    const serialized = await serializeChallenges(rows, userId);
    serialized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(serialized);
  } catch (err) {
    req.log.error({ err }, "Failed to get rival challenges");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/rival-challenges/lookup-user", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const username = (req.query.username as string | undefined)?.trim();
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  try {
    const found = await findUserByUsername(username);
    if (!found) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (found.id === userId) {
      res.status(400).json({ error: "You can't challenge yourself" });
      return;
    }
    res.json({ userId: found.id, name: found.name, avatarUrl: found.avatarUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to look up user for rival challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rival-challenges", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = CreateRivalChallengeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { sessionId, opponentUsername, message } = parsed.data;
  const lapCount = parsed.data.lapCount && parsed.data.lapCount > 0 ? Math.floor(parsed.data.lapCount) : 1;

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const opponent = await findUserByUsername(opponentUsername);
    if (!opponent) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (opponent.id === userId) {
      res.status(400).json({ error: "You can't challenge yourself" });
      return;
    }

    const id = crypto.randomUUID();
    await db.insert(rivalChallengesTable).values({
      id,
      creatorId: userId,
      opponentId: opponent.id,
      trackId: session.trackId,
      car: session.car,
      lapCount,
      message: message ?? "",
      creatorSessionId: session.id,
      opponentSessionId: null,
      status: "pending",
    });

    const [saved] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve created challenge" });
      return;
    }
    res.status(201).json(await serializeChallenge(saved, userId));
  } catch (err) {
    req.log.error({ err }, "Failed to create rival challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rival-challenges/:id/attempt", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;
  const parsed = SubmitRivalChallengeAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [challenge] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!challenge || challenge.opponentId !== userId) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }
    if (challenge.status !== "pending") {
      res.status(400).json({ error: "Challenge is not pending" });
      return;
    }

    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, parsed.data.sessionId), eq(sessionsTable.userId, userId)));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (normalizeTrackId(session.trackId) !== normalizeTrackId(challenge.trackId)) {
      res.status(400).json({ error: "That session is at a different track than the challenge" });
      return;
    }

    await db
      .update(rivalChallengesTable)
      .set({
        opponentSessionId: session.id,
        status: "completed",
        completedAt: new Date(),
        // The opponent is looking at the result the instant they submit,
        // so it's already seen for them. The creator's stays false — that's
        // the notification telling them their challenge came back.
        opponentSeenResult: true,
        creatorSeenResult: false,
      })
      .where(eq(rivalChallengesTable.id, id));

    const [saved] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve updated challenge" });
      return;
    }
    res.json(await serializeChallenge(saved, userId));
  } catch (err) {
    req.log.error({ err }, "Failed to submit rival challenge attempt");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rival-challenges/:id/seen", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [challenge] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!challenge || (challenge.creatorId !== userId && challenge.opponentId !== userId)) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }

    await db
      .update(rivalChallengesTable)
      .set(
        challenge.creatorId === userId
          ? { creatorSeenResult: true }
          : { opponentSeenResult: true },
      )
      .where(eq(rivalChallengesTable.id, id));

    const [saved] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve challenge" });
      return;
    }
    res.json(await serializeChallenge(saved, userId));
  } catch (err) {
    req.log.error({ err }, "Failed to mark rival challenge result as seen");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/rival-challenges/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [challenge] = await db.select().from(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    if (!challenge || challenge.creatorId !== userId) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }
    if (challenge.status !== "pending") {
      res.status(400).json({ error: "Only pending challenges can be cancelled" });
      return;
    }

    await db.delete(rivalChallengesTable).where(eq(rivalChallengesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to cancel rival challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
