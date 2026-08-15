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

// ── Models ────────────────────────────────────────────────────────────────────
// Drivers on the shared (F1SimHub-funded) key get the cheap model. Drivers who
// bring their own Anthropic key are paying for their own tokens, so they get
// the stronger model by default.
const SHARED_KEY_MODEL = process.env.ENGINEER_MODEL ?? "claude-haiku-4-5";
const BYOK_MODEL = process.env.ENGINEER_MODEL_BYOK ?? "claude-sonnet-5";

// ── Numeric helpers ───────────────────────────────────────────────────────────

function lapToSec(str: string | null | undefined): number | null {
  if (!str?.trim()) return null;
  const parts = str.split(":");
  if (parts.length === 3) {
    const s = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    return isNaN(s) ? null : s;
  }
  if (parts.length === 2) {
    const s = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    return isNaN(s) ? null : s;
  }
  const s = parseFloat(str);
  return isNaN(s) ? null : s;
}

/** Seconds back to m:ss.mmm — how a driver actually reads a lap time. */
function secToLap(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Least-squares slope of ys against xs — seconds gained/lost per lap. */
function slope(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function signed(n: number, digits = 3): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

// ── Lap-level analysis ────────────────────────────────────────────────────────
// The companion app uploads per-lap data. Dumping 150 raw lap lines into the
// prompt is expensive and makes the model do arithmetic it is bad at, so the
// numbers are computed here and only the conclusions (plus genuinely notable
// laps) go into the context.

interface LapAnalysis {
  totalLaps: number;
  cleanLaps: number;
  best: number;
  cleanMedian: number;
  cleanStdev: number;
  /** Share of clean laps within 0.5s of the session best. */
  hitRate: number;
  /** Seconds per lap of pace change across the clean laps. */
  degradation: number | null;
  outLapLoss: number | null;
  mistakes: Array<{ lap: number; loss: number; penalty: string }>;
  penalties: number;
  theoreticalBest: number | null;
  sectorBests: { s1: number | null; s2: number | null; s3: number | null };
  /** Per-sector: how much the best lap gave away vs the session's best sector. */
  sectorLossOnBestLap: { s1: number | null; s2: number | null; s3: number | null };
  compounds: Array<{ tires: string; laps: number; best: number; avg: number; degradation: number | null }>;
}

function analyzeLaps(laps: LapRecord[]): LapAnalysis | null {
  const parsed = laps
    .map((l) => ({
      lap: l.lap,
      t: lapToSec(l.time),
      s1: lapToSec(l.s1),
      s2: lapToSec(l.s2),
      s3: lapToSec(l.s3),
      tires: (l.tires ?? "").trim(),
      penalty: (l.penalty ?? "").trim(),
    }))
    .filter((l): l is typeof l & { t: number } => l.t !== null && l.t > 0);

  if (parsed.length === 0) return null;

  const allTimes = parsed.map((l) => l.t);
  const best = Math.min(...allTimes);
  const med = median(allTimes);

  // A lap is "clean" if it is within 1.5s of the median and carries no penalty.
  // That keeps out-laps, in-laps, spins and traffic laps out of the pace and
  // degradation numbers, which is exactly what a real engineer strips out.
  const clean = parsed.filter((l) => l.t <= med + 1.5 && !l.penalty);
  const cleanTimes = clean.length >= 2 ? clean.map((l) => l.t) : allTimes;

  const mistakes = parsed
    .filter((l) => l.t > best + 1.5 || l.penalty)
    .map((l) => ({ lap: l.lap, loss: l.t - best, penalty: l.penalty }))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5);

  const firstLap = parsed[0];
  const outLapLoss = parsed.length >= 3 && firstLap.t > med ? firstLap.t - med : null;

  const sectorBest = (key: "s1" | "s2" | "s3"): number | null => {
    const vals = parsed.map((l) => l[key]).filter((v): v is number => v !== null && v > 0);
    return vals.length > 0 ? Math.min(...vals) : null;
  };
  const sectorBests = { s1: sectorBest("s1"), s2: sectorBest("s2"), s3: sectorBest("s3") };
  const theoreticalBest =
    sectorBests.s1 && sectorBests.s2 && sectorBests.s3
      ? sectorBests.s1 + sectorBests.s2 + sectorBests.s3
      : null;

  const bestLapRecord = parsed.find((l) => l.t === best)!;
  const lossOn = (key: "s1" | "s2" | "s3"): number | null => {
    const sb = sectorBests[key];
    const onBest = bestLapRecord[key];
    return sb !== null && onBest !== null ? onBest - sb : null;
  };

  // Per-compound pace, so tyre choice can be compared instead of guessed at.
  const byCompound = new Map<string, number[]>();
  const byCompoundLapNo = new Map<string, number[]>();
  for (const l of clean.length >= 2 ? clean : parsed) {
    const key = l.tires || "unknown";
    if (!byCompound.has(key)) {
      byCompound.set(key, []);
      byCompoundLapNo.set(key, []);
    }
    byCompound.get(key)!.push(l.t);
    byCompoundLapNo.get(key)!.push(l.lap);
  }
  const compounds = [...byCompound.entries()]
    .filter(([, times]) => times.length >= 2)
    .map(([tires, times]) => ({
      tires,
      laps: times.length,
      best: Math.min(...times),
      avg: mean(times),
      degradation: slope(byCompoundLapNo.get(tires)!, times),
    }))
    .sort((a, b) => a.best - b.best);

  return {
    totalLaps: parsed.length,
    cleanLaps: clean.length,
    best,
    cleanMedian: median(cleanTimes),
    cleanStdev: stdev(cleanTimes),
    hitRate: cleanTimes.filter((t) => t <= best + 0.5).length / cleanTimes.length,
    degradation: slope(
      (clean.length >= 2 ? clean : parsed).map((l) => l.lap),
      cleanTimes,
    ),
    outLapLoss,
    mistakes,
    penalties: parsed.filter((l) => l.penalty).length,
    theoreticalBest,
    sectorBests,
    sectorLossOnBestLap: { s1: lossOn("s1"), s2: lossOn("s2"), s3: lossOn("s3") },
    compounds,
  };
}

// ── Career-level analysis ─────────────────────────────────────────────────────

interface TrackCarStats {
  trackId: string;
  car: string;
  sessions: number;
  best: number;
  bestDate: string;
  firstBest: number;
  firstDate: string;
  sectorBests: { s1: number | null; s2: number | null; s3: number | null };
  theoreticalBest: number | null;
  /** Mean (avg lap − best lap) across sessions — raw race-pace consistency. */
  avgGap: number | null;
  lastFive: number | null;
  priorFive: number | null;
}

function buildTrackCarStats(sessions: Session[]): TrackCarStats[] {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = `${s.trackId}||${s.car}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const stats: TrackCarStats[] = [];
  for (const [key, group] of groups) {
    const [trackId, car] = key.split("||");
    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const withBest = ordered.filter((s) => lapToSec(s.bestLap) !== null);
    if (withBest.length === 0) continue;

    const bestSession = withBest.reduce((acc, s) =>
      (lapToSec(s.bestLap) as number) < (lapToSec(acc.bestLap) as number) ? s : acc,
    );

    const sectorBest = (key2: "s1" | "s2" | "s3"): number | null => {
      const vals = ordered.map((s) => lapToSec(s[key2])).filter((v): v is number => v !== null && v > 0);
      return vals.length > 0 ? Math.min(...vals) : null;
    };
    const sectorBests = { s1: sectorBest("s1"), s2: sectorBest("s2"), s3: sectorBest("s3") };

    const gaps = ordered
      .map((s) => {
        const b = lapToSec(s.bestLap);
        const a = lapToSec(s.avgLap);
        return b !== null && a !== null ? a - b : null;
      })
      .filter((g): g is number => g !== null && g > 0 && g < 15);

    // Recent form: mean best lap over the last five sessions vs the five before.
    const bests = withBest.map((s) => lapToSec(s.bestLap) as number);
    const lastFive = bests.slice(-5);
    const priorFive = bests.slice(-10, -5);

    stats.push({
      trackId,
      car,
      sessions: ordered.length,
      best: lapToSec(bestSession.bestLap) as number,
      bestDate: bestSession.date,
      firstBest: bests[0],
      firstDate: withBest[0].date,
      sectorBests,
      theoreticalBest:
        sectorBests.s1 && sectorBests.s2 && sectorBests.s3
          ? sectorBests.s1 + sectorBests.s2 + sectorBests.s3
          : null,
      avgGap: gaps.length > 0 ? mean(gaps) : null,
      lastFive: lastFive.length >= 2 ? mean(lastFive) : null,
      priorFive: priorFive.length >= 2 ? mean(priorFive) : null,
    });
  }

  return stats.sort((a, b) => b.sessions - a.sessions);
}

// ── Prompt builder ────────────────────────────────────────────────────────────
// The persona/rules block is byte-identical for every driver so it caches
// cleanly; everything driver-specific lives in the data block below it.

const ENGINEER_RULES = `You are a personal F1 race engineer on F1 Sim Hub. You have full access to the driver's session history, and the DATA BRIEF below has already been computed from their real logged laps. Your job is to give precise, data-driven coaching exactly like a real F1 engineer in a post-session debrief.

RULES — FOLLOW STRICTLY:
- Short, direct sentences. No padding, no waffle.
- Use real F1 terminology: lap delta, sector variance, brake bias, ERS deployment, DRS, trail braking, apex, reference point, snap oversteer, understeer, overcut, undercut.
- Every coaching point MUST reference the driver's actual numbers — specific times, specific tracks, specific laps. Never give generic advice.
- The DATA BRIEF is pre-computed and authoritative. Do not recompute it, do not re-derive the arithmetic, and never ask the driver to paste data that is already in the brief.
- Quote deltas to three decimals as they appear in the brief. Do not invent numbers that are not there.
- Lead with the largest single time gain available and say exactly where it is and what is causing it.
- Rank by time available, not by what is easiest to talk about. A 0.9s sector deficit outranks a 0.1s one.
- If a number is missing from the brief, say so plainly and tell the driver exactly what to log to unlock that analysis. Do not speculate to fill the gap.
- Tone: clinical and precise, like Lambiase briefing Verstappen. Brief genuine encouragement only when clearly earned.
- NEVER say "Great question", "Certainly!", "Of course!" or any AI filler. Just answer.
- Keep responses focused and concise — most answers are 3-6 short paragraphs. Use line breaks between distinct points.

READING THE BRIEF:
- "Theoretical best" is the sum of the driver's best sectors. The gap between it and their actual best lap is time they have already proven they can find — it is the cheapest gain on the table.
- "Degradation" is the least-squares pace trend in seconds per lap across clean laps. Positive means dropping off, negative means building pace.
- "Consistency spread" is the standard deviation of clean laps. Under 0.3s is strong, 0.3-0.6s is workable, above 0.6s means the lap is not repeatable yet and consistency work outranks outright pace.
- "Hit rate" is the share of clean laps within 0.5s of the session best. Low hit rate with a strong best lap means one good lap, not real pace.
- Out-laps, in-laps, penalty laps and laps more than 1.5s off the median have already been excluded from pace numbers and listed separately as mistakes.

When starting the conversation, immediately identify the single most impactful area to work on. Name the specific track, the specific time gap, and the cause. Do not wait to be asked. If the driver has fewer than 3 sessions, tell them what to log first.`;

function buildDataBrief(userData: UserData): string {
  const { name, hardware, platform, sessions = [], goals } = userData;
  const firstName = name?.split(" ")[0] ?? "Driver";

  const trackStats = buildTrackCarStats(sessions);
  const lines: string[] = [];

  lines.push(`DRIVER: ${firstName} (address them by this name)`);
  lines.push(
    `Profile: ${name ?? "Unknown"} | Platform: ${platform ?? "Not specified"} | Hardware: ${hardware ?? "Not specified"} | Total sessions: ${sessions.length}`,
  );
  if (goals) lines.push(`Stated goals: ${goals}`);

  // ── Recent sessions ────────────────────────────────────────────────────────
  const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  lines.push("", "RECENT SESSIONS (newest first):");
  if (recent.length === 0) {
    lines.push("  No sessions logged yet.");
  } else {
    for (const s of recent) {
      lines.push(
        `  ${s.date} | ${s.trackId} | ${s.car} | ${s.type} | Best ${s.bestLap ?? "—"} | Avg ${s.avgLap ?? "—"}${s.tires ? ` | ${s.tires}` : ""}${s.notes ? ` | note: "${s.notes}"` : ""}`,
      );
    }
  }

  // ── Per track+car breakdown ────────────────────────────────────────────────
  lines.push("", "TRACK / CAR BREAKDOWN (ranked by sessions logged):");
  if (trackStats.length === 0) {
    lines.push("  No lap times logged yet.");
  } else {
    for (const t of trackStats.slice(0, 8)) {
      lines.push(`  ${t.trackId} | ${t.car} | ${t.sessions} session${t.sessions > 1 ? "s" : ""}`);
      lines.push(`    PB: ${secToLap(t.best)} (set ${t.bestDate})`);

      // Summary sector times aren't always internally consistent with the
      // summary best lap (different sessions, rounding, sectors recorded from
      // the best lap rather than best-of-session). Only claim time is available
      // when the sectors genuinely beat the PB.
      if (t.theoreticalBest !== null && t.theoreticalBest < t.best) {
        lines.push(
          `    Theoretical best: ${secToLap(t.theoreticalBest)} — ${(t.best - t.theoreticalBest).toFixed(3)}s available by stringing their own best sectors together`,
        );
      }

      const sb = t.sectorBests;
      const sbParts: string[] = [];
      if (sb.s1) sbParts.push(`S1 ${sb.s1.toFixed(3)}`);
      if (sb.s2) sbParts.push(`S2 ${sb.s2.toFixed(3)}`);
      if (sb.s3) sbParts.push(`S3 ${sb.s3.toFixed(3)}`);
      if (sbParts.length > 0) lines.push(`    Best sectors: ${sbParts.join(" | ")}`);

      if (t.avgGap !== null) {
        const verdict = t.avgGap > 2 ? "HIGH VARIANCE" : t.avgGap > 1 ? "needs work" : "consistent";
        lines.push(`    Avg-to-best gap across sessions: +${t.avgGap.toFixed(3)}s — ${verdict}`);
      }

      if (t.sessions >= 2) {
        const improvement = t.firstBest - t.best;
        lines.push(
          `    Progression: ${secToLap(t.firstBest)} (${t.firstDate}) -> ${secToLap(t.best)} — ${improvement.toFixed(3)}s found`,
        );
      }

      if (t.lastFive !== null && t.priorFive !== null) {
        const trend = t.lastFive - t.priorFive;
        const verdict = trend < -0.15 ? "IMPROVING" : trend > 0.15 ? "REGRESSING" : "plateaued";
        lines.push(
          `    Recent form: last 5 sessions avg best ${secToLap(t.lastFive)} vs prior 5 ${secToLap(t.priorFive)} — ${signed(trend)}s, ${verdict}`,
        );
      }
    }
  }

  // ── Latest run with per-lap telemetry ──────────────────────────────────────
  const withLaps = sessions
    .filter((s) => s.laps && s.laps.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lapSession = withLaps[0];
  const analysis = lapSession ? analyzeLaps(lapSession.laps!) : null;

  lines.push("", "LATEST RUN — LAP-BY-LAP ANALYSIS:");
  if (!analysis || !lapSession) {
    lines.push(
      "  No per-lap data logged — only session summaries. The companion app uploads lap-by-lap telemetry, which unlocks degradation, stint and mistake analysis.",
    );
  } else {
    lines.push(`  ${lapSession.date} | ${lapSession.trackId} | ${lapSession.car} | ${lapSession.type}`);
    lines.push(
      `  ${analysis.totalLaps} laps logged, ${analysis.cleanLaps} clean (out/in/penalty/off-pace laps excluded)`,
    );
    lines.push(`  Best: ${secToLap(analysis.best)} | Clean median: ${secToLap(analysis.cleanMedian)}`);
    lines.push(
      `  Consistency spread (std dev of clean laps): ${analysis.cleanStdev.toFixed(3)}s | Hit rate within 0.5s of best: ${(analysis.hitRate * 100).toFixed(0)}%`,
    );

    if (analysis.degradation !== null) {
      const perTen = analysis.degradation * 10;
      const verdict =
        analysis.degradation > 0.05
          ? "dropping off"
          : analysis.degradation < -0.05
            ? "building pace through the run"
            : "flat";
      lines.push(
        `  Degradation: ${signed(analysis.degradation)}s per lap (${signed(perTen, 2)}s over 10 laps) — ${verdict}`,
      );
    }

    if (analysis.theoreticalBest !== null && analysis.theoreticalBest < analysis.best) {
      lines.push(
        `  Theoretical best this run: ${secToLap(analysis.theoreticalBest)} — ${(analysis.best - analysis.theoreticalBest).toFixed(3)}s left on the table`,
      );
      const loss = analysis.sectorLossOnBestLap;
      const lossParts: string[] = [];
      if (loss.s1 !== null) lossParts.push(`S1 +${loss.s1.toFixed(3)}`);
      if (loss.s2 !== null) lossParts.push(`S2 +${loss.s2.toFixed(3)}`);
      if (loss.s3 !== null) lossParts.push(`S3 +${loss.s3.toFixed(3)}`);
      if (lossParts.length > 0) {
        lines.push(`  Sector loss on their best lap vs their own best sectors: ${lossParts.join(" | ")}`);
      }
    }

    if (analysis.outLapLoss !== null) {
      lines.push(`  Out-lap cost ${analysis.outLapLoss.toFixed(3)}s vs median — tyre/brake warm-up`);
    }

    if (analysis.mistakes.length > 0) {
      lines.push(
        `  Mistake laps (${analysis.penalties} carried a penalty): ${analysis.mistakes
          .map((m) => `L${m.lap} +${m.loss.toFixed(3)}s${m.penalty ? ` (${m.penalty})` : ""}`)
          .join(", ")}`,
      );
    } else {
      lines.push("  No mistake laps — every lap within 1.5s of the best, no penalties.");
    }

    if (analysis.compounds.length > 1) {
      lines.push("  Compound comparison:");
      for (const c of analysis.compounds) {
        const deg = c.degradation !== null ? `, deg ${signed(c.degradation)}s/lap` : "";
        lines.push(
          `    ${c.tires}: ${c.laps} laps, best ${secToLap(c.best)}, avg ${secToLap(c.avg)}${deg}`,
        );
      }
    }
  }

  // ── Data gaps ──────────────────────────────────────────────────────────────
  const gaps: string[] = [];
  if (sessions.length < 3) gaps.push("fewer than 3 sessions logged");
  if (sessions.filter((s) => s.avgLap).length < 2) gaps.push("average lap times missing on most sessions");
  if (sessions.filter((s) => s.s1).length < 2) gaps.push("sector times missing on most sessions");
  if (withLaps.length === 0) gaps.push("no per-lap data (companion app not uploading)");
  if (!goals) gaps.push("no stated goals");
  lines.push("", `DATA GAPS: ${gaps.length > 0 ? gaps.join("; ") : "none — full data available"}`);

  return lines.join("\n");
}

// ── Handler ───────────────────────────────────────────────────────────────────

function isPlausibleAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_\-]{20,200}$/.test(key);
}

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Anthropic-Api-Key",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Bring-your-own-key: the driver supplies their own Anthropic key, so the
    // tokens are billed to them, not to F1SimHub. Their key is used for this
    // one request and never logged or persisted anywhere.
    const rawUserKey = req.headers.get("x-anthropic-api-key")?.trim() ?? "";
    if (rawUserKey && !isPlausibleAnthropicKey(rawUserKey)) {
      return new Response(
        JSON.stringify({ error: "That doesn't look like an Anthropic API key. It should start with sk-ant-." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const userKey = rawUserKey || null;

    // Free-tier gate: only applies to drivers on the shared F1SimHub key. The
    // api-server owns the per-user message count and the shared unlock password
    // (it has DB + Clerk auth access; this edge function doesn't). Every message
    // on the shared key must clear that check first so the limit can't be
    // bypassed by calling this endpoint directly. BYOK requests skip it — they
    // cost us nothing, so there is nothing to meter.
    if (!userKey) {
      const apiServerUrl = process.env.API_SERVER_URL;
      if (!apiServerUrl) {
        return new Response(JSON.stringify({ error: "Engineer comms down. API_SERVER_URL is not configured." }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      let usage: { allowed: boolean; count: number; limit: number; unlocked: boolean };
      try {
        const usageRes = await fetch(`${apiServerUrl.replace(/\/+$/, "")}/api/engineer-usage/check-and-increment`, {
          method: "POST",
          headers: { Authorization: authHeader },
        });
        if (usageRes.status === 401) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        if (!usageRes.ok) throw new Error(`usage check failed: ${usageRes.status}`);
        usage = await usageRes.json();
      } catch (err) {
        console.error("Race Engineer usage check error:", err);
        return new Response(JSON.stringify({ error: "Engineer comms down. Could not verify usage." }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      if (!usage.allowed) {
        return new Response(
          JSON.stringify({ error: "limit_reached", count: usage.count, limit: usage.limit }),
          { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
    }

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

    // Bound request size: the free-tier gate above only limits message *count*
    // over time, not the size of any single request. Without these caps a
    // single allowed request could still carry megabytes of content/sessions.
    const MAX_MESSAGES = 40;
    const MAX_CONTENT_CHARS = 4000;
    const MAX_SESSIONS = 500;
    const MAX_LAPS_PER_SESSION = 150;

    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: "Too many messages in conversation." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (messages.some((m) => typeof m.content !== "string" || m.content.length > MAX_CONTENT_CHARS)) {
      return new Response(JSON.stringify({ error: "Message content too long." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const sessions = userData?.sessions;
    if (sessions !== undefined) {
      if (!Array.isArray(sessions) || sessions.length > MAX_SESSIONS) {
        return new Response(JSON.stringify({ error: "Too much session data." }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (sessions.some((s) => Array.isArray(s.laps) && s.laps.length > MAX_LAPS_PER_SESSION)) {
        return new Response(JSON.stringify({ error: "Too much lap data in a session." }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const apiKey = userKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Engineer comms down. Check ANTHROPIC_API_KEY env var is set in Vercel." }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model: userKey ? BYOK_MODEL : SHARED_KEY_MODEL,
      max_tokens: userKey ? 1200 : 700,
      system: [
        {
          // Byte-identical for every driver and every turn, so this prefix is a
          // shared cache hit across the whole user base.
          type: "text",
          text: ENGINEER_RULES,
          cache_control: { type: "ephemeral" },
        },
        {
          // Changes only when the driver logs a new session, so it caches for
          // the whole conversation.
          type: "text",
          text: `DATA BRIEF — pre-computed from the driver's logged sessions:\n\n${buildDataBrief(userData ?? { sessions: [] })}`,
          cache_control: { type: "ephemeral" },
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
          controller.close();
        } catch (err) {
          // A mid-stream failure (network drop, upstream API error after the
          // stream already started) must surface as a stream error, not a
          // clean close — closing here would make a truncated response look
          // like a successful, complete answer to the client.
          console.error("Race Engineer stream error:", err);
          controller.error(err);
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
