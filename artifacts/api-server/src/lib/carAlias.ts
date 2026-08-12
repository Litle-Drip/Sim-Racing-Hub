// Canonical short team names — mirrors the companion app's TEAM_NAMES table
// (artifacts/companion/src/main/session.ts) with the season-suffix ("'24"/
// "'26") stripped, since that suffix is companion-specific versioning info,
// not part of the identity used for matching/display here.
const CANONICAL_TEAMS = [
  "Mercedes",
  "Ferrari",
  "Red Bull Racing",
  "Williams",
  "Aston Martin",
  "Alpine",
  "RB",
  "Haas",
  "McLaren",
  "Sauber",
  "Audi",
  "Cadillac",
  "F1 Generic",
  "My Team",
];

// Real-world full sponsor/constructor names users tend to type into the
// freeform car/team field (or that a UDP source lacking a name table falls
// back to) — resolved to the same short canonical form the companion app
// already emits, so the leaderboard's Car column never shows both
// "Mercedes" and "Mercedes-AMG PETRONAS Formula One Team" as if they were
// different entries.
const TEAM_ALIASES: Record<string, string> = {
  "mercedes-amg petronas formula one team": "Mercedes",
  "mercedes-amg petronas f1 team": "Mercedes",
  "mercedes amg petronas f1 team": "Mercedes",
  "scuderia ferrari": "Ferrari",
  "scuderia ferrari hp": "Ferrari",
  "oracle red bull racing": "Red Bull Racing",
  "red bull racing": "Red Bull Racing",
  "red bull": "Red Bull Racing",
  "williams racing": "Williams",
  "aston martin aramco": "Aston Martin",
  "aston martin aramco f1 team": "Aston Martin",
  "bwt alpine f1 team": "Alpine",
  "alpine f1 team": "Alpine",
  "visa cash app rb": "RB",
  "visa cash app rb f1 team": "RB",
  "racing bulls": "RB",
  "moneygram haas f1 team": "Haas",
  "haas f1 team": "Haas",
  "mclaren f1 team": "McLaren",
  "kick sauber": "Sauber",
  "stake f1 team kick sauber": "Sauber",
  "audi f1 team": "Audi",
  "cadillac f1 team": "Cadillac",
};

for (const team of CANONICAL_TEAMS) {
  TEAM_ALIASES[team.toLowerCase()] = team;
}

/**
 * Resolves a raw car/team string into a display name plus whether it's a
 * user-entered custom team rather than a recognized F1 constructor. Known
 * sponsor/constructor names (any casing, official or shorthand) collapse to
 * the same canonical short name so real teams never show up as
 * near-duplicate entries. Anything unrecognized is trimmed/whitespace-
 * collapsed and passed through as-is, flagged custom so the UI can label it
 * distinctly instead of it looking like a data-quality bug next to real
 * team names.
 */
export function normalizeCar(raw: string): { car: string; carIsCustom: boolean } {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (!collapsed) return { car: collapsed, carIsCustom: false };

  // Match ignoring a trailing season suffix like "'24"/"'26" so
  // "mercedes '26" still resolves via the base alias table.
  const seasonMatch = collapsed.match(/^(.*?)\s*('\d{2})$/);
  const base = seasonMatch ? seasonMatch[1] : collapsed;
  const suffix = seasonMatch ? ` ${seasonMatch[2]}` : "";
  const key = base.toLowerCase();

  const canonical = TEAM_ALIASES[key];
  if (canonical) {
    return { car: `${canonical}${suffix}`, carIsCustom: false };
  }

  return { car: collapsed, carIsCustom: true };
}
