import { Router } from "express";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { db, friendshipsTable, sessionsTable, type DbFriendship } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import { AddFriendBody } from "@workspace/api-zod";
import { findUserByUsername } from "./rivalChallenges";
import { getProfiles, type ClerkProfile } from "../lib/clerkProfiles";

const router = Router();

// How many sessions the friends feed returns across all friends.
const FEED_LIMIT = 40;

type Activity = {
  lastActiveAt: string | null;
  sharedSessions: number;
  lastSession: {
    id: string;
    date: string;
    trackId: string;
    car: string;
    type: string;
    bestLap: string;
  } | null;
};

// "Last on" is deliberately computed over *all* of a driver's sessions, not
// just the shared ones — it's a timestamp, it says nothing about what they
// drove. The session summary next to it comes only from sessions they chose
// to make public, so nothing private is exposed by being someone's friend.
async function getActivity(userIds: string[]): Promise<Record<string, Activity>> {
  const empty: Activity = { lastActiveAt: null, sharedSessions: 0, lastSession: null };
  if (userIds.length === 0) return {};

  const rows = await db
    .select({
      userId: sessionsTable.userId,
      id: sessionsTable.id,
      date: sessionsTable.date,
      trackId: sessionsTable.trackId,
      car: sessionsTable.car,
      type: sessionsTable.type,
      bestLap: sessionsTable.bestLap,
      isPublic: sessionsTable.isPublic,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .where(inArray(sessionsTable.userId, userIds));

  const out: Record<string, Activity> = {};
  for (const id of userIds) out[id] = { ...empty };

  for (const r of rows) {
    const a = out[r.userId];
    if (!a) continue;
    const at = r.createdAt.toISOString();
    if (!a.lastActiveAt || at > a.lastActiveAt) a.lastActiveAt = at;
    if (!r.isPublic) continue;
    a.sharedSessions += 1;
    if (!a.lastSession || r.date > a.lastSession.date) {
      a.lastSession = {
        id: r.id,
        date: r.date,
        trackId: normalizeTrackId(r.trackId),
        car: r.car,
        type: r.type,
        bestLap: r.bestLap,
      };
    }
  }

  return out;
}

function otherUserId(row: DbFriendship, userId: string): string {
  return row.requesterId === userId ? row.addresseeId : row.requesterId;
}

function serialize(
  row: DbFriendship,
  userId: string,
  profiles: Record<string, ClerkProfile>,
  activity: Record<string, Activity>,
) {
  const them = otherUserId(row, userId);
  const profile = profiles[them];
  const a = activity[them] ?? { lastActiveAt: null, sharedSessions: 0, lastSession: null };
  return {
    id: row.id,
    userId: them,
    username: profile?.username ?? "Unknown driver",
    avatarUrl: profile?.avatarUrl ?? null,
    status: row.status,
    direction: row.requesterId === userId ? "outgoing" : "incoming",
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: a.lastActiveAt,
    sharedSessions: a.sharedSessions,
    lastSession: a.lastSession,
  };
}

async function allFriendshipsFor(userId: string): Promise<DbFriendship[]> {
  return db
    .select()
    .from(friendshipsTable)
    .where(or(eq(friendshipsTable.requesterId, userId), eq(friendshipsTable.addresseeId, userId)));
}

router.get("/friends", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await allFriendshipsFor(userId);
    const others = [...new Set(rows.map((r) => otherUserId(r, userId)))];
    const [profiles, activity] = await Promise.all([getProfiles(others), getActivity(others)]);

    const all = rows.map((r) => serialize(r, userId, profiles, activity));
    const accepted = all
      .filter((r) => r.status === "accepted")
      .sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? ""));

    res.json({
      friends: accepted,
      incoming: all.filter((r) => r.status === "pending" && r.direction === "incoming"),
      outgoing: all.filter((r) => r.status === "pending" && r.direction === "outgoing"),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get friends");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/friends/sessions", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await allFriendshipsFor(userId);
    const friendIds = rows.filter((r) => r.status === "accepted").map((r) => otherUserId(r, userId));
    if (friendIds.length === 0) {
      res.json([]);
      return;
    }

    // Never select the `laps` column here — it carries per-lap telemetry
    // traces, and this is a feed spanning every friend's shared history.
    const sessions = await db
      .select({
        id: sessionsTable.id,
        userId: sessionsTable.userId,
        date: sessionsTable.date,
        trackId: sessionsTable.trackId,
        car: sessionsTable.car,
        type: sessionsTable.type,
        bestLap: sessionsTable.bestLap,
        avgLap: sessionsTable.avgLap,
        conditions: sessionsTable.conditions,
        publicNote: sessionsTable.publicNote,
        sharedAt: sessionsTable.sharedAt,
        createdAt: sessionsTable.createdAt,
      })
      .from(sessionsTable)
      .where(and(inArray(sessionsTable.userId, friendIds), eq(sessionsTable.isPublic, true)))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(FEED_LIMIT);

    const profiles = await getProfiles([...new Set(sessions.map((s) => s.userId))]);

    res.json(
      sessions.map((s) => ({
        id: s.id,
        username: profiles[s.userId]?.username ?? "Unknown driver",
        date: s.date,
        trackId: normalizeTrackId(s.trackId),
        car: s.car,
        type: s.type,
        bestLap: s.bestLap,
        avgLap: s.avgLap,
        conditions: s.conditions,
        publicNote: s.publicNote ?? null,
        sharedAt: s.sharedAt ? s.sharedAt.toISOString() : null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get friend sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/friends", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = AddFriendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const target = await findUserByUsername(parsed.data.username);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: "You can't add yourself" });
      return;
    }

    // Look for a row in either direction — the unique constraint only covers
    // (requester, addressee), so the mirror pair has to be checked here.
    const [existing] = await db
      .select()
      .from(friendshipsTable)
      .where(
        or(
          and(eq(friendshipsTable.requesterId, userId), eq(friendshipsTable.addresseeId, target.id)),
          and(eq(friendshipsTable.requesterId, target.id), eq(friendshipsTable.addresseeId, userId)),
        ),
      );

    if (existing) {
      // They already asked you: treat "add them back" as accepting, which is
      // what the driver means by it.
      if (existing.status === "pending" && existing.addresseeId === userId) {
        await db
          .update(friendshipsTable)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(eq(friendshipsTable.id, existing.id));
        const [saved] = await db
          .select()
          .from(friendshipsTable)
          .where(eq(friendshipsTable.id, existing.id));
        const [profiles, activity] = await Promise.all([
          getProfiles([target.id]),
          getActivity([target.id]),
        ]);
        res.status(201).json(serialize(saved!, userId, profiles, activity));
        return;
      }
      res.status(409).json({
        error:
          existing.status === "accepted"
            ? `You and ${target.name} are already friends`
            : `You've already sent ${target.name} a friend request`,
      });
      return;
    }

    const id = crypto.randomUUID();
    await db.insert(friendshipsTable).values({
      id,
      requesterId: userId,
      addresseeId: target.id,
      status: "pending",
    });

    const [saved] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve created friend request" });
      return;
    }
    const [profiles, activity] = await Promise.all([
      getProfiles([target.id]),
      getActivity([target.id]),
    ]);
    res.status(201).json(serialize(saved, userId, profiles, activity));
  } catch (err) {
    req.log.error({ err }, "Failed to send friend request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/friends/:id/accept", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [row] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
    // Only the addressee can accept, and only while it's still pending.
    if (!row || row.addresseeId !== userId || row.status !== "pending") {
      res.status(404).json({ error: "Friend request not found" });
      return;
    }

    await db
      .update(friendshipsTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(friendshipsTable.id, id));

    const [saved] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve accepted friend request" });
      return;
    }
    const them = otherUserId(saved, userId);
    const [profiles, activity] = await Promise.all([getProfiles([them]), getActivity([them])]);
    res.json(serialize(saved, userId, profiles, activity));
  } catch (err) {
    req.log.error({ err }, "Failed to accept friend request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/friends/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [row] = await db.select().from(friendshipsTable).where(eq(friendshipsTable.id, id));
    // Either side can drop the row, whatever state it's in — that covers
    // unfriending, declining a request, and cancelling one you sent.
    if (!row || (row.requesterId !== userId && row.addresseeId !== userId)) {
      res.status(404).json({ error: "Friend not found" });
      return;
    }

    await db.delete(friendshipsTable).where(eq(friendshipsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove friend");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
