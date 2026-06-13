// @ts-nocheck
// Filesystem locations, derived from the active app's config dir.

import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export function getConfigDir(): string {
  return process.env.HUB_CONFIG_DIR
    || (existsSync(join(homedir(), ".claude")) ? join(homedir(), ".claude") : join(homedir(), ".config", "opencode"));
}

export function configFolder(): string {
  return join(getConfigDir(), "config");
}

export function reposDir(): string {
  return join(getConfigDir(), "repos");
}
