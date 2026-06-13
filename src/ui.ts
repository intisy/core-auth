// @ts-nocheck
// The Provider tab, injected into a loader's TUI via tuiApi.registerTab. Lists
// discovered providers, marks the active one, shows each provider's account
// count, and offers set-active / login / remove. Provider-agnostic.

import { getConfigDir } from "./env.js";
import { activeProvider, setActiveProvider } from "./config.js";
import { discoverProviders, findProvider, loadDriver } from "./registry.js";
import { listAccounts, addAccount, removeAccounts } from "./accounts.js";
import { log } from "./log.js";

export function registerProviderTab(tuiApi): void {
  let cursor = 0;

  tuiApi.registerTab({
    id: "provider",
    label: "Provider",

    render: function (state, h) {
      const providers = discoverProviders();
      const active = activeProvider();

      h.pushBody("  " + h.MAGENTA + "#" + h.GRAY + " AI Providers (" + providers.length + ")" + h.RST, false);
      if (providers.length === 0) {
        h.pushBody("  " + h.GRAY + "No providers installed." + h.RST, false);
        h.pushBody("  " + h.GRAY + "Install an auth plugin (e.g. mock-auth, antigravity-auth) to add one." + h.RST, false);
      }

      for (let i = 0; i < providers.length; i++) {
        const p = providers[i];
        const sel = i === cursor;
        const count = listAccounts(p.name).length;
        const icon = p.name === active ? (h.GREEN + "●" + h.RST) : (h.GRAY + "○" + h.RST);
        const arrow = sel ? (h.YELLOW + " > " + h.RST) : "   ";
        const bg = sel ? h.BG_SEL : "";
        const style = sel ? (h.BOLD + h.WHITE) : h.DIM;
        const detail = count > 0 ? (count + " account" + (count === 1 ? "" : "s")) : "no accounts";
        h.pushBody("  " + bg + arrow + icon + " " + style + h.pad(h.trunc(p.name, state.nameW), state.nameW) + h.RST + bg + "  " + h.GRAY + detail + " · from " + p.plugin + h.RST, sel);
      }

      h.pushBody("", false);
      if (state.message) h.pushFoot("  " + h.GREEN + "  " + h.trunc(state.message, state.cols - 5) + h.RST);
      h.pushFoot("  " + h.GRAY + "-".repeat(h.barW) + h.RST);
      h.pushFoot("  " + h.DIM + "^v" + h.RST + "/" + h.DIM + "WS" + h.RST + " Move  " +
        h.DIM + "Enter" + h.RST + " Set active  " +
        h.DIM + "L" + h.RST + " Log in  " +
        h.DIM + "X" + h.RST + " Remove accounts  " +
        h.DIM + "Tab" + h.RST + " Switch  " +
        h.DIM + "Q" + h.RST + " Quit");
    },

    handleKey: function (key, state, api) {
      const providers = discoverProviders();
      if (key === "up" || key === "w") {
        cursor = Math.max(0, cursor - 1);
      } else if (key === "down" || key === "s") {
        cursor = Math.min(Math.max(0, providers.length - 1), cursor + 1);
      } else if (providers.length === 0 || cursor >= providers.length) {
        return;
      } else if (key === "enter" || key === "space") {
        setActiveProvider(providers[cursor].name);
        api.flash("Active provider: " + providers[cursor].name);
      } else if (key === "l") {
        const entry = providers[cursor];
        api.flash("Logging in to " + entry.name + "...");
        loadDriver(entry).then(function (driver) {
          if (!driver || typeof driver.authenticate !== "function") {
            api.flash(entry.name + " has no login flow.");
            return;
          }
          return Promise.resolve(driver.authenticate({ configDir: getConfigDir(), log })).then(function (account) {
            if (account && account.id) {
              addAccount(entry.name, account);
              api.flash("Logged in: " + (account.label || account.id));
            } else {
              api.flash(entry.name + ": login returned no account.");
            }
          });
        }).catch(function (e) {
          api.flash(entry.name + " login failed: " + (e && e.message));
        });
      } else if (key === "x") {
        const entry = providers[cursor];
        removeAccounts(entry.name);
        api.flash("Removed all " + entry.name + " accounts.");
      }
    },
  });
}
