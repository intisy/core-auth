// @ts-nocheck
// AccountManager: the generic multi-account engine a driver gets for free.
// Storage + selection + rate-limit/cooldown state + OAuth token refresh, all over
// generic CoreAccounts. The driver supplies only its OAuth config (and decides
// what a "lane" means + how to parse rate-limit resets); it never touches storage,
// opencode, claude code, or the loader.

import { loadAccounts, saveAccounts } from "./accounts.js";
import { selectIndex } from "./selection.js";
import { isAvailable, availableAt, calculateBackoffMs } from "./ratelimit.js";
import { accessTokenExpired, refreshAccessToken, TokenRefreshError } from "./oauth.js";

export class AccountManager {
  constructor(providerId, opts) {
    this.providerId = providerId;
    const options = opts || {};
    this.strategy = options.selection || "hybrid";
    this.oauth = options.oauth || null;     // { tokenUrl, clientId, clientSecret?, extraParams? }
    this.backoff = options.backoff || {};   // { baseMs?, maxMs?, jitter? }
  }

  load() { return loadAccounts(this.providerId); }
  save(pool) { saveAccounts(this.providerId, pool); }
  list() { return this.load().accounts; }

  // pick the best account for `lane` and return a usable access token, refreshing
  // it if expired. returns { account, access } or null when none are available.
  async acquire(lane) {
    const now = Date.now();
    const pool = this.load();
    const index = selectIndex(pool, lane, now, this.strategy);
    if (index < 0) return null;
    const account = pool.accounts[index];
    if (!isAvailable(account, lane, now)) return null;  // hybrid may hand back a future account; caller decides to wait
    const access = await this.ensureAccess(pool, account);
    account.lastUsed = now;
    this.save(pool);
    return { account, access };
  }

  // fresh access token for one account, refreshing + persisting when expired.
  // a revoked refresh token disables the account so selection skips it.
  async ensureAccess(pool, account) {
    if (!accessTokenExpired(account)) return account.access;
    if (!this.oauth || !account.refresh) return account.access;
    try {
      const refreshed = await refreshAccessToken(account.refresh, this.oauth);
      account.access = refreshed.access;
      account.expires = refreshed.expires;
      if (refreshed.refresh) account.refresh = refreshed.refresh;
      this.save(pool);
      return account.access;
    } catch (error) {
      if (error instanceof TokenRefreshError && error.revoked) {
        account.enabled = false;
        account.cooldownReason = "refresh token revoked";
        this.save(pool);
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
    const pool = this.load();
    let best = Infinity;
    for (const account of pool.accounts) best = Math.min(best, availableAt(account, lane, now));
    return best === Infinity ? null : best;
  }

  mutate(id, fn) {
    const pool = this.load();
    const account = pool.accounts.find((candidate) => candidate.id === id);
    if (!account) return;
    fn(account);
    this.save(pool);
  }
}
