// Canonical track ids match F1_TRACKS in artifacts/sim-racing-hq/src/data/f1Tracks.ts
// and artifacts/sim-racing-mobile/data/tracks.ts. Telemetry producers (e.g. the F1
// companion app's TRACK_NAMES table) send human-readable display names instead of
// those ids, so incoming track strings need to be resolved before being stored as
// a session's trackId — otherwise sessions silently stop matching their track page
// (e.g. "Hungaroring" vs "hungaroring", "Catalunya" vs "barcelona").
const TRACK_ALIASES: Record<string, string> = {
  melbourne: "albert_park",
  australia: "albert_park",
  catalunya: "barcelona",
  "circuit de barcelona-catalunya": "barcelona",
  "circuit de barcelona catalunya": "barcelona",
  spain: "barcelona",
  hungary: "hungaroring",
  singapore: "marina_bay",
  "marina bay": "marina_bay",
  "abu dhabi": "yas_marina",
  "yas marina": "yas_marina",
  "mexico city": "rodriguez",
  mexico: "rodriguez",
  "las vegas": "las_vegas",
  lusail: "losail",
  qatar: "losail",
  "saudi arabia": "jeddah",
  saudi: "jeddah",
  japan: "suzuka",
  china: "shanghai",
  usa: "cota",
  brazil: "interlagos",
  canada: "montreal",
  austria: "red_bull_ring",
  uk: "silverstone",
  britain: "silverstone",
  belgium: "spa",
  netherlands: "zandvoort",
  italy: "monza",
  azerbaijan: "baku",
  "bahrain short": "bahrain",
  "silverstone short": "silverstone",
  "cota short": "cota",
  "suzuka short": "suzuka",
  // F1 25 added reverse-layout variants of these circuits — same track,
  // group them under the existing canonical id rather than an orphaned one.
  "silverstone reverse": "silverstone",
  "austria reverse": "red_bull_ring",
  "zandvoort reverse": "zandvoort",
};

/**
 * Resolves a raw track name/id from a telemetry source into the app's canonical
 * track id. Falls back to a lowercased, slugified version of the input when no
 * alias is known, so at minimum casing/spacing mismatches self-correct.
 */
export function normalizeTrackId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase();
  if (TRACK_ALIASES[key]) return TRACK_ALIASES[key];
  return key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
