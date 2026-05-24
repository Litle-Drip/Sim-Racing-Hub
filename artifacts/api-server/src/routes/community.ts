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
    notes: r.notes,
    authorName,
    isOwn,
    avgRating,
    ratingCount,
    sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
  };
}

router.get("/community/setups", async (req, res) => {
  const { trackId, car, tag } = req.query as Record<string, string | undefined>;
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
      isPublic: saved.isPublic,
      sharedAt: saved.sharedAt ? saved.sharedAt.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to import setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/community/sessions", async (req, res) => {
  const { userId: currentUserId } = getAuth(req);

  try {
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.isPublic, true));

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const nameMap = await getDisplayNames(userIds);

    res.json(
      rows
        .sort((a, b) => (b.sharedAt?.getTime() ?? 0) - (a.sharedAt?.getTime() ?? 0))
        .map((r) => ({
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
          publicNote: r.publicNote ?? null,
          authorName: nameMap[r.userId] ?? "Anonymous",
          isOwn: currentUserId ? r.userId === currentUserId : false,
          sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
        })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get community sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
