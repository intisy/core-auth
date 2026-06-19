// @ts-nocheck
// Runs the shared account-management menu for a provider def. Used by the opencode
// oauth authorize() and by the Claude loader (which suspends its TUI to call this).
import { runMenu } from "./ui/menu-render.js";
import { buildAccountMenu } from "./ui/menu-model.js";
import { isTTY } from "./ui/ansi.js";

// Standalone entry (oc auth login / handler.menu()): render the provider menu
// MODEL with the select() renderer. The loader renders the same model natively.
export async function runProviderMenu(def) {
  if (!def || !def.accounts || !isTTY()) return;
  await runMenu(() => buildAccountMenu(def));
}
