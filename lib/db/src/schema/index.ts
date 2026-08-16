import { pgTable, text, integer, boolean, real, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  keyHash: text("key_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DbApiKey = typeof apiKeysTable.$inferSelect;
export type InsertDbApiKey = typeof apiKeysTable.$inferInsert;

// One sample of a lap's distance trace. gear/rpm/drs were added after the
// first companion release, so they're absent from traces already stored.
export type DbLapTraceSample = {
  d: number;
  speed: number;
  throttle: number;
  brake: number;
  steer: number;
  gear?: number;
  rpm?: number;
  drs?: number;
};

export type DbLapPenalty = {
  type: number;
  infringement: number;
  seconds: number;
  placesGained: number;
};

// A single lap as uploaded by the companion app. Everything past `trace` is
// per-lap telemetry that only laps tracked live carry — laps recovered from
// the game's own session-history record have timings and validity only, and
// sessions uploaded by older companion builds have none of it.
export type DbLapRecord = {
  lap: number;
  time: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  penalty: string;
  trace?: DbLapTraceSample[];
  lapTimeMs?: number;
  s1Ms?: number;
  s2Ms?: number;
  s3Ms?: number;
  valid?: boolean;
  actualCompound?: string;
  tyreAgeLaps?: number;
  position?: number;
  topSpeedKph?: number;
  avgThrottlePct?: number;
  avgBrakePct?: number;
  maxRpm?: number;
  fuelUsedKg?: number;
  fuelAtEndKg?: number;
  fuelMix?: number;
  tyreWearEndPct?: [number, number, number, number];
  tyreSurfaceTempsEnd?: [number, number, number, number];
  tyreInnerTempsEnd?: [number, number, number, number];
  brakeTempsEnd?: [number, number, number, number];
  ersDeployedMJ?: number;
  ersHarvestedMJ?: number;
  ersStoreEndMJ?: number;
  ersDeployMode?: number;
  warningsThisLap?: number;
  cornerCuttingWarningsThisLap?: number;
  totalWarnings?: number;
  penalties?: DbLapPenalty[];
  speedTrapKph?: number;
  pitted?: boolean;
  pitLaneTimeMs?: number;
  pitStopTimeMs?: number;
  flashbacks?: number;
};

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
  timeOfDay: text("time_of_day"),
  assists: text("assists").notNull().default(""),
  rating: integer("rating").notNull().default(0),
  notes: text("notes").notNull().default(""),
  penalty: text("penalty").notNull().default(""),
  gameVersion: text("game_version").notNull().default(""),
  platform: text("platform").notNull().default(""),
  inputDevice: text("input_device").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  sharedAt: timestamp("shared_at"),
  publicNote: text("public_note"),
  laps: jsonb("laps").$type<DbLapRecord[]>()
,
  position: text("position").notNull().default(""),
  isPB: boolean("is_pb").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Extended telemetry — all nullable so existing sessions are unaffected
  trackTemperature: integer("track_temperature"),
  airTemperature: integer("air_temperature"),
  totalLaps: integer("total_laps"),
  pitSpeedLimit: integer("pit_speed_limit"),
  safetyCarStatus: integer("safety_car_status"),
  fuelInTank: real("fuel_in_tank"),
  ersDeployMode: integer("ers_deploy_mode"),
  ersEnergyStored: real("ers_energy_stored"),
  ersDeployedThisLap: real("ers_deployed_this_lap"),
  tyreWear: jsonb("tyre_wear").$type<[number, number, number, number]>(),
  wingDamage: jsonb("wing_damage").$type<{ front: number; rear: number }>(),
  tyreSurfaceTemps: jsonb("tyre_surface_temps").$type<[number, number, number, number]>(),
  brakeTemps: jsonb("brake_temps").$type<[number, number, number, number]>(),
  setupSnapshot: jsonb("setup_snapshot").$type<{
    frontWing: number; rearWing: number; onThrottle: number; offThrottle: number;
    frontCamber: number; rearCamber: number; frontToe: number; rearToe: number;
    frontSuspension: number; rearSuspension: number; frontAntiRollBar: number; rearAntiRollBar: number;
    frontRideHeight: number; rearRideHeight: number; brakePressure: number; brakeBias: number;
    frontTyrePressure: number; rearTyrePressure: number;
  }>()
,
  tyreStints: jsonb("tyre_stints").$type<Array<{ startLap: number; endLap: number; compound: string; visualCompound: string }>>()
,
  lapHistory: jsonb("lap_history").$type<Array<{ lap: number; lapTimeMs: number; sector1Ms: number; sector2Ms: number; sector3Ms: number; valid: boolean; sector1Valid?: boolean; sector2Valid?: boolean; sector3Valid?: boolean }>>()
,
  aiDifficulty: integer("ai_difficulty"),
  topSpeedKph: real("top_speed_kph"),
  avgThrottlePct: real("avg_throttle_pct"),
  avgBrakePct: real("avg_brake_pct"),
  drsActivations: integer("drs_activations"),
  maxRpm: integer("max_rpm"),
  topGear: integer("top_gear"),
  fuelRemainingLaps: real("fuel_remaining_laps"),
  actualTyreCompound: text("actual_tyre_compound"),
  tyreAgeLaps: integer("tyre_age_laps"),
  pitStops: integer("pit_stops"),
  fuelCapacity: real("fuel_capacity"),
  startingFuelKg: real("starting_fuel_kg"),
  engineMaxRpm: integer("engine_max_rpm"),
  engineTemperature: integer("engine_temperature"),
  vehicleFiaFlags: integer("vehicle_fia_flags"),
  tyrePressureLive: jsonb("tyre_pressure_live").$type<[number, number, number, number]>(),
  floorDamage: integer("floor_damage"),
  diffuserDamage: integer("diffuser_damage"),
  sidepodDamage: integer("sidepod_damage"),
  gearBoxDamage: integer("gear_box_damage"),
  engineDamage: integer("engine_damage"),
  liveBrakeBias: integer("live_brake_bias"),
  tyreDamage: jsonb("tyre_damage").$type<[number, number, number, number]>(),
  brakesDamage: jsonb("brakes_damage").$type<[number, number, number, number]>(),
  // F1 25/26 only — the F1 24 CarDamage packet has no blister array.
  tyreBlisters: jsonb("tyre_blisters").$type<[number, number, number, number]>(),
  tyreInnerTemps: jsonb("tyre_inner_temps").$type<[number, number, number, number]>(),
  engineWear: jsonb("engine_wear").$type<{ mguh: number; es: number; ce: number; ice: number; mguk: number; tc: number }>(),
  ersHarvestedThisLap: real("ers_harvested_this_lap"),
  fuelMix: integer("fuel_mix"),
  speedTrapKph: real("speed_trap_kph"),
  flashbacks: integer("flashbacks"),
  collisions: integer("collisions"),
  safetyCarPeriods: integer("safety_car_periods"),
  redFlags: integer("red_flags"),
  totalWarnings: integer("total_warnings"),
  cornerCuttingWarnings: integer("corner_cutting_warnings"),
  bestLapNum: integer("best_lap_num"),
  bestSector1LapNum: integer("best_sector1_lap_num"),
  bestSector2LapNum: integer("best_sector2_lap_num"),
  bestSector3LapNum: integer("best_sector3_lap_num"),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
  index("sessions_user_id_date_idx").on(t.userId, t.date),
  index("sessions_is_public_idx").on(t.isPublic),
]);

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
  // Suspension geometry and tyre pressures. Added later than the rest, so
  // setups saved before this default to "" rather than carrying a value —
  // the UI renders those as "—" like any other blank field. The companion
  // captures all six off the game's CarSetup packet, which is what makes
  // "save setup from a session" able to fill them in without typing.
  frontCamber: text("front_camber").notNull().default(""),
  rearCamber: text("rear_camber").notNull().default(""),
  frontToe: text("front_toe").notNull().default(""),
  rearToe: text("rear_toe").notNull().default(""),
  frontTyrePressure: text("front_tyre_pressure").notNull().default(""),
  rearTyrePressure: text("rear_tyre_pressure").notNull().default(""),
  notes: text("notes").notNull().default(""),
  gameVersion: text("game_version").notNull().default(""),
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

export const trackDifficultyTable = pgTable("track_difficulty", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  trackId: text("track_id").notNull(),
  rating: integer("rating").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("track_difficulty_uniq").on(t.userId, t.trackId),
]);

export type DbTrackDifficulty = typeof trackDifficultyTable.$inferSelect;
export type InsertDbTrackDifficulty = typeof trackDifficultyTable.$inferInsert;

export const trackNotesTable = pgTable("track_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  trackId: text("track_id").notNull(),
  corners: jsonb("corners").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("track_notes_uniq").on(t.userId, t.trackId),
]);

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

// A rival challenge pairs one of the creator's existing sessions (the
// target to beat) with an opponent, identified by Clerk user id. The
// opponent later attaches one of their own sessions as their attempt.
// lapCount === 1 means "beat this best lap" (Time Trial); lapCount > 1
// means "beat this total time across N laps" (race).
export const rivalChallengesTable = pgTable("rival_challenges", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  opponentId: text("opponent_id").notNull(),
  trackId: text("track_id").notNull(),
  car: text("car").notNull(),
  lapCount: integer("lap_count").notNull().default(1),
  message: text("message").notNull().default(""),
  creatorSessionId: text("creator_session_id").notNull(),
  opponentSessionId: text("opponent_session_id"),
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  // Whether each side has seen the result once the challenge completed.
  // The opponent's is set when they submit their attempt (they're looking
  // right at the result), the creator's only when they acknowledge it —
  // that unseen flag is what keeps the "you won / you lost" notification
  // alive after the opponent finishes.
  creatorSeenResult: boolean("creator_seen_result").notNull().default(false),
  opponentSeenResult: boolean("opponent_seen_result").notNull().default(false),
});

export type DbRivalChallenge = typeof rivalChallengesTable.$inferSelect;
export type InsertDbRivalChallenge = typeof rivalChallengesTable.$inferInsert;

// A friendship is one row per pair, owned by whoever sent the request.
// `status` is "pending" until the addressee accepts, then "accepted".
// Declining or removing deletes the row outright, so a pair can always
// start over. The unique constraint is on (requester_id, addressee_id) —
// the reverse direction is prevented in the route, which checks for an
// existing row in either direction before inserting.
export const friendshipsTable = pgTable("friendships", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id").notNull(),
  addresseeId: text("addressee_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted
  createdAt: timestamp("created_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
}, (t) => [
  unique("friendships_uniq").on(t.requesterId, t.addresseeId),
  index("friendships_requester_idx").on(t.requesterId),
  index("friendships_addressee_idx").on(t.addresseeId),
]);

export type DbFriendship = typeof friendshipsTable.$inferSelect;
export type InsertDbFriendship = typeof friendshipsTable.$inferInsert;

// Tracks each user's lifetime AI Race Engineer message count so the free
// tier can be capped. Entering the shared unlock password sets
// `unlocked`, which removes the cap for that user going forward.
export const engineerUsageTable = pgTable("engineer_usage", {
  userId: text("user_id").primaryKey(),
  messageCount: integer("message_count").notNull().default(0),
  unlocked: boolean("unlocked").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DbEngineerUsage = typeof engineerUsageTable.$inferSelect;
export type InsertDbEngineerUsage = typeof engineerUsageTable.$inferInsert;
