---
name: testing-sim-racing-hq-frontend
description: Test Sim Racing HQ frontend layout and responsive behavior. Use when verifying CSS, layout, or mobile UX changes.
---

# Testing Sim Racing HQ Frontend

## Overview
Sim Racing HQ is a React + Vite app with Clerk authentication. The app uses a fixed 240px left sidebar on desktop that converts to a hamburger menu on mobile (≤767px).

## Devin Secrets Needed
- `VITE_CLERK_PUBLISHABLE_KEY` — Required to render the full React app. Without it, the app shows a "CONFIGURATION ERROR" screen.

## Testing Without Clerk Credentials
If no Clerk key is available, you can still test CSS/layout changes by creating a standalone HTML test page:

1. Start the Vite dev server with a dummy env var:
   ```bash
   cd artifacts/sim-racing-hq
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_dummy npx vite --port 5173 --host 0.0.0.0
   ```
   Note: The dummy key won't render the React app, but Vite will serve static HTML files and process CSS imports.

2. Create a standalone HTML file (e.g., `test-layout.html`) in `artifacts/sim-racing-hq/` that:
   - Loads `<link rel="stylesheet" href="/src/index.css" />` (Vite processes this)
   - Replicates the exact DOM structure: `div.app-layout > nav.nav-sidebar + main.main-content`
   - Includes nav items, hamburger button (`.nav-hamburger`), close button (`.nav-close`), overlay (`.nav-overlay`)
   - Has simple JS to toggle `nav-sidebar--open` class and overlay visibility

3. Open `http://localhost:5173/test-layout.html` in Chrome

4. Use Chrome DevTools responsive mode (F12 → device toolbar toggle) to test mobile viewports

5. **Delete the test HTML file after testing** — don't commit it

## Key Layout Assertions

### Mobile (≤767px viewport)
- `.main-content` computed `margin-left` should be `0px`
- `.main-content` computed `padding-top` should be `52px`
- `.app-layout` computed `overflow-x` should be `hidden`
- `.nav-hamburger` should be visible with min-width/min-height of `44px`
- `.nav-sidebar` should be off-screen (`transform: translateX(-100%)`) until opened

### Desktop (≥768px viewport)
- `.main-content` computed `margin-left` should be `240px`
- `.nav-sidebar` should be visible (no transform)
- `.nav-hamburger` should be hidden (`display: none`)

## Verifying CSS Computed Styles via Console
```javascript
const mc = document.querySelector('.main-content');
const cs = getComputedStyle(mc);
console.log('margin-left:', cs.marginLeft, 'padding-top:', cs.paddingTop);
```

## CSS Architecture Notes
- The CSS uses a mobile-first responsive approach with `@media (max-width: 767px)` breakpoints
- **CSS cascade ordering matters**: Mobile overrides must appear AFTER the desktop rules in the stylesheet, because when specificity is equal, the last rule wins
- The main stylesheet is `artifacts/sim-racing-hq/src/index.css` (~1600 lines)
- Key layout classes: `.app-layout`, `.nav-sidebar`, `.main-content`, `.nav-hamburger`, `.nav-overlay`

## Vercel Preview
- The repo might have Vercel preview deployments on PRs, but they may lack the `VITE_CLERK_PUBLISHABLE_KEY` env var
- Check PR comments from the Vercel bot for preview URLs
- If the preview shows "CONFIGURATION ERROR", use the standalone HTML approach above

## Tech Stack
- React 19.1.0, Vite 7.3.x, TypeScript 5.9
- Clerk for authentication
- Pure CSS (no Tailwind or component libraries)
- pnpm monorepo
- Fonts: Orbitron (display), Rajdhani (body), Space Mono (mono)
