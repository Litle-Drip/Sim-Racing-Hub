import { eq, and } from "drizzle-orm";
import { db, carAliasesTable } from "@workspace/db";

// Car identity, server side.
//
// The companion resolves the game's raw m_teamId to a name through a table
// containing only ids somebody has actually observed live. Guessing the rest
// is what once labelled a Mercedes "Ferrari '26", so an id outside that table
// arrives here honestly named "Unknown car (#129)" — accurate, and useless to
// read on a lap chart.
//
// A driver who recognises their own car can name it once (PUT /car-aliases/
// {teamId}); from then on every upload carrying that team id is stored under
// their name instead. The raw id is stored either way, so the label stays
// correctable and a future companion release that learns id 129 for real
// doesn't have to fight the data.

// Matches the companion's teamLabel() fallback (companion/src/main/session.ts)
// and the older "Team 129" form it replaced — sessions uploaded before that
// change are still in the database under the old wording and should be
// offered for naming alongside the new ones.
const UNIDENTIFIED_CAR = /^(?:Unknown car \(#(\d+)\)|Team (\d+))$/;

export function parseUnidentifiedCarLabel(car: string): number | null {
  const m = UNIDENTIFIED_CAR.exec(car.trim());
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

// "F1 Generic" is what the game reports for an unbranded car. It isn't a
// mislabel — it's the game declining to say — but it identifies no car to a
// driver reading their history, so it is offered for naming too.
export function isUnidentifiedCarLabel(car: string): boolean {
  return car.trim() === "F1 Generic" || parseUnidentifiedCarLabel(car) !== null;
}

export async function lookupCarAlias(userId: string, teamId: number | null | undefined): Promise<string | null> {
  if (teamId === null || teamId === undefined) return null;
  const [row] = await db
    .select({ label: carAliasesTable.label })
    .from(carAliasesTable)
    .where(and(eq(carAliasesTable.userId, userId), eq(carAliasesTable.teamId, teamId)));
  return row?.label ?? null;
}

export interface CarGroup {
  car: string;
  teamId: number | null;
  sessions: number;
  lastSeen: string | null;
}

export interface UnidentifiedCar {
  teamId: number;
  car: string;
  sessions: number;
  lastSeen: string;
}

// Reduces a driver's car/team-id groupings down to the cars worth offering to
// name: unidentified ones, one entry per team id.
export function unidentifiedCars(groups: CarGroup[]): UnidentifiedCar[] {
  const candidates = groups
    .filter(g => isUnidentifiedCarLabel(g.car))
    // A session logged before the raw team id was captured has only the label
    // to go on, so recover the id from the label where it's in there
    // ("Unknown car (#129)", or the older "Team 129"). "F1 Generic" with no
    // stored team id can't be named — there is nothing to key the name to —
    // so it's left out rather than offered and silently failing.
    .map(g => ({ ...g, teamId: g.teamId ?? parseUnidentifiedCarLabel(g.car) }))
    .filter((g): g is CarGroup & { teamId: number } => g.teamId !== null);

  // One entry per team id, not per label. The same car reaches this list under
  // two labels whenever a driver has sessions from either side of the rename —
  // "Team 129" from the old companion, "Unknown car (#129)" from the current
  // one — and they are one car to name, not two.
  const byTeamId = new Map<number, UnidentifiedCar>();
  for (const g of candidates) {
    const lastSeen = g.lastSeen ?? "";
    const existing = byTeamId.get(g.teamId);
    if (!existing) {
      byTeamId.set(g.teamId, { teamId: g.teamId, car: g.car, sessions: g.sessions, lastSeen });
      continue;
    }
    existing.sessions += g.sessions;
    // Show the label from the most recently driven session, so the name the
    // driver sees in their session list is the one offered here.
    if (lastSeen > existing.lastSeen) {
      existing.car = g.car;
      existing.lastSeen = lastSeen;
    }
  }

  return [...byTeamId.values()].sort((a, b) => b.sessions - a.sessions || a.teamId - b.teamId);
}
