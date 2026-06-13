// @ts-nocheck
// Transport-agnostic request router: select the active provider's account and
// dispatch to its driver. Rotation/quota/refresh retry loop is added later;
// this is the single-attempt path used to validate the harness end-to-end.

import { getConfigDir } from "./env.js";
import { activeProvider } from "./config.js";
import { findProvider, loadDriver } from "./registry.js";
import { selectAccount } from "./accounts.js";
import { log } from "./log.js";

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type: "core_auth_error", message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("ok", { status: 200 });

  const name = activeProvider();
  if (!name) return errorResponse(503, "No AI provider selected. Open the loader -> Plugins -> Provider to choose one.");

  const entry = findProvider(name);
  if (!entry) return errorResponse(503, "Active provider '" + name + "' is not installed.");

  const driver = await loadDriver(entry);
  if (!driver || typeof driver.handle !== "function") return errorResponse(500, "Provider '" + name + "' has no valid driver.");

  const ctx = { configDir: getConfigDir(), log };
  const account = selectAccount(name);
  try {
    return await driver.handle(request, account, ctx);
  } catch (e) {
    log("driver.handle failed for " + name + ": " + (e && e.message));
    return errorResponse(502, "Provider handler failed: " + (e && e.message));
  }
}
