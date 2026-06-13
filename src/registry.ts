// @ts-nocheck
// Provider discovery + driver loading. A provider is any installed plugin that
// declares claudeHub.authProviders[] = [{ name, driver }] in its package.json.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { reposDir } from "./env.js";

export function discoverProviders() {
  const out = [];
  let repos = [];
  try { repos = readdirSync(reposDir()); } catch { return out; }
  for (const repo of repos) {
    try {
      const pkg = JSON.parse(readFileSync(join(reposDir(), repo, "package.json"), "utf8"));
      const declared = (pkg.claudeHub && pkg.claudeHub.authProviders) || pkg.authProviders || [];
      for (const p of declared) {
        if (!p.driver) continue;
        out.push({ name: p.name || repo, plugin: repo, driverPath: join(reposDir(), repo, p.driver) });
      }
    } catch {}
  }
  return out;
}

export function findProvider(name) {
  return discoverProviders().find((p) => p.name === name) || null;
}

const DRIVER_CACHE = {};
export async function loadDriver(entry) {
  if (!entry) return null;
  if (DRIVER_CACHE[entry.driverPath] !== undefined) return DRIVER_CACHE[entry.driverPath];
  let driver = null;
  try {
    if (existsSync(entry.driverPath)) {
      const mod = await import(entry.driverPath);
      driver = (mod && (mod.default || mod.driver)) || null;
      if (typeof driver === "function") driver = driver();   // factory support
    }
  } catch (e) { /* caller logs */ }
  DRIVER_CACHE[entry.driverPath] = driver;
  return driver;
}
