# core-auth — shared AI-provider auth harness

## Context

Each AI-provider auth plugin (antigravity-auth, claude-code-auth) currently reimplements
the same heavy machinery: account pool, multi-account rotation, quota/rate-limit backoff,
OAuth, credential storage, and a management UI. antigravity-auth has all of it; claude-code-auth
would duplicate it. `core-auth` centralizes that harness in one submodule so a provider plugin
shrinks to a thin **driver** — *transform + endpoint + OAuth descriptor + quota parser*.

This realizes the project principle: every provider is handled the same way, with no
provider-specific features baked into the loaders or the harness.

## Layout

New private submodule **`core-auth`** (TypeScript ESM; same style/logging/config rules as the
other plugins). Embedded alongside `core-loader` in **both** loaders:

```
opencode-loader/   core-loader (submodule, TUI)   core-auth (submodule, auth harness)
claude-code-loader/ core-loader (submodule, TUI)  core-auth (submodule, auth harness)
```

So the "only one submodule" rule becomes "core-loader + core-auth are submodules."

## core-auth owns (the harness — app-agnostic)

- **Driver registry** — discover installed provider plugins via `claudeHub.authProviders`,
  load their driver modules.
- **`route(request, ctx): Promise<Response>`** — the transport-agnostic heart: select account →
  ensure fresh token → `driver.handle(request, account, ctx)` → on quota/429, `driver.parseQuota`
  → cooldown + rotate + retry → return. No HTTP server, no OpenCode types — just `Request`→`Response`.
- **Account pool + storage**, **rotation**, **quota/backoff** (lifted from antigravity-auth's
  `accounts.ts`/`rotation.ts`/`quota.ts`/`storage.ts`).
- **Generic OAuth** driven by the driver's descriptor + a local callback listener (`server.ts`),
  with an optional custom `authenticate()`/`refresh()` escape hatch.
- **UI** — the Provider/account tab (registered via the loader's `registerTab`) + select/confirm
  prompts: list providers, accounts, login/add/remove, set active.
- **Active-provider selection**, config, logging.

## Provider driver contract (thin)

Manifest (single module):
```jsonc
"claudeHub": { "authProviders": [{ "name": "antigravity", "driver": "dist/driver.js" }] }
```
```ts
interface ProviderDriver {
  id: string; label: string;
  oauth?: { authorizeUrl; tokenUrl; clientId; scopes; redirectUri };  // generic OAuth path
  authenticate?(ctx): Promise<Account>;       // custom auth (optional)
  refresh?(account, ctx): Promise<Account>;   // optional if oauth descriptor given
  handle(request, account, ctx): Promise<Response>;   // transform → call API → Claude-shaped response
  parseQuota?(response, account): QuotaInfo;          // cooldownUntil / exhausted → rotation signal
}
```

## Per-app integration (thin adapters — model B)

- **Claude (claude-code-loader):** a tiny daemon entry → `Bun.serve({ fetch: req => coreAuth.route(req, ctx) })`,
  declared as `claudeHub.daemon`. (The proxy already built becomes this shim over `route()`.)
- **OpenCode (opencode-loader):** an `@opencode-ai/plugin` fetch-hook in its plugin → `coreAuth.route(req, ctx)`.
- **Both:** their `tui-extension` registers core-auth's Provider tab; `oc/cc auth login` →
  `HUB_OPEN_TAB=provider` (already wired in core-loader).

## Build order (mock-first; each step builds + container-verifies before the next)

1. **core-auth skeleton + mock-auth + Claude wiring.** core-auth: driver registry/discovery,
   `route()`, account storage, active-provider, the Provider/account UI tab (migrated from the
   base already shipped in claude-code-loader). **mock-auth**: a trivial provider plugin —
   `driver.handle` returns a basic Claude-format response, `authenticate()` creates a dummy
   account, `parseQuota` never rate-limits. claude-code-loader embeds core-auth (daemon shim +
   tab registration). **Verify:** pick mock → "login" → a `cc` chat returns the mock response.
2. **OpenCode adapter.** opencode-loader embeds core-auth + an `@opencode-ai/plugin` fetch-hook →
   `route()`. **Verify:** mock-auth works under OpenCode.
3. **Extract the real harness** (rotation, quota/backoff, generic OAuth + callback listener) from
   antigravity-auth into core-auth.
4. **antigravity-auth → driver** (`driver.js` + `{name, driver}` manifest). **Verify** both apps
   end-to-end: real login + a real request.
5. **claude-code-auth → driver.** **Verify.** Validates the seams with a second real provider.

Build by **extraction, not abstraction** — lift the battle-tested harness out of antigravity-auth
rather than designing the contract in the abstract; mock-auth proves the contract before the real
providers reshape it.

## Open infra question

`core-auth` needs a remote (`intisy-ai/core-auth`, private, like `core-loader`) before it can be
wired as a submodule. Create via `gh repo create` or manually?
