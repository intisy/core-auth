// @ts-nocheck
// Optional cross-app account sync. core-auth bundles sync-bridge (submodule) so a
// login in one app (Claude Code / OpenCode) is mirrored to the other. This is the
// ONLY place core-auth reaches beyond the active app's config dir, and it does so
// THROUGH sync-bridge — the one component allowed to span both homes. Entirely
// best-effort: any failure, or HUB_SYNC_DISABLED, leaves the local store untouched.

import * as bridge from "../sync-bridge/dist/index.js";

export function syncAccounts() {
  if (process.env.HUB_SYNC_DISABLED) return;
  try { bridge.syncAccounts(); } catch {}
}
