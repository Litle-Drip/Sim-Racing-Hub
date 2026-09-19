// "Last on" for a driver, phrased the way someone would say it out loud.
// Input is the ISO timestamp of their most recent logged session — the same
// value the friends list and the public profile both show, so the two never
// disagree about when a driver was last around.
export function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return 'No sessions yet';

  const then = new Date(iso).getTime();
  if (!isFinite(then)) return 'No sessions yet';

  const minutes = Math.floor((Date.now() - then) / 60_000);
  // Clocks drift and a companion upload can carry a timestamp a little ahead
  // of the viewer's clock; anything in the future reads as right now.
  if (minutes < 1) return 'Active now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
