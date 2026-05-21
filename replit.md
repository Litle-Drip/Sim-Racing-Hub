# Sim Racing HQ

A personal F1 sim racing companion app — log sessions, track lap improvement, manage car setups, and study corner breakdowns across all 24 F1 circuits.

## Run & Operate

- `pnpm --filter @workspace/sim-racing-hq run dev` — run the Sim Racing HQ frontend (served at `/`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, pure CSS (no Tailwind, no component libraries)
- Charts: Recharts
- Icons: Lucide React
- Fonts: Orbitron (display/headers), Rajdhani (body), Space Mono (times/data)
- Data persistence: localStorage only (`sim_sessions`, `sim_track_notes`, `sim_setups`)
- No backend, no auth, no database — all data is client-side

## Where things live

- `artifacts/sim-racing-hq/src/App.tsx` — state-based routing (single `page` state variable)
- `artifacts/sim-racing-hq/src/index.css` — full F1 design system (CSS variables, all global styles)
- `artifacts/sim-racing-hq/src/data/f1Tracks.ts` — 24 F1 circuits + constants
- `artifacts/sim-racing-hq/src/lib/storage.ts` — localStorage helpers, PB detection, lap time conversion
- `artifacts/sim-racing-hq/src/components/Nav.tsx` — fixed left sidebar navigation
- `artifacts/sim-racing-hq/src/pages/` — Dashboard, Sessions, Tracks, Setups, Progress

## Architecture decisions

- No React Router — single `page` state in App.tsx controls which page renders (matches spec requirement)
- Pure CSS with CSS variables — no Tailwind, no shadcn (by design spec)
- localStorage is the sole persistence layer; three keys: `sim_sessions`, `sim_track_notes`, `sim_setups`
- PB detection runs on every session save by re-evaluating all sessions chronologically
- Lap times stored as strings (e.g. `1:21.456`) and converted to seconds only for comparisons/charts

## Product

- **Dashboard** — stat cards (total sessions, tracks, PBs, setups), GitHub-style 365-day activity heatmap, recent sessions table
- **Sessions** — filterable log with inline row expand for details; modal form to log new sessions; PB auto-detection
- **Tracks (Track Bible)** — grid of all 24 F1 circuits; detail view with PB stats, inline-editable corner breakdown table (autosave), sessions list
- **Setups (Setup Vault)** — card grid of car setups; add/delete/view; select 2 to compare side-by-side with diffs highlighted in red
- **Progress** — PB progression line chart, lap variance bar chart (best/avg/worst), all-time PB records table

## User preferences

- F1 team telemetry aesthetic: near-black background, Orbitron/Rajdhani/Space Mono fonts, red/teal/yellow accents, NO rounded corners
- No component libraries — pure CSS only

## Gotchas

- The stat cards show Orbitron's slashed zero "0" glyph — this is correct and intentional for the telemetry aesthetic
- After adding sessions, refresh the Dashboard page state to reflect updated counts
- Corner edits autosave on blur — no explicit save button needed

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
