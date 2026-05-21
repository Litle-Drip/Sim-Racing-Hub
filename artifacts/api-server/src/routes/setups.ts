import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, setupsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { CreateSetupBody } from "@workspace/api-zod";

const router = Router();

router.get("/setups", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(setupsTable)
      .where(eq(setupsTable.userId, userId));

    const setups = rows.map((r) => ({
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
    }));

    res.json(setups);
  } catch (err) {
    req.log.error({ err }, "Failed to get setups");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/setups", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = CreateSetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const data = parsed.data;
  try {
    await db.insert(setupsTable).values({
      id: data.id,
      userId,
      label: data.label,
      car: data.car,
      trackId: data.trackId,
      tag: data.tag ?? "",
      date: data.date,
      frontWing: String(data.frontWing),
      rearWing: String(data.rearWing),
      frontARB: String(data.frontARB),
      rearARB: String(data.rearARB),
      frontRideHeight: String(data.frontRideHeight),
      rearRideHeight: String(data.rearRideHeight),
      frontSprings: String(data.frontSprings),
      rearSprings: String(data.rearSprings),
      brakeBias: String(data.brakeBias),
      brakePressure: String(data.brakePressure),
      onThrottle: String(data.onThrottle),
      offThrottle: String(data.offThrottle),
      notes: data.notes,
    });

    const [saved] = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.id, data.id as string), eq(setupsTable.userId, userId)));

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
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/setups/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [existing] = await db
      .select()
      .from(setupsTable)
      .where(and(eq(setupsTable.id, id as string), eq(setupsTable.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Setup not found" });
      return;
    }

    await db
      .delete(setupsTable)
      .where(and(eq(setupsTable.id, id as string), eq(setupsTable.userId, userId)));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
