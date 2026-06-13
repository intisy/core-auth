// @ts-nocheck
// OpenCode integration: merge the provider's models into opencode config and
// return the auth hook whose loader.fetch calls handle(). The `api` method
// exists so a no-key `oc auth login` makes opencode route through our loader.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir } from "os";
import { getConfigDir } from "./env.js";
import { log } from "./log.js";

function opencodeConfigPath(): string {
  const override = (process.env.OPENCODE_CONFIG || "").trim();
  if (override) return resolve(override);
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const dir = join(base, "opencode");
  const jsonc = join(dir, "opencode.jsonc");
  const json = join(dir, "opencode.json");
  return existsSync(jsonc) ? jsonc : json;
}

function stripJsonc(text: string): string {
  return text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, group) => (group ? "" : match))
    .replace(/,(\s*[}\]])/g, "$1");
}

function mergeModels(opencodeProvider: string, models: Record<string, unknown>, npm?: string): void {
  const path = opencodeConfigPath();
  let config: Record<string, any> = {};
  try { if (existsSync(path)) config = JSON.parse(stripJsonc(readFileSync(path, "utf8"))); } catch {}
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
  config.provider = config.provider || {};
  config.provider[opencodeProvider] = config.provider[opencodeProvider] || {};
  // a custom (non-built-in) provider needs an SDK to parse the response
  if (npm) config.provider[opencodeProvider].npm = npm;
  const existing = config.provider[opencodeProvider].models || {};
  config.provider[opencodeProvider].models = { ...existing, ...models };
  try {
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
  } catch (e) { log("opencode model merge failed: " + (e && e.message)); }
}

export function createOpencodePlugin(def) {
  const opencodeProvider = def.opencodeProvider || "anthropic";
  return async function () {
    try { mergeModels(opencodeProvider, def.models || {}, def.opencodeNpm); } catch {}
    return {
      auth: {
        provider: opencodeProvider,
        methods: [{ label: def.label + " (via core-auth)", type: "api" }],
        loader: async function () {
          return {
            apiKey: def.id,
            fetch: function (input, init) {
              return def.handle(new Request(input, init), { configDir: getConfigDir(), log });
            },
          };
        },
      },
    };
  };
}
