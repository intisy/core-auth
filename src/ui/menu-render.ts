// @ts-nocheck
// select()-based renderer for the menu model (menu-model.ts). Drives any menu and
// its pushed submenus via a builder stack, rebuilding each loop so state changes
// show. This is the STANDALONE renderer (oc auth login); the loader has its own
// renderer for the same model. Logic lives in the model, not here.

import { select } from "./select.js";
import { isTTY } from "./ansi.js";

// rootBuilder: () => Menu  (a function so refresh/stay rebuilds with fresh state)
export async function runMenu(rootBuilder) {
  if (!isTTY()) return;
  const stack = [rootBuilder];
  while (stack.length) {
    const menu = stack[stack.length - 1]();
    const items = menu.items.map((it, i) => ({
      label: it.label, hint: it.hint, color: it.color, kind: it.kind, separator: it.separator, value: i,
    }));
    const choice = await select(items, { message: menu.title, subtitle: menu.subtitle, clearScreen: true });
    if (choice === null || choice === undefined) { stack.pop(); continue; }   // Esc = back / exit
    const item = menu.items[choice];
    if (!item || typeof item.run !== "function") continue;                    // heading/separator
    let action;
    try { action = await item.run(); } catch (e) { process.stderr.write(String(e) + "\n"); continue; }
    if (!action) continue;                         // stay -> rebuild current
    if (action.push) stack.push(action.push);      // push provides a builder fn
    else if (action.pop) stack.pop();
    else if (action.close) return;
    // refresh -> loop rebuilds the top
  }
}
