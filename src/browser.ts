// @ts-nocheck
// Open a URL in the user's default browser. Silent no-op when none is available
// (headless / container): the async "error" event from a missing opener is
// swallowed so callers can rely on the in-tab paste fallback instead.

import { spawn } from "node:child_process";

export function openBrowser(url) {
  if (!url) return;
  try {
    const platform = process.platform;
    const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {}
}
