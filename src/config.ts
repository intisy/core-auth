// @ts-nocheck
// core-auth config: the active provider and harness settings, stored in
// config/core-auth.json (preferred) with a top-level fallback.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { configFolder, getConfigDir } from "./env.js";

function paths() {
  const dir = getConfigDir();
  return { preferred: join(dir, "config", "core-auth.json"), fallback: join(dir, "core-auth.json") };
}

export function readConfig(): Record<string, any> {
  const { preferred, fallback } = paths();
  const p = existsSync(preferred) ? preferred : existsSync(fallback) ? fallback : null;
  try { return p ? JSON.parse(readFileSync(p, "utf8")) : {}; } catch { return {}; }
}

export function writeConfig(cfg: Record<string, any>): void {
  const { preferred } = paths();
  try {
    if (!existsSync(configFolder())) mkdirSync(configFolder(), { recursive: true });
    writeFileSync(preferred, JSON.stringify(cfg, null, 2), "utf8");
  } catch {}
}

export function activeProvider(): string {
  return readConfig().provider || "";
}

export function setActiveProvider(name: string): void {
  const cfg = readConfig();
  cfg.provider = name;
  writeConfig(cfg);
}
