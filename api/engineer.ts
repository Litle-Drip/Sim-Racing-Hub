import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface LapRecord {
  lap: number;
  time: string;
  s1: string;
  s2: string;
  s3: string;
  tires: string;
  penalty: string;
}

interface Session {
  date: string;
  trackId: string;
  car: string;
  bestLap?: string | null;
  avgLap?: string | null;
  worstLap?: string | null;
  s1?: string | null;
  s2?: string | null;
  s3?: string | null;
  type: string;
  tires?: string | null;
  notes?: string | null;
  isPB?: boolean;
  laps?: LapRecord[] | null;
}

interface UserData {
  name?: string;
  platform?: string;
  hardware?: string;
  goals?: string;
  sessions: Session[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lapToSec(str: string | null | undefined): number | null {
  if (!str?.trim()) return null;
  const parts = str.split(":");
  if (parts.length === 2) {
    const s = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    return isNaN(s) ? null : s;
  }
  const s = parseFloat(str);
  return isNaN(s) ? null : s;
}

// ── System Prompt Builder ─────────────────────────────────────────────────────
// This is what makes the engineer feel like YOUR engineer.
// It summarises the user's real data into a context block for Claude.

function buildSystemPrompt(userData: UserData): string {
  const { name, hardware, platform, sessions = [], goals } = userData;
  const firstName = name?.split(" ")[0] ?? "Driver";

  // Personal bests per track + car
  const pbMap: Record<string, Session> = {};
  for (const s of sessions) {
    if (!s.bestLap) continue;
    const key = `${s.trackId}||${s.car}`;
    const t = lapToSec(s.bestLap);
    const existing = pbMap[key];
    if (t && (!existing || t < (lapToSec(existing.bestLap) ?? Infinity))) {
      pbMap[key] = s;
    }
  }

  // Sessions per track
  const trackCounts: Record<string, number> = {};
  for (const s of sessions) {
    trackCounts[s.trackId] = (trackCounts[s.trackId] ?? 0) + 1;
  }

  // Consistency — avg gap to best lap per track
  const trackVariance: Record<string, number[]> = {};
  for (const s of sessions) {
    if (!s.bestLap || !s.avgLap) continue;
    const best = lapToSec(s.bestLap);
    const avg = lapToSec(s.avgLap);
    if (!best || !avg) continue;
    const diff = avg - best;
    if (diff > 0 && diff < 15) {
      (trackVariance[s.trackId] ??= []).push(diff);
    }
  }

  // Best sector times per track
  const sectorBests: Record<string, { s1: number | null; s2: number | null; s3: number | null }> = {};
  for (const s of sessions) {
    const sb = (sectorBests[s.trackId] ??= { s1: null, s2: null, s3: null });
    const update = (key: "s1" | "s2" | "s3", val?: string | null) => {
      const t = lapToSec(val);
      if (t && (!sb[key] || t < sb[key]!)) sb[key] = t;
    };
    update("s1", s.s1);
    update("s2", s.s2);
    update("s3", s.s3);
  }

  // Format sections
  const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  const recentLines = recent.length > 0
    ? recent.map((s) =>
        `  ${s.date} | ${s.trackId} | ${s.car} | Best: ${s.bestLap} | Avg: ${s.avgLap ?? "—"} | ${s.type}${s.tires ? ` | ${s.tires}` : ""}${s.notes ? ` | "${s.notes}"` : ""}`
      ).join("\n")
    : "  No sessions logged yet.";

  const pbLines = Object.values(pbMap).length > 0
    ? Object.values(pbMap).map((s) => `  ${s.trackId} | ${s.car} | ${s.bestLap} | set ${s.date}`).join("\n")
    : "  No personal bests yet.";

  const trackLines = Object.entries(trackCounts).length > 0
    ? Object.entries(trackCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([t, c]) => `  ${t}: ${c} session${c > 1 ? "s" : ""}`)
        .join("\n")
    : "  None yet.";

  const varianceLines = Object.entries(trackVariance).length > 0
    ? Object.entries(trackVariance)
        .map(([track, diffs]) => {
          const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
          const flag = avg > 2 ? " ⚠ HIGH VARIANCE" : avg > 1 ? " — needs work" : " ✓ consistent";
          return `  ${track}: +${avg.toFixed(3)}s avg gap to best${flag}`;
        })
        .join("\n")
    : "  Log avg lap times to unlock consistency analysis.";

  const sectorLines = Object.entries(sectorBests)
    .filter(([, sb]) => sb.s1 || sb.s2 || sb.s3)
    .map(([track, sb]) => {
      const parts: string[] = [];
      if (sb.s1) parts.push(`S1: ${sb.s1.toFixed(3)}`);
      if (sb.s2) parts.push(`S2: ${sb.s2.toFixed(3)}`);
      if (sb.s3) parts.push(`S3: ${sb.s3.toFixed(3)}`);
      return `  ${track}: ${parts.join(" | ")}`;
    }).join("\n") || "  No sector data logged yet.";

  // Lap-by-lap breakdown — most recent session with individual laps logged
  // (companion app uploads these; manually-logged sessions won't have them).
  const sessionsWithLaps = sessions
    .filter((s) => s.laps && s.laps.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lapSession = sessionsWithLaps[0];

  const lapBreakdownLines = lapSession
    ? (() => {
        const laps = lapSession.laps!;
        const times = laps
          .map((l) => lapToSec(l.time))
          .filter((t): t is number => t !== null);
        const spread = times.length > 0 ? Math.max(...times) - Math.min(...times) : 0;
        const degradation =
          times.length >= 2
            ? `Lap ${laps[0].lap} -> Lap ${laps[laps.length - 1].lap} delta: ${
                times[times.length - 1] - times[0] >= 0 ? "+" : ""
              }${(times[times.length - 1] - times[0]).toFixed(3)}s`
            : null;
        const lapLines = laps
          .map((l) => {
            const flag = l.penalty ? ` ⚠ ${l.penalty}` : "";
            return `    L${l.lap}: ${l.time} | S1 ${l.s1 || "—"} S2 ${l.s2 || "—"} S3 ${l.s3 || "—"} | ${l.tires || "—"}${flag}`;
          })
          .join("\n");
        return `  ${lapSession.date} | ${lapSession.trackId} | ${lapSession.car} | ${laps.length} laps | spread ${spread.toFixed(3)}s${degradation ? ` | ${degradation}` : ""}\n${lapLines}`;
      })()
    : "  No individual lap-by-lap data logged yet — only session summaries (best/avg/worst). Log via the companion app to unlock lap-by-lap and tyre degradation analysis.";

  return `You are ${firstName}'s personal F1 race engineer on F1 Sim Hub. You have full access to their session history. Your job is to give precise, data-driven coaching exactly like a real F1 engineer in a post-session debrief.

RULES — FOLLOW STRICTLY:
- Short, direct sentences. No padding, no waffle.
- Use real F1 terminology: lap delta, sector variance, brake bias, ERS deployment, DRS, trail braking, apex, reference point, snap oversteer, understeer, overcut, undercut.
- Always address the driver as: ${firstName}
- Every coaching point MUST reference their actual data — specific times, specific tracks, specific sessions. Never give generic advice.
- If data is limited, say so directly and tell them exactly what to log next to get better analysis.
- If a LAP-BY-LAP BREAKDOWN is present below, that IS the driver's individual lap/sector/tyre data — analyze it directly. Never ask the driver to paste lap-by-lap data you already have.
- Tone: clinical and precise, like Lambiase briefing Verstappen. Brief genuine encouragement only when clearly earned.
- NEVER say "Great question", "Certainly!", "Of course!" or any AI filler. Just answer.
- Use line breaks between distinct points for readability.
${goals ? `\nDRIVER GOALS: ${goals}` : ""}

DRIVER PROFILE:
Name: ${name ?? "Unknown"} | Platform: ${platform ?? "Not specified"} | Hardware: ${hardware ?? "Not specified"} | Total sessions: ${sessions.length}

RECENT SESSIONS (last 6):
${recentLines}

PERSONAL BESTS BY TRACK:
${pbLines}

BEST SECTOR TIMES:
${sectorLines}

LAP-BY-LAP BREAKDOWN (most recent session with individual laps logged):
${lapBreakdownLines}

SESSION COUNT BY TRACK:
${trackLines}

CONSISTENCY ANALYSIS (avg vs best lap gap):
${varianceLines}

When starting the conversation, immediately identify the single most impactful area to work on based on the data. Name the specific track, the specific time gap, what is causing it. Do not wait to be asked — lead with the analysis. If the driver has fewer than 3 sessions, tell them what data to log first.`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { messages, userData } = (await req.json()) as {
      messages: Array<{ role: string; content: string }>;
      userData: UserData;
    };

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",   // swap to claude-sonnet-4-6 for Pro users
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(userData ?? { sessions: [] }),
          cache_control: { type: "ephemeral" }, // 90% cost saving on repeated system prompt
        },
      ],
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });

  } catch (err) {
    console.error("Race Engineer API error:", err);
    return new Response(
      JSON.stringify({ error: "Engineer comms down. Check ANTHROPIC_API_KEY env var is set in Vercel." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
}
