// @ts-nocheck
// Generic availability + backoff math over CoreAccounts. "Lanes" are arbitrary
// strings a driver uses to partition rate limits (e.g. one lane per upstream
// model family). Nothing here knows about any specific provider.

export function isEnabled(account) {
  return account.enabled !== false;
}

export function isCoolingDown(account, now) {
  return typeof account.coolingDownUntil === "number" && account.coolingDownUntil > now;
}

export function isLaneRateLimited(account, lane, now) {
  if (!lane || !account.rateLimitResetTimes) return false;
  const until = account.rateLimitResetTimes[lane];
  return typeof until === "number" && until > now;
}

// enabled, not in global cooldown, and (no lane given OR that lane is free)
export function isAvailable(account, lane, now) {
  if (!isEnabled(account)) return false;
  if (isCoolingDown(account, now)) return false;
  if (lane && isLaneRateLimited(account, lane, now)) return false;
  return true;
}

// soonest epoch ms this account is usable again for `lane`; Infinity if disabled
export function availableAt(account, lane, now) {
  if (!isEnabled(account)) return Infinity;
  let t = 0;
  if (typeof account.coolingDownUntil === "number") t = Math.max(t, account.coolingDownUntil);
  if (lane && account.rateLimitResetTimes && typeof account.rateLimitResetTimes[lane] === "number") {
    t = Math.max(t, account.rateLimitResetTimes[lane]);
  }
  return Math.max(t, now);
}

// exponential backoff, capped, with optional full jitter
export function calculateBackoffMs(attempt, opts) {
  const base = (opts && opts.baseMs) || 1000;
  const max = (opts && opts.maxMs) || 5 * 60 * 1000;
  const raw = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  if (opts && opts.jitter === false) return raw;
  return Math.floor(raw / 2 + Math.random() * (raw / 2));
}
