// One-off backfill: normalizes sessions.track_id values that were stored using
// the companion app's raw telemetry track names (e.g. "Hungaroring", "Catalunya")
// instead of the app's canonical track ids (e.g. "hungaroring", "barcelona"),
// which is why those sessions weren't showing up on their track page.
//
// Run with a DATABASE_URL pointed at the target database:
//   pnpm --filter @workspace/api-server run backfill:tracks
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeTrackId } from "../src/lib/trackAlias";

async function main() {
  const rows = await db
    .select({ id: sessionsTable.id, trackId: sessionsTable.trackId })
    .from(sessionsTable);

  let updated = 0;
  for (const row of rows) {
    const normalized = normalizeTrackId(row.trackId);
    if (normalized !== row.trackId) {
      await db
        .update(sessionsTable)
        .set({ trackId: normalized })
        .where(eq(sessionsTable.id, row.id));
      console.log(`session ${row.id}: "${row.trackId}" -> "${normalized}"`);
      updated++;
    }
  }

  console.log(`Done. Checked ${rows.length} sessions, updated ${updated}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
