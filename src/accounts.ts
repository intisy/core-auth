// @ts-nocheck
// Generic per-provider account store. The harness is provider-agnostic: a
// CoreAccount holds OAuth creds + generic rate-limit "lanes" + cooldown, plus an
// opaque `meta` blob carrying any provider extras (project ids, fingerprints,
// quota, verification…). One file, keyed by provider id. AccountManager (the
// selection/rotation/rate-limit engine) is layered on top of this store.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { configFolder } from "./env.js";

function storeFile() { return join(configFolder(), "core-auth-accounts.json"); }

function readStore() {
  try { if (existsSync(storeFile())) return JSON.parse(readFileSync(storeFile(), "utf8")) || {}; } catch {}
  return { version: 1, providers: {} };
}

function writeStore(store) {
  try {
    if (!existsSync(configFolder())) mkdirSync(configFolder(), { recursive: true });
    const tmp = storeFile() + "." + randomBytes(6).toString("hex") + ".tmp";
    writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, storeFile());
  } catch {}
}

function emptyPool() { return { accounts: [], activeIndex: 0, activeIndexByLane: {} }; }

// the full pool for one provider: { accounts, activeIndex, activeIndexByLane }
export function loadAccounts(provider) {
  const p = readStore().providers && readStore().providers[provider];
  if (!p || !Array.isArray(p.accounts)) return emptyPool();
  return { accounts: p.accounts, activeIndex: p.activeIndex || 0, activeIndexByLane: p.activeIndexByLane || {} };
}

export function saveAccounts(provider, pool) {
  const store = readStore();
  store.version = 1;
  store.providers = store.providers || {};
  store.providers[provider] = {
    accounts: pool.accounts || [],
    activeIndex: pool.activeIndex || 0,
    activeIndexByLane: pool.activeIndexByLane || {},
  };
  writeStore(store);
}

export function listAccounts(provider) { return loadAccounts(provider).accounts; }

// upsert by id (or by refresh token when id is absent)
export function addAccount(provider, account) {
  const pool = loadAccounts(provider);
  const i = pool.accounts.findIndex((a) => (account.id && a.id === account.id) || (account.refresh && a.refresh === account.refresh));
  if (i >= 0) pool.accounts[i] = { ...pool.accounts[i], ...account };
  else pool.accounts.push(account);
  saveAccounts(provider, pool);
}

export function removeAccount(provider, id) {
  const pool = loadAccounts(provider);
  pool.accounts = pool.accounts.filter((a) => a.id !== id);
  saveAccounts(provider, pool);
}

export function clearAccounts(provider) { saveAccounts(provider, emptyPool()); }

// one-time import of a provider's legacy on-disk store into this generic store.
// `mapAccount(legacyEntry) -> CoreAccount | null` is provider-supplied so the
// harness needs no knowledge of the legacy schema. No-op if already populated.
export function migrateLegacy(provider, legacyPath, mapAccount) {
  try {
    if (!existsSync(legacyPath)) return false;
    if (loadAccounts(provider).accounts.length > 0) return false;
    const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));
    if (!legacy || !Array.isArray(legacy.accounts)) return false;
    const accounts = legacy.accounts.map(mapAccount).filter(Boolean);
    if (accounts.length === 0) return false;
    saveAccounts(provider, {
      accounts,
      activeIndex: legacy.activeIndex || 0,
      activeIndexByLane: legacy.activeIndexByFamily || legacy.activeIndexByLane || {},
    });
    return true;
  } catch { return false; }
}
