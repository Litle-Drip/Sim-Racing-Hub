import { Router } from "express";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import {
  db,
  leaguesTable,
  leagueMembersTable,
  sessionsTable,
  type DbLeague,
  type DbLeagueMember,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeTrackId } from "../lib/trackAlias";
import { lapToSeconds } from "../lib/rivalResults";
import { getProfiles, type ClerkProfile } from "../lib/clerkProfiles";
import { CreateLeagueBody, JoinLeagueBody, UpdateLeagueMemberRoleBody } from "@workspace/api-zod";

const router = Router();

// Ambiguity is the enemy of a code people read out on Discord or a stream —
// no O/0, no I/1.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

// Fallback seat-time estimate per session type, used when a session carries
// no lap timings to add up. Mirrors SESSION_TYPE_MINUTES in the frontend's
// lib/engagement.ts — this is the same "how long were they actually driving"
// question, asked of the whole league instead of one driver.
const SESSION_TYPE_MINUTES: Record<string, number> = {
  "Time Trial": 20,
  Practice: 30,
  Qualifying: 18,
  Race: 45,
  "Sprint Race": 25,
};
const DEFAULT_SESSION_MINUTES = 25;

const DEFAULT_ACTIVITY_DAYS = 30;
const MAX_ACTIVITY_DAYS = 365;

function randomCode(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// Codes are short enough to collide, and `leagues_join_code_uniq` is what
// makes a code resolve to exactly one league — so try a few and give up
// rather than ever storing a duplicate.
async function uniqueCode(): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const [taken] = await db.select({ id: leaguesTable.id }).from(leaguesTable).where(eq(leaguesTable.joinCode, code));
    if (!taken) return code;
  }
  return null;
}

function isStaffRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

// The ISO date (YYYY-MM-DD) `days` days ago. Sessions store `date` as that
// same text, so a plain string comparison is the window filter — and it
// uses the (user_id, date) index rather than scanning.
function windowStart(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function serializeLeague(
  league: DbLeague,
  role: string,
  memberCount: number,
) {
  const staff = isStaffRole(role);
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    ownerId: league.ownerId,
    // The invite code is a capability — anyone holding it can join. Only
    // staff, who are the ones handing it out, get it back.
    joinCode: staff ? league.joinCode : null,
    role,
    isStaff: staff,
    memberCount,
    createdAt: league.createdAt.toISOString(),
  };
}

function serializeMember(
  member: DbLeagueMember,
  profiles: Record<string, ClerkProfile>,
  lastActiveAt: string | null,
) {
  const profile = profiles[member.userId];
  return {
    userId: member.userId,
    username: profile?.username ?? "Unknown driver",
    avatarUrl: profile?.avatarUrl ?? null,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    lastActiveAt,
  };
}

type Access = { league: DbLeague; member: DbLeagueMember };

// Membership is the only way to see a league at all — a non-member gets a
// 404 rather than a 403, so league ids can't be probed for existence.
async function accessFor(leagueId: string, userId: string): Promise<Access | null> {
  const [league] = await db.select().from(leaguesTable).where(eq(leaguesTable.id, leagueId));
  if (!league) return null;
  const [member] = await db
    .select()
    .from(leagueMembersTable)
    .where(and(eq(leagueMembersTable.leagueId, leagueId), eq(leagueMembersTable.userId, userId)));
  if (!member) return null;
  return { league, member };
}

async function memberCounts(leagueIds: string[]): Promise<Record<string, number>> {
  if (leagueIds.length === 0) return {};
  const rows = await db
    .select({ leagueId: leagueMembersTable.leagueId, count: sql<number>`count(*)::int` })
    .from(leagueMembersTable)
    .where(inArray(leagueMembersTable.leagueId, leagueIds))
    .groupBy(leagueMembersTable.leagueId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.leagueId] = Number(r.count);
  return out;
}

// Sessions for a set of drivers, optionally windowed. `laps` is never
// selected — it carries the per-lap telemetry traces, and this reads every
// driver in a league at once. The lap count comes from the array's length,
// computed in Postgres.
function memberSessions(userIds: string[], since: string | null) {
  const where = since
    ? and(inArray(sessionsTable.userId, userIds), gte(sessionsTable.date, since))
    : inArray(sessionsTable.userId, userIds);
  return db
    .select({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      date: sessionsTable.date,
      trackId: sessionsTable.trackId,
      car: sessionsTable.car,
      type: sessionsTable.type,
      bestLap: sessionsTable.bestLap,
      avgLap: sessionsTable.avgLap,
      totalLaps: sessionsTable.totalLaps,
      createdAt: sessionsTable.createdAt,
      lapCount: sql<number>`coalesce(jsonb_array_length(${sessionsTable.laps}), 0)::int`,
    })
    .from(sessionsTable)
    .where(where);
}

// When each driver last logged a session, over their whole history. It says
// nothing about what they drove — the sessions themselves stay private.
async function lastActiveFor(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const rows = await db
    .select({
      userId: sessionsTable.userId,
      lastAt: sql<Date | string | null>`max(${sessionsTable.createdAt})`,
    })
    .from(sessionsTable)
    .where(inArray(sessionsTable.userId, userIds))
    .groupBy(sessionsTable.userId);
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.lastAt) continue;
    const at = new Date(r.lastAt);
    if (!isNaN(at.getTime())) out[r.userId] = at.toISOString();
  }
  return out;
}

type MemberSession = Awaited<ReturnType<typeof memberSessions>>[number];

function sessionLaps(s: MemberSession): number {
  const counted = Number(s.lapCount) || 0;
  if (counted > 0) return counted;
  return s.totalLaps ?? 0;
}

function sessionMinutes(s: MemberSession): number {
  const laps = sessionLaps(s);
  const avg = lapToSeconds(s.avgLap);
  if (laps > 0 && isFinite(avg) && avg > 0) return (avg * laps) / 60;
  return SESSION_TYPE_MINUTES[s.type] ?? DEFAULT_SESSION_MINUTES;
}

// ─── Leagues and membership ──────────────────────────────────────────────────

router.get("/leagues", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const memberships = await db
      .select()
      .from(leagueMembersTable)
      .where(eq(leagueMembersTable.userId, userId));
    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const ids = memberships.map((m) => m.leagueId);
    const [leagues, counts] = await Promise.all([
      db.select().from(leaguesTable).where(inArray(leaguesTable.id, ids)),
      memberCounts(ids),
    ]);
    const byId = new Map(leagues.map((l) => [l.id, l]));

    const out = memberships
      .map((m) => {
        const league = byId.get(m.leagueId);
        return league ? serializeLeague(league, m.role, counts[league.id] ?? 1) : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      // Leagues you run first — this page exists for the admin views.
      .sort((a, b) => Number(b.isStaff) - Number(a.isStaff) || a.name.localeCompare(b.name));

    res.json(out);
  } catch (err) {
    req.log.error({ err }, "Failed to get leagues");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leagues", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = CreateLeagueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Give the league a name" });
    return;
  }

  try {
    const joinCode = await uniqueCode();
    if (!joinCode) {
      res.status(500).json({ error: "Couldn't generate a join code — try again" });
      return;
    }

    const id = crypto.randomUUID();
    await db.insert(leaguesTable).values({
      id,
      name,
      description: parsed.data.description?.trim() ?? "",
      ownerId: userId,
      joinCode,
    });
    await db.insert(leagueMembersTable).values({
      id: crypto.randomUUID(),
      leagueId: id,
      userId,
      role: "owner",
    });

    const [saved] = await db.select().from(leaguesTable).where(eq(leaguesTable.id, id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve created league" });
      return;
    }
    res.status(201).json(serializeLeague(saved, "owner", 1));
  } catch (err) {
    req.log.error({ err }, "Failed to create league");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leagues/join", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = JoinLeagueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const code = parsed.data.joinCode.trim().toUpperCase();

  try {
    const [league] = await db.select().from(leaguesTable).where(eq(leaguesTable.joinCode, code));
    if (!league) {
      res.status(404).json({ error: "No league with that code" });
      return;
    }

    const [existing] = await db
      .select()
      .from(leagueMembersTable)
      .where(and(eq(leagueMembersTable.leagueId, league.id), eq(leagueMembersTable.userId, userId)));
    if (existing) {
      res.status(409).json({ error: `You're already in ${league.name}` });
      return;
    }

    await db.insert(leagueMembersTable).values({
      id: crypto.randomUUID(),
      leagueId: league.id,
      userId,
      role: "member",
    });

    const counts = await memberCounts([league.id]);
    res.status(201).json(serializeLeague(league, "member", counts[league.id] ?? 1));
  } catch (err) {
    req.log.error({ err }, "Failed to join league");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leagues/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;

  try {
    const access = await accessFor(leagueId, userId);
    if (!access) {
      res.status(404).json({ error: "League not found" });
      return;
    }

    const members = await db
      .select()
      .from(leagueMembersTable)
      .where(eq(leagueMembersTable.leagueId, leagueId));
    const ids = members.map((m) => m.userId);
    const staff = isStaffRole(access.member.role);

    // "Last on" is a staff column. Members see who's in the league; only the
    // people running it see how engaged everyone is.
    const [profiles, lastActive] = await Promise.all([
      getProfiles(ids),
      staff ? lastActiveFor(ids) : Promise.resolve({} as Record<string, string>),
    ]);

    const roleRank = (role: string) => (role === "owner" ? 0 : role === "admin" ? 1 : 2);
    const serialized = members
      .map((m) => serializeMember(m, profiles, staff ? (lastActive[m.userId] ?? null) : null))
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.username.localeCompare(b.username));

    res.json({
      league: serializeLeague(access.league, access.member.role, members.length),
      members: serialized,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get league");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/leagues/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;

  try {
    const access = await accessFor(leagueId, userId);
    if (!access) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    if (access.league.ownerId !== userId) {
      res.status(403).json({ error: "Only the league owner can delete it" });
      return;
    }

    await db.delete(leagueMembersTable).where(eq(leagueMembersTable.leagueId, leagueId));
    await db.delete(leaguesTable).where(eq(leaguesTable.id, leagueId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete league");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leagues/:id/join-code", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;

  try {
    const access = await accessFor(leagueId, userId);
    if (!access) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    if (!isStaffRole(access.member.role)) {
      res.status(403).json({ error: "Only league staff can change the invite code" });
      return;
    }

    const joinCode = await uniqueCode();
    if (!joinCode) {
      res.status(500).json({ error: "Couldn't generate a join code — try again" });
      return;
    }
    await db.update(leaguesTable).set({ joinCode }).where(eq(leaguesTable.id, leagueId));

    const counts = await memberCounts([leagueId]);
    res.json(serializeLeague({ ...access.league, joinCode }, access.member.role, counts[leagueId] ?? 1));
  } catch (err) {
    req.log.error({ err }, "Failed to regenerate league join code");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/leagues/:id/members/:userId", requireAuth, async (req, res) => {
  const actorId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;
  const targetId = req.params.userId as string;
  const parsed = UpdateLeagueMemberRoleBody.safeParse(req.body);
  if (!parsed.success || (parsed.data.role !== "admin" && parsed.data.role !== "member")) {
    res.status(400).json({ error: "Role must be admin or member" });
    return;
  }

  try {
    const access = await accessFor(leagueId, actorId);
    if (!access) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    // Promoting someone to staff hands them the activity board over every
    // member's sessions, so it stays with the owner alone.
    if (access.league.ownerId !== actorId) {
      res.status(403).json({ error: "Only the league owner can change roles" });
      return;
    }
    if (targetId === access.league.ownerId) {
      res.status(400).json({ error: "The owner's role can't be changed" });
      return;
    }

    const [target] = await db
      .select()
      .from(leagueMembersTable)
      .where(and(eq(leagueMembersTable.leagueId, leagueId), eq(leagueMembersTable.userId, targetId)));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    await db
      .update(leagueMembersTable)
      .set({ role: parsed.data.role })
      .where(eq(leagueMembersTable.id, target.id));

    const [saved] = await db.select().from(leagueMembersTable).where(eq(leagueMembersTable.id, target.id));
    if (!saved) {
      res.status(500).json({ error: "Failed to retrieve updated member" });
      return;
    }
    const [profiles, lastActive] = await Promise.all([getProfiles([targetId]), lastActiveFor([targetId])]);
    res.json(serializeMember(saved, profiles, lastActive[targetId] ?? null));
  } catch (err) {
    req.log.error({ err }, "Failed to update league member role");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/leagues/:id/members/:userId", requireAuth, async (req, res) => {
  const actorId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;
  const targetId = req.params.userId as string;

  try {
    const access = await accessFor(leagueId, actorId);
    if (!access) {
      res.status(404).json({ error: "League not found" });
      return;
    }

    const leavingSelf = targetId === actorId;
    if (!leavingSelf && !isStaffRole(access.member.role)) {
      res.status(403).json({ error: "Only league staff can remove members" });
      return;
    }
    if (targetId === access.league.ownerId) {
      res.status(400).json({
        error: leavingSelf
          ? "Delete the league instead — an owner can't leave their own league"
          : "The league owner can't be removed",
      });
      return;
    }

    const [target] = await db
      .select()
      .from(leagueMembersTable)
      .where(and(eq(leagueMembersTable.leagueId, leagueId), eq(leagueMembersTable.userId, targetId)));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    // An admin removing another admin would let staff fight over the roster;
    // demotion is the owner's call, so removal is too.
    if (!leavingSelf && isStaffRole(target.role) && access.league.ownerId !== actorId) {
      res.status(403).json({ error: "Only the league owner can remove another admin" });
      return;
    }

    await db.delete(leagueMembersTable).where(eq(leagueMembersTable.id, target.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove league member");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Staff-only views ────────────────────────────────────────────────────────
//
// These two are the reason the league section exists. A league organiser
// running a championship on Discord has no way to see whether their grid is
// actually putting in laps between rounds — the leaderboard answers "who is
// quick here", the activity board answers "who is even showing up".

async function requireStaff(
  leagueId: string,
  userId: string,
): Promise<{ access: Access } | { status: number; error: string }> {
  const access = await accessFor(leagueId, userId);
  if (!access) return { status: 404, error: "League not found" };
  if (!isStaffRole(access.member.role)) {
    return { status: 403, error: "League staff only" };
  }
  return { access };
}

router.get("/leagues/:id/leaderboard", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;

  try {
    const gate = await requireStaff(leagueId, userId);
    if ("status" in gate) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.floor(rawDays), MAX_ACTIVITY_DAYS) : null;
    const requestedTrack = typeof req.query.trackId === "string" && req.query.trackId
      ? normalizeTrackId(req.query.trackId)
      : null;

    const members = await db
      .select()
      .from(leagueMembersTable)
      .where(eq(leagueMembersTable.leagueId, leagueId));
    const memberIds = members.map((m) => m.userId);
    const roleById = new Map(members.map((m) => [m.userId, m.role]));

    const sessions = await memberSessions(memberIds, days ? windowStart(days) : null);
    const profiles = await getProfiles(memberIds);

    // Which tracks the league has actually driven, most driven first — the
    // track picker is built from this rather than from all 24 circuits, so
    // it only ever offers tracks with times on them.
    const perTrack = new Map<string, { sessions: number; drivers: Set<string> }>();
    for (const s of sessions) {
      const trackId = normalizeTrackId(s.trackId);
      const entry = perTrack.get(trackId) ?? { sessions: 0, drivers: new Set<string>() };
      entry.sessions += 1;
      entry.drivers.add(s.userId);
      perTrack.set(trackId, entry);
    }
    const trackOptions = [...perTrack.entries()]
      .map(([trackId, v]) => ({ trackId, sessions: v.sessions, drivers: v.drivers.size }))
      .sort((a, b) => b.sessions - a.sessions || a.trackId.localeCompare(b.trackId));

    const trackId = requestedTrack ?? trackOptions[0]?.trackId ?? null;

    type Best = {
      seconds: number;
      bestLap: string;
      car: string;
      date: string;
      sessionId: string;
      sessions: number;
      laps: number;
      lastDrivenAt: string | null;
    };
    const bestByDriver = new Map<string, Best>();

    if (trackId) {
      for (const s of sessions) {
        if (normalizeTrackId(s.trackId) !== trackId) continue;
        const at = s.createdAt.toISOString();
        const existing = bestByDriver.get(s.userId);
        const tally = {
          sessions: (existing?.sessions ?? 0) + 1,
          laps: (existing?.laps ?? 0) + sessionLaps(s),
          lastDrivenAt:
            existing?.lastDrivenAt && existing.lastDrivenAt > at ? existing.lastDrivenAt : at,
        };

        const seconds = s.bestLap ? lapToSeconds(s.bestLap) : Infinity;
        // A session with no lap time still counts as an attempt on the track
        // — it lands in the driver's session and lap tallies, and shows them
        // under "no time here yet" rather than dropping them entirely.
        if (!isFinite(seconds) || seconds <= 0) {
          bestByDriver.set(s.userId, {
            seconds: Infinity,
            bestLap: "",
            car: s.car,
            date: s.date,
            sessionId: s.id,
            ...existing,
            ...tally,
          });
          continue;
        }
        if (!existing || !isFinite(existing.seconds) || seconds < existing.seconds) {
          bestByDriver.set(s.userId, {
            seconds,
            bestLap: s.bestLap,
            car: s.car,
            date: s.date,
            sessionId: s.id,
            ...tally,
          });
        } else {
          bestByDriver.set(s.userId, { ...existing, ...tally });
        }
      }
    }

    const ranked = [...bestByDriver.entries()]
      .filter(([, b]) => isFinite(b.seconds))
      .sort((a, b) => a[1].seconds - b[1].seconds);
    const leader = ranked[0]?.[1].seconds ?? null;

    const entries = ranked.map(([driverId, b]) => ({
      userId: driverId,
      username: profiles[driverId]?.username ?? "Unknown driver",
      avatarUrl: profiles[driverId]?.avatarUrl ?? null,
      role: roleById.get(driverId) ?? "member",
      bestLap: b.bestLap,
      bestLapSeconds: Math.round(b.seconds * 1000) / 1000,
      gapToLeader: leader === null ? null : Math.round((b.seconds - leader) * 1000) / 1000,
      car: b.car,
      date: b.date,
      sessionId: b.sessionId,
      sessions: b.sessions,
      laps: b.laps,
      lastDrivenAt: b.lastDrivenAt,
    }));

    // Who hasn't set a time here yet — the half of a leaderboard an
    // organiser chasing a grid actually needs.
    const ranked_ids = new Set(entries.map((e) => e.userId));
    const lastActive = await lastActiveFor(members.filter((m) => !ranked_ids.has(m.userId)).map((m) => m.userId));
    const missing = members
      .filter((m) => !ranked_ids.has(m.userId))
      .map((m) => serializeMember(m, profiles, lastActive[m.userId] ?? null))
      .sort((a, b) => a.username.localeCompare(b.username));

    res.json({ trackId, days, entries, missing, trackOptions });
  } catch (err) {
    req.log.error({ err }, "Failed to get league leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leagues/:id/activity", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const leagueId = req.params.id as string;

  try {
    const gate = await requireStaff(leagueId, userId);
    if ("status" in gate) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(Math.floor(rawDays), MAX_ACTIVITY_DAYS)
      : DEFAULT_ACTIVITY_DAYS;
    const since = windowStart(days);

    const members = await db
      .select()
      .from(leagueMembersTable)
      .where(eq(leagueMembersTable.leagueId, leagueId));
    const memberIds = members.map((m) => m.userId);

    const [sessions, profiles, lastActive] = await Promise.all([
      memberSessions(memberIds, since),
      getProfiles(memberIds),
      // Last on is all-time on purpose: for a dormant driver, "3 months ago"
      // is the useful answer, and "nothing in the window" is not.
      lastActiveFor(memberIds),
    ]);

    type Tally = {
      sessions: number;
      laps: number;
      minutes: number;
      tracks: Set<string>;
      dates: Set<string>;
      bestSeconds: number;
      bestLap: string | null;
      bestLapTrackId: string | null;
    };
    const tallies = new Map<string, Tally>();
    const daily = new Map<string, { sessions: number; drivers: Set<string> }>();

    for (const s of sessions) {
      const t = tallies.get(s.userId) ?? {
        sessions: 0,
        laps: 0,
        minutes: 0,
        tracks: new Set<string>(),
        dates: new Set<string>(),
        bestSeconds: Infinity,
        bestLap: null,
        bestLapTrackId: null,
      };
      t.sessions += 1;
      t.laps += sessionLaps(s);
      t.minutes += sessionMinutes(s);
      t.tracks.add(normalizeTrackId(s.trackId));
      if (s.date) t.dates.add(s.date);
      const seconds = s.bestLap ? lapToSeconds(s.bestLap) : Infinity;
      if (isFinite(seconds) && seconds > 0 && seconds < t.bestSeconds) {
        t.bestSeconds = seconds;
        t.bestLap = s.bestLap;
        t.bestLapTrackId = normalizeTrackId(s.trackId);
      }
      tallies.set(s.userId, t);

      if (s.date) {
        const d = daily.get(s.date) ?? { sessions: 0, drivers: new Set<string>() };
        d.sessions += 1;
        d.drivers.add(s.userId);
        daily.set(s.date, d);
      }
    }

    const drivers = members
      .map((m) => {
        const t = tallies.get(m.userId);
        return {
          userId: m.userId,
          username: profiles[m.userId]?.username ?? "Unknown driver",
          avatarUrl: profiles[m.userId]?.avatarUrl ?? null,
          role: m.role,
          sessions: t?.sessions ?? 0,
          laps: t?.laps ?? 0,
          seatTimeMinutes: Math.round(t?.minutes ?? 0),
          tracks: t?.tracks.size ?? 0,
          daysActive: t?.dates.size ?? 0,
          lastActiveAt: lastActive[m.userId] ?? null,
          bestLap: t?.bestLap ?? null,
          bestLapTrackId: t?.bestLapTrackId ?? null,
          joinedAt: m.joinedAt.toISOString(),
        };
      })
      // Busiest first, and drivers who've done nothing sink to the bottom
      // where an organiser can see the whole dormant group at once.
      .sort((a, b) => b.sessions - a.sessions || b.laps - a.laps || a.username.localeCompare(b.username));

    // Every day in the window, including the empty ones — a chart with gaps
    // silently reads as "quieter than it was".
    const dailyOut: Array<{ date: string; sessions: number; drivers: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${since}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      const hit = daily.get(date);
      dailyOut.push({ date, sessions: hit?.sessions ?? 0, drivers: hit?.drivers.size ?? 0 });
    }

    const activeDrivers = drivers.filter((d) => d.sessions > 0).length;
    res.json({
      days,
      generatedAt: new Date().toISOString(),
      totals: {
        members: members.length,
        activeDrivers,
        dormantDrivers: members.length - activeDrivers,
        sessions: drivers.reduce((sum, d) => sum + d.sessions, 0),
        laps: drivers.reduce((sum, d) => sum + d.laps, 0),
        seatTimeMinutes: drivers.reduce((sum, d) => sum + d.seatTimeMinutes, 0),
      },
      drivers,
      daily: dailyOut,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get league activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
