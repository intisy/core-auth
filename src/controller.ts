// @ts-nocheck
// Helper that turns an AccountManager into an AccountController so providers don't
// re-implement list/enable/remove. The PROVIDER stays in control: it supplies how
// an account maps to status / quota / detail and the login flow; core only iterates
// the store and shapes the presentation views the shared TUI renders.

import { isCoolingDown } from "./ratelimit.js";

function defaultStatus(account, now) {
  if (account.enabled === false) return "disabled";
  if (isCoolingDown(account, now)) return "cooling-down";
  const lanes = account.rateLimitResetTimes || {};
  if (Object.values(lanes).some((reset) => typeof reset === "number" && reset > now)) return "rate-limited";
  return "active";
}

// opts: { status?(account,now), detail?(account,now), quota?(account), login(), refreshQuota?() }
export function accountControllerFromManager(manager, opts) {
  const options = opts || {};
  return {
    list() {
      const now = Date.now();
      return manager.list().map((account) => ({
        id: account.id,
        email: account.email,
        enabled: account.enabled !== false,
        lastUsed: account.lastUsed,
        status: options.status ? options.status(account, now) : defaultStatus(account, now),
        detail: options.detail ? options.detail(account, now) : undefined,
        quota: options.quota ? options.quota(account) : undefined,
      }));
    },
    enable(id, on) { manager.mutate(id, (account) => { account.enabled = !!on; }); },
    remove(id) { manager.remove(id); },
    login: options.login || (async () => null),
    refreshQuota: options.refreshQuota,
  };
}
