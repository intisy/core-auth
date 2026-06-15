// @ts-nocheck
// The provider contract. A provider plugin supplies one of these and lets
// core-auth do all the OpenCode / Claude Code / loader integration.

export interface ProviderCtx {
  configDir: string;
  log: (message: string) => void;
}

export interface ProviderModel {
  name?: string;
  [key: string]: unknown;
}

export interface ProviderDef {
  id: string;                         // loader/proxy provider name (handler discovery + Providers tab)
  label: string;
  opencodeProvider?: string;          // opencode provider id to attach models to (default "anthropic")
  opencodeNpm?: string;               // SDK package for a custom (non-built-in) opencode provider
  models: Record<string, ProviderModel>;
  handle: (request: Request, ctx: ProviderCtx) => Promise<Response>;
  // optional OAuth login: returns the authorize URL + a complete() that finishes
  // the flow and persists a CoreAccount. When present, core exposes an opencode
  // oauth auth method (and a Claude-side CLI can call it too).
  loginFlow?: (ctx: ProviderCtx) => Promise<{ url: string; instructions?: string; complete: () => Promise<CoreAccount | null> }>;
  // the provider's account controller — the shared core TUI renders what it returns
  accounts?: AccountController;
}

// One account in the generic pool. OAuth creds + generic rate-limit "lanes" +
// cooldown are first-class; everything provider-specific lives in `meta`.
export interface CoreAccount {
  id: string;                         // stable identity (usually the account email)
  email?: string;
  refresh: string;                    // OAuth refresh token (the durable credential)
  access?: string;                    // cached access token
  expires?: number;                   // access token expiry, epoch ms
  addedAt?: number;
  lastUsed?: number;
  enabled?: boolean;                  // user-disabled accounts are skipped by selection
  rateLimitResetTimes?: Record<string, number>;  // lane -> epoch ms the lane is rate-limited until
  coolingDownUntil?: number;          // epoch ms; transient backoff across all lanes
  cooldownReason?: string | null;
  meta?: Record<string, unknown>;     // provider extras (project ids, fingerprint, quota…), opaque to the harness
}

// The on-disk pool for one provider.
export interface AccountPool {
  accounts: CoreAccount[];
  activeIndex: number;                // sticky selection when no lane is given
  activeIndexByLane?: Record<string, number>;
}

export type AccountStatus = "active" | "rate-limited" | "cooling-down" | "verification-required" | "disabled";

export interface AccountQuota {
  label?: string;                     // lane / model / family this quota is for
  usedFraction?: number;              // 0..1
  remainingFraction?: number;         // 0..1
  resetTime?: string | number;
}

// A presentation-only view of one account. The shared core TUI renders this; it
// holds no account logic of its own.
export interface AccountView {
  id: string;
  email?: string;
  status: AccountStatus;
  enabled: boolean;
  lastUsed?: number;
  detail?: string;                    // human-readable status note ("rate-limited 12m")
  quota?: AccountQuota[];
}

// Implemented by the PROVIDER (it controls all account data + behavior); consumed
// by the shared core TUI, which only presents what these return.
export interface AccountController {
  list(): AccountView[];
  enable(id: string, on: boolean): void;
  remove(id: string): void;
  login(): Promise<AccountView | null>;
  refreshQuota?(): Promise<void>;
}
