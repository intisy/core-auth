// @ts-nocheck
// Shared types for the auth harness and the provider driver contract.

// A single authenticated account for a provider (one provider may hold many).
export interface Account {
  id: string;                    // stable id (e.g. email or generated)
  label?: string;                // display name
  credentials?: any;             // provider-specific (tokens, keys)
  cooldownUntil?: number;        // epoch ms; set when rate-limited
  meta?: Record<string, any>;
}

// What a driver reports about an account after a response, so the harness can
// rotate/backoff.
export interface QuotaInfo {
  cooldownUntil?: number;        // account usable again at this epoch ms
  exhausted?: boolean;           // hard out-of-quota
  retryable?: boolean;           // transient — rotate and retry another account
}

// Context handed to a driver for a request.
export interface RouteCtx {
  configDir: string;
  log: (message: string) => void;
}

// Context handed to a driver during interactive login.
export interface AuthContext extends RouteCtx {
  openUrl?: (url: string) => void;          // open a browser (provided by the harness)
  waitForRedirect?: () => Promise<URL>;     // OAuth callback (provided by the harness)
}

// Generic OAuth descriptor — if a driver supplies this, the harness runs the
// OAuth dance for it (added in a later step); otherwise the driver implements
// authenticate()/refresh() itself.
export interface OAuthDescriptor {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
}

// The thin per-provider contract. A provider plugin exports one of these.
export interface ProviderDriver {
  id: string;
  label: string;
  oauth?: OAuthDescriptor;
  authenticate?(ctx: AuthContext): Promise<Account>;
  refresh?(account: Account, ctx: RouteCtx): Promise<Account>;
  handle(request: Request, account: Account | null, ctx: RouteCtx): Promise<Response>;
  parseQuota?(response: Response, account: Account): QuotaInfo;
}

// A discovered provider declaration (from a plugin's claudeHub.authProviders[]).
export interface ProviderEntry {
  name: string;        // provider id from the manifest
  plugin: string;      // repo folder it was declared in
  driverPath: string;  // absolute path to the driver module
}
