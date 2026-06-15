// @ts-nocheck
// The single entry a provider plugin calls: from one ProviderDef it yields `handle` (Claude loader proxy) and `opencode` (OpenCode plugin hook).

import { createOpencodePlugin } from "./opencode.js";
import { log } from "./log.js";
import { getConfigDir } from "./env.js";

export function defineProvider(def) {
  return {
    def,
    handle: (request, ctx) => def.handle(request, ctx || { configDir: getConfigDir(), log }),
    opencode: createOpencodePlugin(def),
  };
}
