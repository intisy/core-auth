// @ts-nocheck
// File logger, toggleable via core-auth.json `logging`.

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./env.js";
import { readConfig } from "./config.js";

const START_TIME = new Date().toISOString().replace(/:/g, "-").split(".")[0];

export function log(message: string): void {
  if (readConfig().logging === false) return;
  try {
    const dateStr = new Date().toISOString().split("T")[0];
    const dir = join(getConfigDir(), "logs", dateStr);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "core-auth-" + START_TIME + ".log"),
      "[" + new Date().toISOString() + "] " + message + "\n");
  } catch {}
}
