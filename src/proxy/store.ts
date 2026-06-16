// @ts-nocheck
// Shared proxy pool, persisted to <configDir>/config/core-auth-proxies.json. One
// pool for all providers; accounts reference proxies from it.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { configFolder } from "../env.js";

const FILE = "core-auth-proxies.json";

function storeFile() { return join(configFolder(), FILE); }

function empty() {
  return { version: 1, mode: "disabled", providers: {}, proxies: [], assignments: {}, manualSelection: {} };
}

export function loadProxyStore() {
  try { const f = storeFile(); if (existsSync(f)) return { ...empty(), ...(JSON.parse(readFileSync(f, "utf8")) || {}) }; } catch {}
  return empty();
}

export function saveProxyStore(store) {
  try {
    if (!existsSync(configFolder())) mkdirSync(configFolder(), { recursive: true });
    const file = storeFile();
    const tmp = file + "." + randomBytes(6).toString("hex") + ".tmp";
    writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, file);
  } catch {}
}

export function updateProxyStore(mutator) {
  const store = loadProxyStore();
  mutator(store);
  saveProxyStore(store);
  return store;
}
