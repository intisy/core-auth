// @ts-nocheck
// Optional cross-app account sync via the sync-bridge package — the only component
// allowed to span both app homes. sync-bridge is an optional dependency: if it is
// not installed the require fails and sync becomes a no-op, as does HUB_SYNC_DISABLED.
import { createRequire } from "module";

let bridge = null;
try { bridge = createRequire(import.meta.url)("sync-bridge"); } catch {}

export function syncAccounts() {
  if (!bridge || process.env.HUB_SYNC_DISABLED) return;
  try { bridge.syncAccounts(); } catch {}
}
