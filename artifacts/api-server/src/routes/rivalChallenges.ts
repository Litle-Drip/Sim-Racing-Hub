import { Router } from "express";
import { eq, and, or } from "drizzle-orm";
import { db, rivalChallengesTable, sessionsTable, type DbRivalChallenge, type DbSession } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import { CreateRivalChallengeBody, SubmitRivalChallengeAttemptBody } from "@workspace/api-zod";

const router = Router();

function lapToSeconds(lap: string): number {
  if (!lap || !lap.includes(":")) {
    const n = parseFloat(lap);
    return isNaN(n) ? Infinity : n;
  }
  const parts = lap.split(":");
  const mins = parseFloat(parts[0]);
  const secs = parseFloat(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return Infinity;
  return mins * 60 + secs;
}

// Metric used to decide a winner: for a 1-lap challenge it's the best lap,
// for an N-lap challenge it's the total time across the first N logged
// laps. If the session doesn't have enough individual laps recorded (e.g.
// summary-only entries), fall back to avgLap * lapCount as an estimate.
function raceMetricSeconds(session: DbSession, lapCount: number): number | null {
  if (lapCount <= 1) {
    return session.bestLap ? lapToSeconds(session.bestLap) : null;
  }
  const laps = (session.laps ?? []).filter((l) => l.time && l.time.trim() !== "");
  if (laps.length >= lapCount) {
    return laps.slice(0, lapCount).reduce((sum, l) => sum + lapToSeconds(l.time), 0);
  }
  if (session.avgLap) {
    return lapToSeconds(session.avgLap) * lapCount;
  }
  return null;
}

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

async function findUserByUsername(
  username: string,
): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  const resp = await fetch(
    `https://api.clerk.com/v1/users?username[]=${encodeURIComponent(username)}&limit=1`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!resp.ok) return null;
  const users = (await resp.json()) as Array<{
    id: string;
    username?: string | null;
    first_name?: string | null;
    image_url?: string | null;
  }>;
  if (users.length === 0) return null;
  const u = users[0];
  return {
    id: u.id,
    name: u.username ?? (u.first_name ? u.first_name : "Anonymous"),
    avatarUrl: u.image_url ?? null,
  };
}

function summarizeSession(s: DbSession) {
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

async function serializeChallenge(row: DbRivalChallenge, currentUserId: string) {
  const sessionIds = [row.creatorSessionId, ...(row.opponentSessionId ? [row.opponentSessionId] : [])];
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(or(...sessionIds.map((id) => eq(sessionsTable.id, id))));
  const creatorSession = sessions.find((s) => s.id === row.creatorSessionId);
  const opponentSession = row.opponentSessionId ? sessions.find((s) => s.id === row.opponentSessionId) : undefined;

  const nameMap = await getDisplayNames([row.creatorId, row.opponentId]);

  let winnerUserId: string | null = null;
  if (creatorSession && opponentSession) {
    const creatorMetric = raceMetricSeconds(creatorSession, row.lapCount);
    const opponentMetric = raceMetricSeconds(opponentSession, row.lapCount);
    if (creatorMetric !== null && opponentMetric !== null) {
      winnerUserId = opponentMetric < creatorMetric ? row.opponentId : row.creatorId;
    }
  }

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
  };
}

router.get("/rival-challenges", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(rivalChallengesTable)
      .where(or(eq(rivalChallengesTable.creatorId, userId), eq(rivalChallengesTable.opponentId, userId)));

    const serialized = await Promise.all(rows.map((r) => serializeChallenge(r, userId)));
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
      .set({ opponentSessionId: session.id, status: "completed", completedAt: new Date() })
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
