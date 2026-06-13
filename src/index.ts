// @ts-nocheck
// Public surface of the core-auth harness, consumed by the loaders' adapters.

export { route } from "./route.js";
export { registerProviderTab } from "./ui.js";
export { discoverProviders, findProvider, loadDriver } from "./registry.js";
export { activeProvider, setActiveProvider, readConfig, writeConfig } from "./config.js";
export { listAccounts, addAccount, removeAccounts, selectAccount, saveAccounts } from "./accounts.js";
export { getConfigDir, configFolder, reposDir } from "./env.js";
export { log } from "./log.js";
export * from "./types.js";
