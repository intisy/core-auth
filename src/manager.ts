// @ts-nocheck
// AccountManager: the generic multi-account engine a driver gets for free.
// Storage + selection + rate-limit/cooldown state + OAuth token refresh, all over
// generic CoreAccounts. The driver supplies only its OAuth config (and decides
// what a "lane" means, how to parse rate-limit resets, and any extra availability
// rule); it never touches storage, opencode, claude code, or the loader.

import { loadAccounts, saveAccounts, updateAccounts, removeAccount } from "./accounts.js";
import { selectIndex } from "./selection.js";
import { isAvailable as builtinAvailable, availableAt, calculateBackoffMs } from "./ratelimit.js";
import { accessTokenExpired, refreshAccessToken, TokenRefreshError } from "./oauth.js";

export class AccountManager {
  constructor(providerId, opts) {
    this.providerId = providerId;
    const options = opts || {};
    this.strategy = options.selection || "hybrid";
    this.oauth = options.oauth || null;       // { tokenUrl, clientId, clientSecret?, extraParams? }
    this.backoff = options.backoff || {};     // { baseMs?, maxMs?, jitter? }
    this.store = options.store || null;       // { dir?, file? } store location override
    // extra driver skip rule, composed with the built-in availability check
    this.extraAvailable = typeof options.isAvailable === "function" ? options.isAvailable : null;
    this.available = (account, lane, now) =>
      builtinAvailable(account, lane, now) && (!this.extraAvailable || this.extraAvailable(account, lane, now));
  }

  load() { return loadAccounts(this.providerId, this.store); }
  save(pool) { saveAccounts(this.providerId, pool, this.store); }
  list() { return this.load().accounts; }

  // pick the best account for `lane` and return a usable access token, refreshing
  // it if expired. returns { account, access } or null when none are available.
  // selection + the lastUsed claim happen under the store lock; the (network)
  // token refresh runs outside it so a slow refresh never blocks other writers.
  async acquire(lane) {
    const now = Date.now();
    let claimedId = null;
    updateAccounts(this.providerId, (pool) => {
      const index = selectIndex(pool, lane, now, this.strategy, this.available);
      if (index < 0) return;
      const account = pool.accounts[index];
      if (!this.available(account, lane, now)) return;   // hybrid may hand back a future account; caller waits instead
      account.lastUsed = now;
      claimedId = account.id;
    }, this.store);
    if (!claimedId) return null;
    const access = await this.ensureAccess(claimedId);
    const account = this.load().accounts.find((candidate) => candidate.id === claimedId);
    return { account, access };
  }

  // fresh access token for one account, refreshing + persisting when expired.
  // a revoked refresh token disables the account so selection skips it.
  async ensureAccess(id) {
    const account = this.load().accounts.find((candidate) => candidate.id === id);
    if (!account) return undefined;
    if (!accessTokenExpired(account)) return account.access;
    if (!this.oauth || !account.refresh) return account.access;
    try {
      const refreshed = await refreshAccessToken(account.refresh, this.oauth);
      this.mutate(id, (a) => {
        a.access = refreshed.access;
        a.expires = refreshed.expires;
        if (refreshed.refresh) a.refresh = refreshed.refresh;
      });
      return refreshed.access;
    } catch (error) {
      if (error instanceof TokenRefreshError && error.revoked) {
        this.mutate(id, (a) => { a.enabled = false; a.cooldownReason = "refresh token revoked"; });
      }
      throw error;
    }
  }

  // mark a lane rate-limited until `resetMs` (epoch ms). the driver computes
  // resetMs from its own error body, then calls this.
  reportRateLimit(id, lane, resetMs) {
    this.mutate(id, (account) => {
      account.rateLimitResetTimes = account.rateLimitResetTimes || {};
      account.rateLimitResetTimes[lane] = resetMs;
    });
  }

  // transient failure -> exponential backoff cooldown across all lanes
  reportError(id, attempt, reason) {
    const ms = calculateBackoffMs(attempt || 0, this.backoff);
    this.mutate(id, (account) => {
      account.coolingDownUntil = Date.now() + ms;
      account.cooldownReason = reason || "transient error";
    });
  }

  reportSuccess(id) {
    this.mutate(id, (account) => {
      account.coolingDownUntil = 0;
      account.cooldownReason = null;
      account.lastUsed = Date.now();
    });
  }

  // soonest epoch ms any account is usable for `lane`, for the caller to wait on
  nextAvailableAt(lane) {
    const now = Date.now();
    let best = Infinity;
    for (const account of this.load().accounts) best = Math.min(best, availableAt(account, lane, now));
    return best === Infinity ? null : best;
  }

  mutate(id, fn) {
    updateAccounts(this.providerId, (pool) => {
      const account = pool.accounts.find((candidate) => candidate.id === id);
      if (account) fn(account);
    }, this.store);
  }

  remove(id) {
    removeAccount(this.providerId, id, this.store);
  }
}
