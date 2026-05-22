import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, hardwareSettingsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { CreateHardwareBody } from "@workspace/api-zod";

const router = Router();

router.get("/hardware", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  try {
    const rows = await db
      .select()
      .from(hardwareSettingsTable)
      .where(eq(hardwareSettingsTable.userId, userId));

    const records = rows.map((r) => ({
      id: r.id,
      label: r.label,
      peripheralType: r.peripheralType,
      brand: r.brand,
      model: r.model,
      trackId: r.trackId,
      game: r.game,
      date: r.date,
      ffbStrength: r.ffbStrength,
      maxForce: r.maxForce,
      damper: r.damper,
      friction: r.friction,
      linearity: r.linearity,
      steeringRange: r.steeringRange,
      notes: r.notes,
    }));

    res.json(records);
  } catch (err) {
    req.log.error({ err }, "Failed to get hardware profiles");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/hardware", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const parsed = CreateHardwareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const data = parsed.data;
  try {
    await db.insert(hardwareSettingsTable).values({
      id: data.id,
      userId,
      label: data.label,
      peripheralType: data.peripheralType ?? "Wheel Base",
      brand: data.brand ?? "",
      model: data.model ?? "",
      trackId: data.trackId ?? "",
      game: data.game ?? "",
      date: data.date,
      ffbStrength: String(data.ffbStrength ?? ""),
      maxForce: String(data.maxForce ?? ""),
      damper: String(data.damper ?? ""),
      friction: String(data.friction ?? ""),
      linearity: String(data.linearity ?? ""),
      steeringRange: String(data.steeringRange ?? ""),
      notes: data.notes ?? "",
    });

    const [saved] = await db
      .select()
      .from(hardwareSettingsTable)
      .where(
        and(
          eq(hardwareSettingsTable.id, data.id as string),
          eq(hardwareSettingsTable.userId, userId),
        ),
      );

    res.status(201).json({
      id: saved.id,
      label: saved.label,
      peripheralType: saved.peripheralType,
      brand: saved.brand,
      model: saved.model,
      trackId: saved.trackId,
      game: saved.game,
      date: saved.date,
      ffbStrength: saved.ffbStrength,
      maxForce: saved.maxForce,
      damper: saved.damper,
      friction: saved.friction,
      linearity: saved.linearity,
      steeringRange: saved.steeringRange,
      notes: saved.notes,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create hardware profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/hardware/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId as string;
  const id = req.params.id as string;

  try {
    const [existing] = await db
      .select()
      .from(hardwareSettingsTable)
      .where(
        and(
          eq(hardwareSettingsTable.id, id),
          eq(hardwareSettingsTable.userId, userId),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Hardware profile not found" });
      return;
    }

    await db
      .delete(hardwareSettingsTable)
      .where(
        and(
          eq(hardwareSettingsTable.id, id),
          eq(hardwareSettingsTable.userId, userId),
        ),
      );

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete hardware profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
