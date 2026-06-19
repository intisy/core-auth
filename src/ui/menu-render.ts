// @ts-nocheck
// select()-based renderer for the menu model (menu-model.ts). Drives any menu and
// its pushed submenus via a builder stack, rebuilding each loop so state changes
// show. STANDALONE renderer (oc auth login); the loader has its own renderer for
// the same model. An item's run() may also return { input: {...} } to collect a
// line of text (paste a login code, a proxy URL) — handled here via prompt().

import { select } from "./select.js";
import { prompt } from "./prompt.js";
import { isTTY } from "./ansi.js";

export async function runMenu(rootBuilder) {
  if (!isTTY()) return;
  const stack = [rootBuilder];
  const apply = (a) => {
    if (!a) return;                          // stay -> rebuild
    if (a.push) stack.push(a.push);          // push provides a builder fn
    else if (a.pop) stack.pop();
    else if (a.close) stack.length = 0;
  };
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
    if (action && action.input) {
      const inp = action.input;
      if (inp.message) process.stdout.write("\n" + inp.message + "\n");
      const text = await prompt((inp.title || "Input") + ": ");
      if (text != null && String(text).trim() !== "") {
        try { apply(await inp.complete(String(text).trim())); } catch (e) { process.stderr.write(String(e) + "\n"); }
      }
      continue;
    }
    apply(action);
  }
}
