import { sql } from "drizzle-orm";
import { sessionsTable, type DbSession } from "@workspace/db";

// Per-lap telemetry traces (up to 3000 points each) are the single biggest
// contributor to a session row's size. Any query that only needs lap
// summaries (times, sectors) — not the trace itself — should select this
// instead of the raw `laps` column, so Postgres never reads/transfers the
// trace data for that query.
export const lapsWithoutTrace = sql<DbSession["laps"]>`(
  select jsonb_agg(lap_elem - 'trace')
  from jsonb_array_elements(${sessionsTable.laps}) as lap_elem
)`.as("laps");
