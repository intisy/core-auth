// @ts-nocheck
// Optional external quality ranking for the Auto "leaderboard" source.
// Uses Artificial Analysis (https://artificialanalysis.ai) — requires the user's
// OWN api key (cfg.leaderboard.apiKey or ARTIFICIAL_ANALYSIS_API_KEY). NEVER
// hardcode a key: this library ships publicly. With no key / on any failure the
// caller falls back to the provider's recommended order.

import { readConfig } from "./config.js";
import { log } from "./log.js";

function apiKey(): string {
  const fromEnv = (process.env.ARTIFICIAL_ANALYSIS_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const cfg = readConfig().leaderboard || {};
  return String(cfg.apiKey || "").trim();
}

export function hasLeaderboardKey(): boolean {
  return !!apiKey();
}

// normalize a model id/name for fuzzy matching: lowercase, drop tier/variant
// suffixes and any non-alphanumerics so "claude-opus-4-6-thinking" ~ "Claude 4.6 Opus".
function normalize(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/-(minimal|low|medium|high|thinking|agent|extra-low|preview|customtools)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// pull [{name, score}] from the AA response, tolerating a few field-name shapes.
function extractScores(payload: any): Array<{ name: string; score: number }> {
  const rows = Array.isArray(payload) ? payload : payload && (payload.data || payload.models || payload.results);
  if (!Array.isArray(rows)) return [];
  const out: Array<{ name: string; score: number }> = [];
  for (const r of rows) {
    if (!r) continue;
    const name = r.name || r.model_name || r.slug || r.id || r.model;
    const score =
      r.intelligenceIndex ?? r.intelligence_index ?? r.intelligence ??
      (r.evaluations && (r.evaluations.artificial_analysis_intelligence_index ?? r.evaluations.intelligence_index)) ??
      r.quality ?? r.elo ?? r.score;
    if (name && typeof score === "number") out.push({ name: String(name), score });
  }
  return out;
}

/**
 * Returns `candidateIds` sorted best-first by external quality score, or null if
 * unavailable (no key, fetch/parse failure, or no matches) so the caller can
 * keep the recommended order.
 */
export async function computeLeaderboardOrder(candidateIds: string[]): Promise<string[] | null> {
  const key = apiKey();
  if (!key) return null;
  let scores: Array<{ name: string; score: number }> = [];
  try {
    const response = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
      headers: { "x-api-key": key, Accept: "application/json" },
    });
    if (!response.ok) { log("leaderboard fetch " + response.status); return null; }
    scores = extractScores(await response.json());
  } catch (error) {
    log("leaderboard fetch failed: " + error);
    return null;
  }
  if (!scores.length) return null;

  const normScores = scores.map((s) => ({ norm: normalize(s.name), score: s.score }));
  const scoreFor = (id: string): number => {
    const n = normalize(id);
    let best = -1;
    for (const s of normScores) {
      if (s.norm === n || s.norm.includes(n) || n.includes(s.norm)) best = Math.max(best, s.score);
    }
    return best;
  };

  const scored = candidateIds.map((id) => ({ id, score: scoreFor(id) }));
  if (scored.every((s) => s.score < 0)) return null;   // nothing matched -> fall back
  // matched models sort by score desc; unmatched keep their relative order at the end
  return scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((s) => s.id);
}
