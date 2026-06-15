// @ts-nocheck
// Optional cross-app account sync via sync-bridge — the only place core-auth reaches beyond the active app's home, and the only component allowed to span both. Best-effort: any failure or HUB_SYNC_DISABLED leaves the local store untouched.

import * as bridge from "../sync-bridge/dist/index.js";

export function syncAccounts() {
  if (process.env.HUB_SYNC_DISABLED) return;
  try { bridge.syncAccounts(); } catch {}
}
