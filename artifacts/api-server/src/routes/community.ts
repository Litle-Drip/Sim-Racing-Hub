import { Router } from "express";
import { eq, and, avg, count, sql } from "drizzle-orm";
import { db, setupsTable, setupRatingsTable, sessionsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { getAuth } from "@clerk/express";

function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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
      last_name?: string | null;
      username?: string | null;
    }>;
    const map: Record<string, string> = {};
    for (const u of data) {
      if (u.username) {
        map[u.id] = u.username;
      } else if (u.first_name && !u.first_name.includes("@")) {
        map[u.id] = u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name;
      } else {
        map[u.id] = "Anonymous";
      }
    }
    return map;
  } catch {
    return {};
  }
}

function serializeCommunitySetup(
  r: typeof setupsTable.$inferSelect,
  avgRating: number | null,
  ratingCount: number,
  authorName: string,
  isOwn: boolean,
) {
  return {
    id: r.id,
    label: r.label,
    car: r.car,
    trackId: r.trackId,
    tag: r.tag,
    date: r.date,
    frontWing: r.frontWing,
    rearWing: r.rearWing,
    frontARB: r.frontARB,
    rearARB: r.rearARB,
    frontRideHeight: r.frontRideHeight,
    rearRideHeight: r.rearRideHeight,
    frontSprings: r.frontSprings,
    rearSprings: r.rearSprings,
    brakeBias: r.brakeBias,
    brakePressure: r.brakePressure,
    onThrottle: r.onThrottle,
    offThrottle: r.offThrottle,
    gameVersion: r.gameVersion,
    authorName,
    isOwn,
    avgRating,
    ratingCount,
    sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
  };
}

router.get("/community/setups", async (req, res) => {
  const { trackId, car, tag, gameVersion } = req.query as Record<string, string | undefined>;
  const { userId: currentUserId } = getAuth(req);
  try {
    const rows = await db
      .select({
        setup: setupsTable,
        avgRating: avg(setupRatingsTable.stars),
        ratingCount: count(setupRatingsTable.id),
      })
      .from(setupsTable)
      .leftJoin(setupRatingsTable, eq(setupsTable.id, setupRatingsTable.setupId))
      .where(
        and(
          eq(setupsTable.isPublic, true),
          trackId ? eq(setupsTable.trackId, trackId) : undefined,
          car ? sql`lower(${setupsTable.car}) like ${"%" + escapeLike(car.toLowerCase()) + "%"}` : undefined,
          tag ? eq(setupsTable.tag, tag) : undefined,
          gameVersion ? eq(setupsTable.gameVersion, gameVersion) : undefined,
        ),
      )
      .groupBy(setupsTable.id);

    const userIds = [...new Set(rows.map((r) => r.setup.userId))];
    const nameMap = await getDisplayNames(userIds);

    res.json(
      rows.map((r) =>
        serializeCommunitySetup(
          r.setup,
          r.avgRating ? Number(r.avgRating) : null,
          Number(r.ratingCount),
          nameMap[r.setup.userId] ?? "Anonymous",
          currentUserId ? r.setup.userId === currentUserId : false,
        ),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get community setups");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/community/setups/:id", async (req, res) => {
  const id = req.params.id as string;
  try {
    const [row] = await db
      .select({
        setup: setupsTable,
        avgRating: avg(setupRatingsTable.stars),
        ratingCount: count(setupRatingsTable.id),
      })
      .from(setupsTable)
      .leftJoin(setupRatingsTable, eq(setupsTable.id, setupRatingsTable.setupId))
      .where(and(eq(setupsTable.id, id), eq(setupsTable.isPublic, true)))
      .groupBy(setupsTable.id);

    if (!row) {
      res.status(404).json({ error: "Setup not found" });
      return;
    }

    const { userId: currentUserId } = getAuth(req);
    const nameMap = await getDisplayNames([row.setup.userId]);
    res.json(
      serializeCommunitySetup(
        row.setup,
        row.avgRating ? Number(row.avgRating) : null,
        Number(row.ratingCount),
        nameMap[row.setup.userId] ?? "Anonymous",
        currentUserId ? row.setup.userId === currentUserId : false,
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get community setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/community/setups/:id/rate", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;
  const { stars } = req.body as { stars?: unknown };

  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    res.status(400).json({ error: "stars must be 1–5" });
    return;
  }

  try {
    const [setup] = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.id, id), eq(setupsTable.isPublic, true)));

    if (!setup) {
      res.status(404).json({ error: "Setup not found" });
      return;
    }

    if (setup.userId === userId) {
      res.status(403).json({ error: "Cannot rate your own setup" });
      return;
    }

    await db
      .insert(setupRatingsTable)
      .values({ id: crypto.randomUUID(), setupId: id, raterId: userId, stars })
      .onConflictDoUpdate({
        target: [setupRatingsTable.setupId, setupRatingsTable.raterId],
        set: { stars, createdAt: new Date() },
      });

    const [agg] = await db
      .select({
        avgRating: avg(setupRatingsTable.stars),
        ratingCount: count(setupRatingsTable.id),
      })
      .from(setupRatingsTable)
      .where(eq(setupRatingsTable.setupId, id));

    res.json({
      avgRating: agg?.avgRating ? Number(agg.avgRating) : null,
      ratingCount: Number(agg?.ratingCount ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to rate setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/community/setups/:id/import", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [source] = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.id, id), eq(setupsTable.isPublic, true)));

    if (!source) {
      res.status(404).json({ error: "Setup not found" });
      return;
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 10);

    await db.insert(setupsTable).values({
      id: newId,
      userId,
      label: source.label,
      car: source.car,
      trackId: source.trackId,
      tag: source.tag,
      date: now,
      frontWing: source.frontWing,
      rearWing: source.rearWing,
      frontARB: source.frontARB,
      rearARB: source.rearARB,
      frontRideHeight: source.frontRideHeight,
      rearRideHeight: source.rearRideHeight,
      frontSprings: source.frontSprings,
      rearSprings: source.rearSprings,
      brakeBias: source.brakeBias,
      brakePressure: source.brakePressure,
      onThrottle: source.onThrottle,
      offThrottle: source.offThrottle,
      notes: source.notes,
      gameVersion: source.gameVersion,
      isPublic: false,
    });

    const [saved] = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.id, newId), eq(setupsTable.userId, userId)));

    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve imported setup" });
      return;
    }
    res.status(201).json({
      id: saved.id,
      label: saved.label,
      car: saved.car,
      trackId: saved.trackId,
      tag: saved.tag,
      date: saved.date,
      frontWing: saved.frontWing,
      rearWing: saved.rearWing,
      frontARB: saved.frontARB,
      rearARB: saved.rearARB,
      frontRideHeight: saved.frontRideHeight,
      rearRideHeight: saved.rearRideHeight,
      frontSprings: saved.frontSprings,
      rearSprings: saved.rearSprings,
      brakeBias: saved.brakeBias,
      brakePressure: saved.brakePressure,
      onThrottle: saved.onThrottle,
      offThrottle: saved.offThrottle,
      notes: saved.notes,
      gameVersion: saved.gameVersion,
      isPublic: saved.isPublic,
      sharedAt: saved.sharedAt ? saved.sharedAt.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to import setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

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

router.get("/community/sessions", async (req, res) => {
  const { userId: currentUserId } = getAuth(req);
  const { sort } = req.query as Record<string, string | undefined>;

  try {
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.isPublic, true));

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const nameMap = await getDisplayNames(userIds);

    const mapped = rows.map((r) => ({
      id: r.id,
      date: r.date,
      trackId: r.trackId,
      car: r.car,
      type: r.type,
      bestLap: r.bestLap,
      avgLap: r.avgLap,
      tires: r.tires,
      conditions: r.conditions,
      penalty: r.penalty,
      gameVersion: r.gameVersion,
      platform: r.platform,
      inputDevice: r.inputDevice,
      publicNote: r.publicNote ?? null,
      authorName: nameMap[r.userId] ?? "Anonymous",
      isOwn: currentUserId ? r.userId === currentUserId : false,
      sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
      rating: r.rating,
    }));

    if (sort === "recent") {
      mapped.sort((a, b) => (b.sharedAt ?? "").localeCompare(a.sharedAt ?? ""));
    } else if (sort === "rating") {
      mapped.sort((a, b) => b.rating - a.rating);
    } else {
      mapped.sort((a, b) => lapToSeconds(a.bestLap) - lapToSeconds(b.bestLap));
    }

    res.json(mapped);
  } catch (err) {
    req.log.error({ err }, "Failed to get community sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Public Driver Profile ────────────────────────────────────────────────────

router.get("/community/driver/:username", async (req, res) => {
  const { username } = req.params;
  if (!username || username.length > 100) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }

  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }

    // Look up user by username via Clerk
    const userResp = await fetch(
      `https://api.clerk.com/v1/users?username[]=${encodeURIComponent(username)}&limit=1`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!userResp.ok) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    const users = (await userResp.json()) as Array<{
      id: string;
      username?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      created_at?: number;
      image_url?: string | null;
    }>;

    if (users.length === 0) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }

    const user = users[0];
    const userId = user.id;
    const displayName = user.username ?? (user.first_name ? `${user.first_name} ${user.last_name ?? ""}`.trim() : "Anonymous");

    // Get public sessions
    const publicSessions = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.isPublic, true)));

    // Get public setups
    const publicSetups = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.userId, userId), eq(setupsTable.isPublic, true)));

    // Compute PBs per track from public sessions
    const pbMap: Record<string, { trackId: string; car: string; bestLap: string; date: string }> = {};
    publicSessions.forEach((s) => {
      if (!s.bestLap || s.bestLap.trim() === "") return;
      const existing = pbMap[s.trackId];
      if (!existing || lapToSeconds(s.bestLap) < lapToSeconds(existing.bestLap)) {
        pbMap[s.trackId] = { trackId: s.trackId, car: s.car, bestLap: s.bestLap, date: s.date };
      }
    });

    res.json({
      username: displayName,
      memberSince: user.created_at ? new Date(user.created_at).toISOString().slice(0, 10) : null,
      avatarUrl: user.image_url ?? null,
      sessions: publicSessions.length,
      setups: publicSetups.length,
      tracks: new Set(publicSessions.map(s => s.trackId)).size,
      pbs: Object.values(pbMap),
      recentSessions: publicSessions
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
        .map(s => ({
          id: s.id,
          date: s.date,
          trackId: s.trackId,
          car: s.car,
          type: s.type,
          bestLap: s.bestLap,
          conditions: s.conditions,
          platform: s.platform,
          inputDevice: s.inputDevice,
        })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get driver profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
