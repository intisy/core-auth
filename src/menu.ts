// @ts-nocheck
// Runs the shared account-management menu for a provider def. Used by the opencode
// oauth authorize() and by the Claude loader (which suspends its TUI to call this).
import { runAccountMenu } from "./ui/account-menu.js";

export async function runProviderMenu(def) {
  if (!def || !def.accounts) return;
  const actions = typeof def.accounts.actions === "function" ? def.accounts.actions() : [];
  await runAccountMenu(def.accounts, { label: def.label, actions, proxies: !!def.proxies });
}
