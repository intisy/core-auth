// @ts-nocheck
// Per-provider account storage and selection. One file keyed by provider name;
// rotation/quota-aware selection is refined in a later step.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { configFolder } from "./env.js";

function file() { return join(configFolder(), "core-auth-accounts.json"); }

function readAll(): Record<string, any[]> {
  try { if (existsSync(file())) return JSON.parse(readFileSync(file(), "utf8")) || {}; } catch {}
  return {};
}

function writeAll(data): void {
  try {
    if (!existsSync(configFolder())) mkdirSync(configFolder(), { recursive: true });
    writeFileSync(file(), JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

export function listAccounts(provider: string): any[] {
  return readAll()[provider] || [];
}

export function saveAccounts(provider: string, accounts: any[]): void {
  const all = readAll();
  all[provider] = accounts;
  writeAll(all);
}

export function addAccount(provider: string, account): void {
  const accts = listAccounts(provider);
  const i = accts.findIndex((a) => a.id === account.id);
  if (i >= 0) accts[i] = account; else accts.push(account);
  saveAccounts(provider, accts);
}

export function removeAccounts(provider: string): void {
  const all = readAll();
  delete all[provider];
  writeAll(all);
}

// pick the first account not currently in cooldown (falls back to the first)
export function selectAccount(provider: string): any | null {
  const now = Date.now();
  const accts = listAccounts(provider);
  return accts.find((a) => !a.cooldownUntil || a.cooldownUntil <= now) || accts[0] || null;
}
