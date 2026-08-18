# F1SimHub — Project Bible

> **Read this before making any changes.** This document exists so that any AI tool, developer, or collaborator understands the full project setup before touching anything.

---

## What This Project Is

F1SimHub is a sim racing tools website for F1 25 (Xbox, PlayStation, PC). Features include session logging, lap time tracking, setup builder, leaderboard, community, hardware vault, AI Race Engineer, and a companion desktop app that captures live UDP telemetry from F1 25 and auto-uploads sessions.

**Live site:** https://www.f1simhub.com  
**GitHub repo:** https://github.com/Litle-Drip/Sim-Racing-Hub

---

## Services & What They Do

| Service | Purpose | URL |
|---|---|---|
| **Vercel** | Hosts the React frontend | https://www.f1simhub.com |
| **Render** | Hosts the Express backend API | https://sim-racing-hub.onrender.com |
| **Neon** | Postgres database | Connected via `DATABASE_URL` env var on Render |
| **Clerk** | User authentication | Connected via Clerk env vars on both Vercel and Render |
| **GitHub Actions** | Auto-builds companion app (.exe and .dmg) on every push to main | |

---

## Repo Structure

```
artifacts/
  api-server/        ← Express backend — deploys to Render
  sim-racing-hq/     ← React frontend — deploys to Vercel
  companion/         ← Electron desktop app — built by GitHub Actions
  companion-mobile/  ← Not active
  mockup-sandbox/    ← Ignore
.github/
  workflows/
    companion-release.yml   ← Builds companion on push to main (USE THIS ONE)
    release-companion.yml   ← Old tag-triggered workflow, ignore
```

---

## Critical URLs — Do Not Get These Wrong

| What | Correct Value |
|---|---|
| Backend API base URL | `https://sim-racing-hub.onrender.com/api` |
| Frontend URL | `https://www.f1simhub.com` (with www) |
| Companion upload endpoint | `https://sim-racing-hub.onrender.com/api/companion/session` |
| Companion verify endpoint | `https://sim-racing-hub.onrender.com/api/companion/verify` |

**Important:** `https://f1simhub.com` (without www) redirects to `https://www.f1simhub.com` and **drops POST request bodies and auth headers in the process**. Always use `www` for API calls.

**Important:** `https://www.f1simhub.com/api/*` does NOT proxy to Render — Vercel's rewrite rule sends everything to `index.html`. All API calls must go directly to `sim-racing-hub.onrender.com`.

---

## Vercel Configuration

**Project name:** `sim-racing-hub-api-server` (confusingly named, it's the frontend)  
**Build command:** `pnpm --filter @workspace/sim-racing-hq run build`  
**Output directory:** `artifacts/sim-racing-hq/dist/public`  
**Install command:** `pnpm install --no-frozen-lockfile`  

**Environment variables on Vercel:**
- `VITE_API_URL` = `https://sim-racing-hub.onrender.com` (NO trailing slash, NO /api suffix — the frontend adds /api itself)
- `VITE_CLERK_PUBLISHABLE_KEY` = (Clerk publishable key)

**Do NOT change `vercel.json`** — it has a catch-all rewrite rule that sends all routes to `index.html` for the SPA router. Changing it will break the site.

---

## Render Configuration

**Service:** `sim-racing-hub`  
**Build command:** `pnpm install --no-frozen-lockfile && pnpm --filter @workspace/api-server run build`  
**Start command:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`  

**Environment variables on Render:**
- `DATABASE_URL` = Neon connection string
- `CLERK_SECRET_KEY` = Clerk secret key
- `CLERK_PUBLISHABLE_KEY` = Clerk publishable key
- `CORS_ORIGINS` = `https://www.f1simhub.com,https://f1simhub.com`

---

## Companion App Configuration

**Default API URL in `artifacts/companion/src/main/store.ts`:**
```typescript
apiBaseUrl: "https://sim-racing-hub.onrender.com/api"
```
This must always point to Render directly, never to Vercel.

**F1 25 UDP settings for users:**
- UDP Telemetry: On
- UDP Broadcast Mode: Off
- UDP IP Address: `127.0.0.1` when F1 25 runs on the same PC as the companion; the PC's LAN IP (shown with a copy button in the companion setup wizard) when playing on Xbox or PlayStation
- UDP Port: 20777
- Format: 2024 (2025 and 2026 are also accepted — see `SUPPORTED_FORMATS` in `companion/src/main/udp.ts`)
- Send Rate: 60Hz

These values are stated in four places: the companion wizard (`companion/src/renderer/src/pages/Wizard.tsx`), the signed-in Companion page, the public Download page, and the dashboard get-started checklist. The three web surfaces read them from `sim-racing-hq/src/data/udpSetup.ts` — change that file, not the pages. The wizard keeps its own copy (separate app, no shared module) with a comment pointing back at the parser.

**Mac note:** The companion app is unsigned (no Apple Developer certificate). Mac users must right-click → Open to bypass Gatekeeper. macOS may also block incoming UDP for unsigned apps — this is a known limitation until the $99/year Apple Developer cert is obtained.

---

## Known Issues & Workarounds

### pnpm lockfile mismatch
`pnpm-lock.yaml` has `electron-store@^10.0.1` but `package.json` has `^8.2.0`. This causes `--frozen-lockfile` to fail everywhere. **Workaround:** All build commands use `--no-frozen-lockfile`. Do not change this back to `--frozen-lockfile` until the lockfile is properly regenerated by running `pnpm install` locally and committing the result.

### Render free tier sleep
Render's free tier spins down after 15 minutes of inactivity. First request after sleep takes ~30 seconds. The companion app handles this with a retry loop.

### Session type showed "Unknown" for sessions before 2026-07-13 (fixed)
Real Race and Time Trial sessions were saving as "Unknown". Root cause: F1 25 inserted 5 sprint-weekend session types before Race in its UDP numbering, shifting Race from id 10->15 and Time Trial from 13->18, but the companion's `SESSION_TYPES` lookup table (`session.ts`) still had the old F1 24 ids and had no entries for 15/18 — so those sessions fell through to "Unknown". Fixed in commit `b42a3f1` by updating the table to the shifted F1 25 ids. This was not a byte-offset bug in `udp.ts` (that parser is correct). Sessions from before the fix are permanently stuck with the "Unknown"/"Other" label since the raw numeric session type wasn't stored, only the resolved string — there's no way to backfill them.

### The setup wizard told users to pick a UDP format the parser rejects (fixed)
The companion's first-run wizard instructed drivers to set **UDP Format: 2023**, but `udp.ts` only parses 2024, 2025 and 2026 and silently drops anything else. A driver who followed the wizard exactly saw step 3 spin on "Listening on port 20777…" forever with no error, and the app's dashboard reported it as "Unsupported game" — which reads as *your game isn't supported*, not *change one dropdown*. This was the single worst new-user blocker: the setup instructions could not produce a working setup. Fixed by pulling the value into a `UDP_FORMAT` constant in the wizard, surfacing the format mismatch as its own actionable state on step 3 (the status object already carried `unsupportedFormat` — nothing was reading it), and rewording the dashboard row to name the fix. If `SUPPORTED_FORMATS` ever changes, update the wizard constant and `sim-racing-hq/src/data/udpSetup.ts` together.

### Clerk username lookups return the wrong user if you trust position
`GET https://api.clerk.com/v1/users?username[]=…` is a *filter*, not a search, and any request Clerk can't apply the filter to degrades into "the first users in the instance" rather than an empty list. Taking `users[0]` therefore hands back an unrelated account — that's how a rival challenge addressed to `slumlordmillionaire` reached a different driver entirely. Every username lookup must confirm `user.username.toLowerCase() === wanted` before using the result, and fall back to `?query=` (Clerk's fuzzy search) for casing differences. Both places that do this — `routes/community.ts` (public driver profile) and `routes/rivalChallenges.ts` (`findUserByUsername`, also used by `routes/friends.ts`) — verify the match.

### `ON CONFLICT` needs the constraint to actually exist in Postgres
Track-note saves failed with a 500 on every attempt because the route used `INSERT … ON CONFLICT (user_id, track_id) DO UPDATE` while `track_notes_uniq` had never been created in the production database — Postgres rejects that statement outright ("no unique or exclusion constraint matching the ON CONFLICT specification") instead of falling back to a plain insert. The route now reads then writes, and `lib/db/sql/2026-08-15-add-friendships-and-track-notes-constraint.sql` adds the missing index. Constraints, unlike columns, are **not** covered by `scripts/check-schema-sql.mjs` — if you add an `onConflictDoUpdate`, confirm its target constraint exists in the database.

---

## Files — Do Not Touch Without Understanding

| File | Why it's sensitive |
|---|---|
| `vercel.json` | Rewrite rules control frontend routing — wrong change breaks the site |
| `pnpm-lock.yaml` | Do not edit manually — only regenerate via `pnpm install` |
| `artifacts/companion/src/main/store.ts` | Contains default API URL — must point to Render |
| `artifacts/companion/src/main/udp.ts` | Custom F1 25 binary packet parser — byte offsets are precise |
| `artifacts/api-server/src/routes/companion.ts` | API key auth and session upload logic |

---

## Deployment Flow

```
Push to main branch
    ↓
Vercel auto-deploys frontend (artifacts/sim-racing-hq)
    ↓
Render auto-deploys backend (artifacts/api-server)
    ↓
GitHub Actions builds companion .exe and .dmg
    ↓
New release uploaded to github.com/Litle-Drip/Sim-Racing-Hub/releases/tag/main
```

No manual steps needed — everything is automatic on push to main.

---

## What Each AI Session Should Do Before Making Changes

1. Read this file
2. Identify which artifact folder the change affects (`api-server`, `sim-racing-hq`, or `companion`)
3. Do NOT change environment variables, API URLs, or build commands without checking this doc first
4. Do NOT run `pnpm install --frozen-lockfile` — always use `--no-frozen-lockfile`
5. If changing `companion/package.json` dependencies, note that the lockfile will be out of sync and build commands already account for this

---

## Quick Reference — Who Does What

| Task | Tool |
|---|---|
| Edit frontend UI | Edit files in `artifacts/sim-racing-hq/src/` |
| Edit backend API routes | Edit files in `artifacts/api-server/src/routes/` |
| Edit companion app | Edit files in `artifacts/companion/src/` |
| Add environment variable | Vercel dashboard (frontend vars) or Render dashboard (backend vars) |
| See deploy logs | Vercel dashboard or Render dashboard |
| See companion build | GitHub Actions tab |
| Download latest companion | github.com/Litle-Drip/Sim-Racing-Hub/releases/tag/main |
