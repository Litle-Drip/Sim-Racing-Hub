// Feature flags for surfaces that are hidden rather than removed.
//
// Nothing behind these flags is deleted — the components, the calculations in
// lib/engagement.ts, and the stored data all stay exactly as they were. Flip a
// flag back to `true` and the surface returns unchanged.
//
// Typed as `boolean` rather than inferred as the literal `false` so callers
// read as ordinary conditionals instead of statically-dead branches.

/** Achievement badges: the Dashboard rail, the Account grid, the public
 *  Driver Profile row, and the "n/m badges" counter on the rank card. */
export const SHOW_ACHIEVEMENTS: boolean = false;

/** The XP progress bar and every XP figure that reads off it — point totals,
 *  "n XP to <tier>", the XP line in the Dashboard coaching insight, and the
 *  daily challenge's XP reward. Driver rank and the streak are not XP surfaces
 *  and stay visible. */
export const SHOW_XP: boolean = false;

/** The Dashboard "Next Target" card — the suggested PB to beat, its XP reward,
 *  and the badge it would unlock. */
export const SHOW_NEXT_TARGET: boolean = false;
