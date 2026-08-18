// Where the companion app is downloaded from, and which build to point at.
//
// **Do not use `/releases/latest` here.** That GitHub endpoint specifically
// excludes prereleases, and the companion is *always* published as one (see
// `.github/workflows/companion-release.yml`, which publishes the rolling
// "main" tag with `prerelease: true`). There is no non-prerelease release in
// this repo at all, so `/releases/latest` returns a 404 — as it did on the
// public Download page's two download buttons, meaning a driver who clicked
// "Download for Windows" as their first action landed on a GitHub error page.
//
// The plain releases list sorts newest-first regardless of prerelease status
// and always finds the current build. `companion/src/main/index.ts` carries
// the same warning for the same reason.

export const RELEASES_URL = 'https://github.com/Litle-Drip/Sim-Racing-Hub/releases';

export type DesktopOS = 'windows' | 'mac' | 'other';

/** Best-effort platform guess, used only to emphasise one download button over the other. */
export function detectOS(): DesktopOS {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

export function osLabel(os: DesktopOS): string {
  return os === 'mac' ? 'macOS' : os === 'windows' ? 'Windows' : 'your platform';
}
