// @ts-nocheck
// Public surface of the core-auth library, bundled into each provider plugin.

export { defineProvider } from "./provider.js";
export { createOpencodePlugin } from "./opencode.js";
export { isOAuthAuth, accessTokenExpired, calculateTokenExpiry, refreshAccessToken, TokenRefreshError } from "./oauth.js";
export { startOAuthListener } from "./server.js";
export { loadAccounts, saveAccounts, updateAccounts, listAccounts, addAccount, removeAccount, clearAccounts, migrateLegacy } from "./accounts.js";
export { AccountManager } from "./manager.js";
export { accountControllerFromManager } from "./controller.js";
export { isAvailable, availableAt, isLaneRateLimited, isCoolingDown, isEnabled, calculateBackoffMs } from "./ratelimit.js";
export { selectIndex } from "./selection.js";
export { getConfigDir, configFolder, reposDir } from "./env.js";
export { log } from "./log.js";
export * from "./types.js";
