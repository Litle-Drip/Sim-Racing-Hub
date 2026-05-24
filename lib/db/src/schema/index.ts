import { pgTable, text, integer, boolean, real, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  trackId: text("track_id").notNull(),
  car: text("car").notNull(),
  type: text("type").notNull(),
  bestLap: text("best_lap").notNull().default(""),
  avgLap: text("avg_lap").notNull().default(""),
  worstLap: text("worst_lap").notNull().default(""),
  s1: text("s1").notNull().default(""),
  s2: text("s2").notNull().default(""),
  s3: text("s3").notNull().default(""),
  tires: text("tires").notNull().default(""),
  fuelLoad: real("fuel_load").notNull().default(0),
  conditions: text("conditions").notNull().default(""),
  assists: text("assists").notNull().default(""),
  rating: integer("rating").notNull().default(0),
  notes: text("notes").notNull().default(""),
  penalty: text("penalty").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  sharedAt: timestamp("shared_at"),
  publicNote: text("public_note"),
  laps: jsonb("laps").$type<Array<{ lap: number; time: string; s1: string; s2: string; s3: string; tires: string; penalty: string }>>(),
  isPB: boolean("is_pb").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DbSession = typeof sessionsTable.$inferSelect;
export type InsertDbSession = typeof sessionsTable.$inferInsert;

export const setupsTable = pgTable("setups", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  car: text("car").notNull(),
  trackId: text("track_id").notNull(),
  tag: text("tag").notNull().default(""),
  date: text("date").notNull(),
  frontWing: text("front_wing").notNull().default(""),
  rearWing: text("rear_wing").notNull().default(""),
  frontARB: text("front_arb").notNull().default(""),
  rearARB: text("rear_arb").notNull().default(""),
  frontRideHeight: text("front_ride_height").notNull().default(""),
  rearRideHeight: text("rear_ride_height").notNull().default(""),
  frontSprings: text("front_springs").notNull().default(""),
  rearSprings: text("rear_springs").notNull().default(""),
  brakeBias: text("brake_bias").notNull().default(""),
  brakePressure: text("brake_pressure").notNull().default(""),
  onThrottle: text("on_throttle").notNull().default(""),
  offThrottle: text("off_throttle").notNull().default(""),
  notes: text("notes").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  sharedAt: timestamp("shared_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DbSetup = typeof setupsTable.$inferSelect;
export type InsertDbSetup = typeof setupsTable.$inferInsert;

export const setupRatingsTable = pgTable("setup_ratings", {
  id: text("id").primaryKey(),
  setupId: text("setup_id").notNull(),
  raterId: text("rater_id").notNull(),
  stars: integer("stars").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("setup_ratings_uniq").on(t.setupId, t.raterId),
]);

export type DbSetupRating = typeof setupRatingsTable.$inferSelect;
export type InsertDbSetupRating = typeof setupRatingsTable.$inferInsert;

export const trackNotesTable = pgTable("track_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  trackId: text("track_id").notNull(),
  corners: jsonb("corners").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DbTrackNotes = typeof trackNotesTable.$inferSelect;
export type InsertDbTrackNotes = typeof trackNotesTable.$inferInsert;

export const hardwareSettingsTable = pgTable("hardware_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  peripheralType: text("peripheral_type").notNull().default("Wheel Base"),
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  trackId: text("track_id").notNull().default(""),
  game: text("game").notNull().default(""),
  date: text("date").notNull(),
  ffbStrength: text("ffb_strength").notNull().default(""),
  maxForce: text("max_force").notNull().default(""),
  damper: text("damper").notNull().default(""),
  friction: text("friction").notNull().default(""),
  linearity: text("linearity").notNull().default(""),
  steeringRange: text("steering_range").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DbHardwareSetting = typeof hardwareSettingsTable.$inferSelect;
export type InsertDbHardwareSetting = typeof hardwareSettingsTable.$inferInsert;
