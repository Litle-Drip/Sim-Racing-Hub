export const config = { runtime: "edge" };

function lapToSec(str) {
  if (!str?.trim()) return null;
  const p = str.split(":");
  if (p.length === 2) {
    const secs = parseFloat(p[0]) * 60 + parseFloat(p[1]);
    return isNaN(secs) ? null : secs;
  }
  const secs = parseFloat(str);
  return isNaN(secs) ? null : secs;
}

function buildSystemPrompt(userData) {
  const { name, hardware, platform, sessions = [], goals } = userData;

  const pbMap = {};
  sessions.forEach((s) => {
    if (!s.bestLap) return;
    const key = `${s.trackId}||${s.car}`;
    const t = lapToSec(s.bestLap);
    if (t && (!pbMap[key] || t < lapToSec(pbMap[key].bestLap))) {
      pbMap[key] = s;
    }
  });

  const trackCounts = {};
  sessions.forEach((s) => {
    trackCounts[s.trackId] = (trackCounts[s.trackId] || 0) + 1;
  });

  const trackVariance = {};
  sessions.forEach((s) => {
    if (!s.bestLap || !s.avgLap) return;
    const best = lapToSec(s.bestLap);
    const avg = lapToSec(s.avgLap);
    if (!best || !avg) return;
    const diff = avg - best;
    if (diff > 0 && diff < 15) {
      if (!trackVariance[s.trackId]) trackVariance[s.trackId] = [];
      trackVariance[s.trackId].push(diff);
    }
  });

  const sectorBests = {};
  sessions.forEach((s) => {
    if (!sectorBests[s.trackId]) sectorBests[s.trackId] = { s1: null, s2: null, s3: null };
    const sb = sectorBests[s.trackId];
    if (s.s1) { const t = lapToSec(s.s1); if (t && (!sb.s1 || t < sb.s1)) sb.s1 = t; }
    if (s.s2) { const t = lapToSec(s.s2); if (t && (!sb.s2 || t < sb.s2)) sb.s2 = t; }
    if (s.s3) { const t = lapToSec(s.s3); if (t && (!sb.s3 || t < sb.s3)) sb.s3 = t; }
  });

  const recent = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const firstName = name?.split(" ")[0] ?? "Driver";

  const recentLines =
    recent.length > 0
      ? recent
          .map(
            (s) =>
              `  ${s.date} | ${s.trackId} | ${s.car} | Best: ${s.bestLap} | Avg: ${s.avgLap ?? "\u2014"} | ${s.type}${s.tires ? ` | ${s.tires}` : ""}${s.notes ? ` | Note: "${s.notes}"` : ""}`,
          )
          .join("\n")
      : "  No sessions logged yet";

  const pbLines =
    Object.entries(pbMap).length > 0
      ? Object.values(pbMap)
          .map((s) => `  ${s.trackId} | ${s.car} | ${s.bestLap} | set ${s.date}`)
          .join("\n")
      : "  No personal bests recorded yet";

  const trackLines =
    Object.entries(trackCounts).length > 0
      ? Object.entries(trackCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([t, c]) => `  ${t}: ${c} session${c > 1 ? "s" : ""}`)
          .join("\n")
      : "  No data";

  const varianceLines =
    Object.entries(trackVariance).length > 0
      ? Object.entries(trackVariance)
          .map(([track, diffs]) => {
            const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            const flag =
              avg > 2
                ? " \u26A0 HIGH VARIANCE"
                : avg > 1
                  ? " \u2014 needs work"
                  : " \u2713 consistent";
            return `  ${track}: avg +${avg.toFixed(3)}s off best${flag}`;
          })
          .join("\n")
      : "  Log avg lap times alongside best laps to see consistency analysis";

  const sectorLines =
    Object.entries(sectorBests)
      .filter(([, sb]) => sb.s1 || sb.s2 || sb.s3)
      .map(([track, sb]) => {
        const parts = [];
        if (sb.s1) parts.push(`S1: ${sb.s1.toFixed(3)}`);
        if (sb.s2) parts.push(`S2: ${sb.s2.toFixed(3)}`);
        if (sb.s3) parts.push(`S3: ${sb.s3.toFixed(3)}`);
        return `  ${track}: ${parts.join(" | ")}`;
      })
      .join("\n") || "  No sector data logged yet";

  return `You are ${firstName}'s personal F1 race engineer on F1 Sim Hub. You have full access to their session data and your role is to give precise, data-driven coaching exactly like a real F1 engineer in a post-session debrief.

COMMUNICATION RULES \u2014 FOLLOW STRICTLY:
- Short, direct sentences. No padding. No waffle.
- Use real F1 terminology: lap delta, sector variance, brake bias, ERS deployment, DRS, trail braking, apex, reference point, snap oversteer, understeer, overcut, undercut.
- Always address the driver by first name: ${firstName}.
- Every coaching point MUST reference their actual data \u2014 specific lap times, specific tracks, specific sessions. Never give generic advice.
- When data is limited, say so directly and tell them what to log to get better analysis.
- Tone: clinical and precise, like Lambiase briefing Verstappen. Brief genuine encouragement when clearly earned.
- Never say "Great question", "Certainly!", "Of course!" or any AI filler. Just answer.
- Format responses clearly. Use line breaks between distinct points.
${goals ? `\nDRIVER GOALS: ${goals}` : ""}

DRIVER PROFILE:
Name: ${name ?? "Unknown"}
Platform: ${platform ?? "Not specified"}
Hardware: ${hardware ?? "Not specified"}
Total sessions logged: ${sessions.length}

RECENT SESSIONS (last 6):
${recentLines}

PERSONAL BESTS BY TRACK:
${pbLines}

BEST SECTOR TIMES:
${sectorLines}

SESSION COUNT BY TRACK:
${trackLines}

CONSISTENCY ANALYSIS (avg vs best lap gap):
${varianceLines}

COACHING APPROACH:
When starting a conversation, immediately identify the single most impactful area to work on based on the data. Name the specific track, the specific time gap, what's causing it. Don't wait to be asked \u2014 lead with the analysis.
If the driver has no sessions or very few, encourage them to log more and explain what data you need to give better coaching.`;
}

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const { messages, userData } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        stream: true,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(userData ?? { sessions: [] }),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Anthropic API error:", apiRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "Engineer comms down. Try again." }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = apiRes.body.getReader();
    let buffer = "";

    const readable = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") { controller.close(); return; }
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "content_block_delta" && evt.delta?.text) {
              controller.enqueue(encoder.encode(evt.delta.text));
            }
          } catch { /* skip non-JSON lines */ }
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Race Engineer API error:", err);
    return new Response(
      JSON.stringify({ error: "Engineer comms down. Try again." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
}
