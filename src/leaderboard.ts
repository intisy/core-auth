// @ts-nocheck
// Live quality ranking for the Auto "leaderboard" source. Pulls per-model quality
// scores from a public, KEYLESS source — OpenRouter's model list
// (https://openrouter.ai/api/v1/models), whose `benchmarks.artificial_analysis
// .intelligence_index` aggregates Artificial Analysis' intelligence index for the
// major providers (Anthropic/Google/OpenAI/…). No hardcoded quality table: the data
// updates as OpenRouter refreshes. Results are cached to disk (24h TTL) so we don't
// refetch on every model refresh. An optional ARTIFICIAL_ANALYSIS_API_KEY (or
// cfg.leaderboard.apiKey) is used first when present (direct AA, finest coverage).
// On a cold failure with no cache we return the catalog order unchanged — we never
// fabricate a ranking.

import { readConfig } from "./config.js";
import { getConfigDir } from "./env.js";
import { log } from "./log.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const AA_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cachePath(): string {
  return join(getConfigDir(), "config", "core-auth-leaderboard.json");
}

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

type Score = { norm: string; score: number };

// ---- score sources ----------------------------------------------------------

// OpenRouter's public /models — keyless. Each model may carry
// benchmarks.artificial_analysis.intelligence_index; index by both name and id.
async function fetchOpenRouter(): Promise<Score[]> {
  const response = await fetch(OPENROUTER_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) { log("leaderboard: openrouter " + response.status); return []; }
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload && payload.data) || [];
  const out: Score[] = [];
  for (const r of rows) {
    const score = r && r.benchmarks && r.benchmarks.artificial_analysis
      && r.benchmarks.artificial_analysis.intelligence_index;
    if (typeof score !== "number") continue;
    if (r.name) out.push({ norm: normalize(r.name), score });
    if (r.id) out.push({ norm: normalize(r.id), score });
  }
  return out;
}

// Direct Artificial Analysis — requires the user's own key; broader/fresher coverage.
async function fetchAA(key: string): Promise<Score[]> {
  const response = await fetch(AA_URL, { headers: { "x-api-key": key, Accept: "application/json" } });
  if (!response.ok) { log("leaderboard: AA " + response.status); return []; }
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload && (payload.data || payload.models || payload.results);
  if (!Array.isArray(rows)) return [];
  const out: Score[] = [];
  for (const r of rows) {
    if (!r) continue;
    const name = r.name || r.model_name || r.slug || r.id || r.model;
    const score =
      r.intelligenceIndex ?? r.intelligence_index ?? r.intelligence ??
      (r.evaluations && (r.evaluations.artificial_analysis_intelligence_index ?? r.evaluations.intelligence_index)) ??
      r.quality ?? r.elo ?? r.score;
    if (name && typeof score === "number") out.push({ norm: normalize(String(name)), score });
  }
  return out;
}

// ---- cache ------------------------------------------------------------------

function readCache(): { fetchedAt: number; scores: Score[] } | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath(), "utf8"));
    if (raw && Array.isArray(raw.scores) && typeof raw.fetchedAt === "number") return raw;
  } catch { /* none / unreadable */ }
  return null;
}

function writeCache(scores: Score[]): void {
  try {
    const p = cachePath();
    if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ fetchedAt: Date.now(), scores }, null, 2), "utf8");
  } catch (e) { log("leaderboard cache write failed: " + e); }
}

// Fresh cache -> use it. Else fetch (AA key first if set, else OpenRouter), cache, return.
// On failure, fall back to any stale cache; finally to empty (caller keeps catalog order).
async function getScores(): Promise<Score[]> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.scores;
  let scores: Score[] = [];
  try {
    const key = apiKey();
    if (key) scores = await fetchAA(key);
    if (!scores.length) scores = await fetchOpenRouter();
  } catch (e) { log("leaderboard fetch failed: " + e); }
  if (scores.length) { writeCache(scores); return scores; }
  return cached ? cached.scores : [];
}

// ---- public order -----------------------------------------------------------

/**
 * Returns `candidateIds` sorted best-first by live quality score (OpenRouter's
 * intelligence_index, keyless; or AA when a key is set). Models with no match keep
 * their catalog order and are placed after scored ones. If no live data is available
 * (offline, no cache), returns the catalog order unchanged — never a fabricated rank.
 */
export async function computeLeaderboardOrder(candidateIds: string[]): Promise<string[]> {
  const scores = await getScores();
  if (!scores.length) return candidateIds.slice();

  // version-tolerant: an exact/substring norm match wins; otherwise fall back to a
  // model-FAMILY match (digits stripped) so e.g. "claude-opus-4.6" still ranks by the
  // live opus family's best score even when OpenRouter only lists opus 4.8.
  const stripVer = (n: string): string => n.replace(/[0-9]+/g, "");
  const scoreFor = (id: string): number => {
    const n = normalize(id);
    let best = -1;
    for (const s of scores) {
      if (s.norm === n || s.norm.includes(n) || n.includes(s.norm)) best = Math.max(best, s.score);
    }
    if (best >= 0) return best;
    const fn = stripVer(n);
    if (fn.length < 4) return -1;   // too short to family-match safely
    for (const s of scores) {
      const fs = stripVer(s.norm);
      if (fs && (fs === fn || fs.includes(fn) || fn.includes(fs))) best = Math.max(best, s.score);
    }
    return best;
  };

  const scored = candidateIds.map((id, i) => ({ id, i, score: scoreFor(id) }));
  return scored
    .sort((a, b) => {
      if (a.score >= 0 && b.score >= 0) return (b.score - a.score) || (a.i - b.i);
      if (a.score >= 0) return -1;       // scored before unscored
      if (b.score >= 0) return 1;
      return a.i - b.i;                   // both unscored: keep catalog order
    })
    .map((s) => s.id);
}
