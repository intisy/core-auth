// @ts-nocheck
// Generic per-provider account store. The harness is provider-agnostic: a
// CoreAccount holds OAuth creds + generic rate-limit "lanes" + cooldown, plus an
// opaque `meta` blob carrying any provider extras (project ids, fingerprints,
// quota, verification…). One file, keyed by provider id. AccountManager (the
// selection/rotation/rate-limit engine) is layered on top of this store.
//
// Writes go through a lightweight cross-process lock + atomic temp-rename so the
// running plugin and a separate CLI can mutate the pool without losing updates.
// `opts` ({ dir, file }) lets a provider redirect the store location.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { configFolder } from "./env.js";

const DEFAULT_FILE = "core-auth-accounts.json";
const LOCK_STALE_MS = 15 * 1000;
const LOCK_WAIT_MS = 5 * 1000;
const LOCK_POLL_MS = 25;

function storeFile(opts) {
  return join((opts && opts.dir) || configFolder(), (opts && opts.file) || DEFAULT_FILE);
}

function ensureDir(opts) {
  const dir = (opts && opts.dir) || configFolder();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

// best-effort exclusive lock around `fn`; degrades to running unlocked rather
// than deadlocking if the lock can never be acquired.
function withLock(opts, fn) {
  ensureDir(opts);
  const lockPath = storeFile(opts) + ".lock";
  const deadline = Date.now() + LOCK_WAIT_MS;
  let handle = null;
  while (handle === null) {
    try {
      handle = openSync(lockPath, "wx");
    } catch (error) {
      if (!error || error.code !== "EEXIST") break;          // unexpected error -> proceed unlocked
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) { unlinkSync(lockPath); continue; }
      } catch {}
      if (Date.now() > deadline) break;                       // gave up waiting -> proceed unlocked
      sleepSync(LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    if (handle !== null) {
      try { closeSync(handle); } catch {}
      try { unlinkSync(lockPath); } catch {}
    }
  }
}

function readStore(opts) {
  try { const file = storeFile(opts); if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
  return { version: 1, providers: {} };
}

function writeStore(store, opts) {
  ensureDir(opts);
  const file = storeFile(opts);
  const tmp = file + "." + randomBytes(6).toString("hex") + ".tmp";
  writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
}

function emptyPool() { return { accounts: [], activeIndex: 0, activeIndexByLane: {} }; }

function poolFrom(store, provider) {
  const p = store.providers && store.providers[provider];
  if (!p || !Array.isArray(p.accounts)) return emptyPool();
  return { accounts: p.accounts, activeIndex: p.activeIndex || 0, activeIndexByLane: p.activeIndexByLane || {} };
}

// the full pool for one provider: { accounts, activeIndex, activeIndexByLane }
export function loadAccounts(provider, opts) {
  return poolFrom(readStore(opts), provider);
}

export function saveAccounts(provider, pool, opts) {
  withLock(opts, () => {
    const store = readStore(opts);
    store.version = 1;
    store.providers = store.providers || {};
    store.providers[provider] = {
      accounts: pool.accounts || [],
      activeIndex: pool.activeIndex || 0,
      activeIndexByLane: pool.activeIndexByLane || {},
    };
    writeStore(store, opts);
  });
}

// atomic read-modify-write for one provider's pool. `mutator(pool)` mutates the
// freshly-read pool in place; returns the resulting pool.
export function updateAccounts(provider, mutator, opts) {
  return withLock(opts, () => {
    const store = readStore(opts);
    store.version = 1;
    store.providers = store.providers || {};
    const pool = poolFrom(store, provider);
    mutator(pool);
    store.providers[provider] = {
      accounts: pool.accounts || [],
      activeIndex: pool.activeIndex || 0,
      activeIndexByLane: pool.activeIndexByLane || {},
    };
    writeStore(store, opts);
    return pool;
  });
}

export function listAccounts(provider, opts) { return loadAccounts(provider, opts).accounts; }

// upsert by id (or by refresh token when id is absent)
export function addAccount(provider, account, opts) {
  updateAccounts(provider, (pool) => {
    const i = pool.accounts.findIndex((a) => (account.id && a.id === account.id) || (account.refresh && a.refresh === account.refresh));
    if (i >= 0) pool.accounts[i] = { ...pool.accounts[i], ...account };
    else pool.accounts.push(account);
  }, opts);
}

export function removeAccount(provider, id, opts) {
  updateAccounts(provider, (pool) => { pool.accounts = pool.accounts.filter((a) => a.id !== id); }, opts);
}

export function clearAccounts(provider, opts) { saveAccounts(provider, emptyPool(), opts); }

// one-time import of a provider's legacy on-disk store into this generic store.
// `mapAccount(legacyEntry) -> CoreAccount | null` is provider-supplied so the
// harness needs no knowledge of the legacy schema. No-op if already populated.
export function migrateLegacy(provider, legacyPath, mapAccount, opts) {
  try {
    if (!existsSync(legacyPath)) return false;
    if (loadAccounts(provider, opts).accounts.length > 0) return false;
    const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));
    if (!legacy || !Array.isArray(legacy.accounts)) return false;
    const accounts = legacy.accounts.map(mapAccount).filter(Boolean);
    if (accounts.length === 0) return false;
    saveAccounts(provider, {
      accounts,
      activeIndex: legacy.activeIndex || 0,
      activeIndexByLane: legacy.activeIndexByFamily || legacy.activeIndexByLane || {},
    }, opts);
    return true;
  } catch { return false; }
}
