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

// Mirrors the companion app's TRACK_NAMES table (artifacts/companion/src/main/
// session.ts) by F1 UDP track id, so its raw numeric fallback text — used
// whenever the companion app's own table doesn't (yet) recognize an id — can
// still be resolved to a canonical id. Ids with no current calendar entry
// (Paul Ricard, Hockenheim, Sochi, Hanoi, Portimão) are intentionally omitted.
const NUMERIC_TRACK_IDS: Record<number, string> = {
  0: "albert_park",
  2: "shanghai",
  3: "bahrain",
  4: "barcelona",
  5: "monaco",
  6: "montreal",
  7: "silverstone",
  9: "hungaroring",
  10: "spa",
  11: "monza",
  12: "marina_bay",
  13: "suzuka",
  14: "yas_marina",
  15: "cota",
  16: "interlagos",
  17: "red_bull_ring",
  19: "rodriguez",
  20: "baku",
  21: "bahrain",
  22: "silverstone",
  23: "cota",
  24: "suzuka",
  26: "zandvoort",
  27: "imola",
  29: "jeddah",
  30: "miami",
  31: "las_vegas",
  32: "losail",
  // F1 25 reverse-layout circuits
  39: "silverstone",
  40: "red_bull_ring",
  41: "zandvoort",
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

  // The companion app falls back to raw text like "Track 39" whenever a track
  // id isn't in its own name table (e.g. an id added by a game update before
  // the companion app was rebuilt). Resolve that fallback text by id directly
  // instead of relying on an exact-string alias, so it self-heals regardless
  // of exact spacing/casing and without needing a new alias per id.
  const fallbackMatch = key.match(/^track[\s_-]*(\d+)$/);
  if (fallbackMatch) {
    const numericId = Number(fallbackMatch[1]);
    if (NUMERIC_TRACK_IDS[numericId]) return NUMERIC_TRACK_IDS[numericId];
  }

  return key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
