# F1SimHub Companion

Lightweight Electron desktop app that listens to EA Sports F1 25 UDP telemetry on port 20777, detects completed valid laps, accumulates them into a session, and uploads the full session to [F1SimHub](https://f1simhub.com) automatically.

## Getting Started (local development)

```bash
# Install dependencies (requires Node 20+, pnpm)
pnpm install

# Start in development mode (hot-reload renderer)
pnpm dev

# Build for production
pnpm build

# Package into installer (Windows NSIS / macOS DMG)
pnpm package
```

## Architecture

```
src/
├── main/          # Electron main process (Node.js)
│   ├── index.ts   # App entry, BrowserWindow, Tray, IPC handlers
│   ├── store.ts   # electron-store typed settings
│   ├── udp.ts     # UDP listener wrapping f1-telemetry-client
│   ├── session.ts # F1 session state machine (lap detection, boundary detection)
│   └── uploader.ts # Upload to API + pending-uploads.json retry queue
├── preload/
│   └── index.ts   # contextBridge typed CompanionAPI
└── renderer/      # React UI (Vite)
    └── src/
        ├── App.tsx             # Router: Wizard → Dashboard / Settings
        ├── pages/Dashboard.tsx # Status rows + Open F1SimHub button
        ├── pages/Wizard.tsx    # First-launch 3-step setup
        └── pages/Settings.tsx  # API key, UDP port, toggles
```

## UDP telemetry dependency

The app uses [`f1-telemetry-client`](https://www.npmjs.com/package/f1-telemetry-client) (v0.1.26) to decode F1 UDP packets.

The task spec originally called for `@racehub-io/f1-23-telemetry-client` (also v0.1.26), which is the **same package** published under a different scope — both share identical code and the same version number. `f1-telemetry-client` was used here because the scoped package is unavailable in the Replit package registry environment; they are functionally identical and support F1 23/24/25 packet formats.

## Session detection

Sessions are flushed and uploaded when:
1. A new `m_sessionUID` is received (new race/session started)
2. `m_sessionType` transitions to 0 (player returns to menus/lobby)
3. `m_sessionType` changes under the same UID (e.g. Q1→Q2 boundary)
4. UDP goes silent for 5s+ (game closed / network lost) — watchdog force-flush

Invalid laps (`m_currentLapInvalid = 1`) are silently discarded.

## Production packaging

For release builds, add platform icons to `resources/`:
- `icon.ico` — Windows (256×256 recommended)
- `icon.icns` — macOS
- `icon.png` — Linux / fallback

The embedded programmatic icon in `createTrayIcon()` is a dev convenience only.
Code-signing (Apple notarization + Windows EV cert) is a separate step before public distribution.

## F1 25 in-game settings

| Setting | Value |
|---------|-------|
| UDP Telemetry | On |
| UDP Broadcast Mode | Off |
| UDP IP Address | Your PC's local IP |
| UDP Port | 20777 |
| UDP Send Rate | 60Hz |
| UDP Format | 2023 |
