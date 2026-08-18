// Usernames and avatars for a set of Clerk ids, in as few requests as
// possible. Anyone Clerk doesn't return (deleted account, lookup failure)
// is simply absent, and callers fall back to "Unknown driver" rather than
// dropping the row — a member shouldn't vanish from a roster because Clerk
// had a bad minute.
export type ClerkProfile = { username: string; avatarUrl: string | null };

// Clerk caps `limit` at 100, so anything larger (a big league roster) has
// to be asked for in batches.
const BATCH = 100;

export async function getProfiles(userIds: string[]): Promise<Record<string, ClerkProfile>> {
  if (userIds.length === 0) return {};
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return {};

  const map: Record<string, ClerkProfile> = {};
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    try {
      const params = new URLSearchParams();
      chunk.forEach((id) => params.append("user_id[]", id));
      params.set("limit", String(BATCH));
      const resp = await fetch(`https://api.clerk.com/v1/users?${params}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as Array<{
        id: string;
        username?: string | null;
        image_url?: string | null;
      }>;
      for (const u of data) {
        // Username only — drivers are addressed by the name they chose to
        // be known by here, never by the real name on the account.
        map[u.id] = { username: u.username ?? "Unknown driver", avatarUrl: u.image_url ?? null };
      }
    } catch {
      // Leave this chunk out; callers already handle missing profiles.
    }
  }
  return map;
}
