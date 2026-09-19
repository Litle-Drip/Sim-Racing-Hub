import { Router } from "express";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, sessionsTable, carAliasesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { UpsertCarAliasBody } from "@workspace/api-zod";
import { unidentifiedCars } from "../lib/carIdentity";

const router = Router();

// Naming cars the companion couldn't identify. See lib/carIdentity.ts for why
// an unidentified car is reported as unidentified rather than guessed at.

router.get("/car-aliases", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;

  try {
    const aliases = await db
      .select({ teamId: carAliasesTable.teamId, label: carAliasesTable.label })
      .from(carAliasesTable)
      .where(eq(carAliasesTable.userId, userId));

    // Everything the driver has logged whose car label names no actual car.
    // Grouped in SQL rather than by pulling the sessions: a driver with a
    // long history has thousands of rows and this runs on page load.
    const rows = await db
      .select({
        car: sessionsTable.car,
        teamId: sessionsTable.teamId,
        sessions: sql<number>`count(*)::int`,
        lastSeen: sql<string>`max(${sessionsTable.date})`,
      })
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId))
      .groupBy(sessionsTable.car, sessionsTable.teamId);

    const unidentified = unidentifiedCars(rows);

    res.json({ aliases, unidentified });
  } catch (err) {
    req.log.error({ err }, "Failed to list car aliases");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/car-aliases/:teamId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const teamId = Number(req.params.teamId);

  if (!Number.isInteger(teamId) || teamId < 0 || teamId > 255) {
    res.status(400).json({ error: "teamId must be a whole number between 0 and 255" });
    return;
  }

  const parsed = UpsertCarAliasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const label = parsed.data.label.trim();
  if (label === "") {
    res.status(400).json({ error: "Name cannot be blank" });
    return;
  }

  try {
    // Read-then-write rather than onConflictDoUpdate: that needs the matching
    // unique constraint to exist in the database, and when it doesn't Postgres
    // rejects the statement outright instead of degrading to a plain insert —
    // which is how every track-note save once failed with a 500. The
    // constraint is created in lib/db/sql/2026-09-11-…​.sql; this works either
    // way.
    const [existing] = await db
      .select({ id: carAliasesTable.id })
      .from(carAliasesTable)
      .where(and(eq(carAliasesTable.userId, userId), eq(carAliasesTable.teamId, teamId)));

    if (existing) {
      await db
        .update(carAliasesTable)
        .set({ label, updatedAt: new Date() })
        .where(eq(carAliasesTable.id, existing.id));
    } else {
      await db.insert(carAliasesTable).values({
        id: randomBytes(16).toString("hex"),
        userId,
        teamId,
        label,
      });
    }

    // Apply it to what's already logged. Naming a car and then still seeing
    // "Unknown car (#129)" across your own history would make the feature
    // look broken — and sessions from before the raw id was captured can only
    // be reached through the label, which is why both are matched.
    const updated = await db
      .update(sessionsTable)
      .set({ car: label, teamId })
      .where(
        and(
          eq(sessionsTable.userId, userId),
          or(
            eq(sessionsTable.teamId, teamId),
            inArray(sessionsTable.car, [`Unknown car (#${teamId})`, `Team ${teamId}`]),
          ),
        ),
      )
      .returning({ id: sessionsTable.id });

    res.json({ teamId, label, sessionsUpdated: updated.length });
  } catch (err) {
    req.log.error({ err }, "Failed to save car alias");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/car-aliases/:teamId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const teamId = Number(req.params.teamId);

  if (!Number.isInteger(teamId)) {
    res.status(400).json({ error: "teamId must be a whole number" });
    return;
  }

  try {
    // Sessions keep the name already written onto them. Reverting them would
    // mean knowing which label each one had before, which isn't stored —
    // and silently renaming a driver's history back to "Unknown car (#129)"
    // is not what "remove this name" asks for.
    const deleted = await db
      .delete(carAliasesTable)
      .where(and(eq(carAliasesTable.userId, userId), eq(carAliasesTable.teamId, teamId)))
      .returning({ id: carAliasesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Car alias not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete car alias");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
