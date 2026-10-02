import { config as loadEnv } from "dotenv";

loadEnv();

/**
 * Master config — client-agnostic, mirroring the API framework's model.
 *
 *   LAYER 1  CONST         — product facts that rarely change
 *   LAYER 2  CLIENTS       — named per-client profiles baked into code
 *   ACTIVE_CLIENT          — the one switch to pick which client to run
 *
 * A "client" is fully described by three things:
 *   1. appUrl   — the buyer-console frontend the browser drives
 *   2. apiUrl   — the backend that frontend talks to
 *   3. login    — buyerPhone + otp (+ console app key/secret/version)
 *
 * Because the console reads its backend from localStorage
 * (`procol_current_selected_api`, injected by LoginPage before boot), ONE
 * frontend build can be pointed at ANY backend — so switching client = swap the
 * three values above, nothing else.
 *
 * Running a DIFFERENT client needs NO code change. Two ways:
 *   A) Add a named profile to CLIENTS below, then ACTIVE_CLIENT=<name>.
 *   B) Define it purely from env — pick any name and set its <NAME>_* vars:
 *        ACTIVE_CLIENT=acme \
 *        ACME_APP_URL=https://acme-console.example \
 *        ACME_API_URL=https://acme-api.example/api \
 *        ACME_BUYER_PHONE=99xxxxxxxx ACME_OTP=xxxxxx \
 *        npx playwright test
 *   Generic overrides (APP_URL / API_URL / BUYER_PHONE / OTP / APP_KEY /
 *   APP_SECRET / APP_VERSION) win over everything, for quick one-offs.
 */

// ── LAYER 1 — CONSTANTS ─────────────────────────────────────────────────────
export const CONST = {
  consoleKey: "console_app_key",
  consoleSecret: "console_app_secret",
  consoleAppVersion: "9.4.291",
  phonePrefix: "+91",
} as const;

// ── LAYER 2 — PER-CLIENT INPUTS ─────────────────────────────────────────────
export interface ClientProfile {
  name: string;
  /** Buyer console web app (where the browser drives the UI). */
  appUrl: string;
  /** Backend API the app talks to (injected into localStorage + config probe). */
  apiUrl: string;

  buyerPhone: string;
  phonePrefix: string;
  otp: string;

  appKey: string;
  appSecret: string;
  appVersion: string;

  /** Supplier portal (vendor app) + a known test vendor for pure-UI bid flows. */
  vendorUrl: string;
  vendorEmail: string;
  vendorOtp: string;
}

type ProfileSeed = Partial<Omit<ClientProfile, "name">>;

/** Named profiles baked into code. Add clients here, or define via env (see top). */
export const CLIENTS: Record<string, ProfileSeed> = {
  // clientA — the live sec-api env, same backend the API framework verifies.
  clientA: {
    appUrl: "https://cpanel.ag-ri.in",
    apiUrl: "https://sec-api.ag-ri.in/api",
    buyerPhone: "1234567516",
    // otp / vendorOtp come from .env (CLIENTA_OTP, CLIENTA_VENDOR_OTP) — never from code.
    vendorUrl: "https://quotes.ag-ri.in",
    vendorEmail: "amd@gmail.com",
  },

  // Example second client — fill these in (or override via CLIENTB_* env) then
  // run with ACTIVE_CLIENT=clientB. Left blank so it fails loudly if selected
  // without being configured.
  clientB: {
    appUrl: "",
    apiUrl: "",
    buyerPhone: "",
    otp: "",
  },
};

const env = (k: string): string | undefined => process.env[k]?.trim() || undefined;

/**
 * Resolve a field for the active client with a clear precedence:
 *   generic override  >  <CLIENT>_<FIELD> env  >  baked profile  >  CONST default
 */
function resolveField(
  clientName: string,
  seed: ProfileSeed,
  field: keyof ProfileSeed,
  genericEnvKeys: string[],
  clientEnvSuffix: string,
  fallback: string,
): string {
  for (const k of genericEnvKeys) {
    const v = env(k);
    if (v) return v;
  }
  const clientKey = `${clientName.toUpperCase()}_${clientEnvSuffix}`;
  const clientVal = env(clientKey);
  if (clientVal) return clientVal;
  const seedVal = seed[field];
  if (typeof seedVal === "string" && seedVal) return seedVal;
  return fallback;
}

// ── ACTIVE CLIENT ───────────────────────────────────────────────────────────
export const ACTIVE_CLIENT = env("ACTIVE_CLIENT") || "clientA";

const seed: ProfileSeed = CLIENTS[ACTIVE_CLIENT] ?? {};

export const CONFIG: ClientProfile = {
  name: ACTIVE_CLIENT,
  appUrl: resolveField(ACTIVE_CLIENT, seed, "appUrl", ["APP_URL"], "APP_URL", ""),
  apiUrl: resolveField(ACTIVE_CLIENT, seed, "apiUrl", ["API_URL"], "API_URL", ""),
  buyerPhone: resolveField(ACTIVE_CLIENT, seed, "buyerPhone", ["BUYER_PHONE"], "BUYER_PHONE", ""),
  phonePrefix: resolveField(ACTIVE_CLIENT, seed, "phonePrefix", ["BUYER_PHONE_PREFIX"], "BUYER_PHONE_PREFIX", CONST.phonePrefix),
  otp: resolveField(ACTIVE_CLIENT, seed, "otp", ["OTP"], "OTP", ""),
  appKey: resolveField(ACTIVE_CLIENT, seed, "appKey", ["APP_KEY"], "APP_KEY", CONST.consoleKey),
  appSecret: resolveField(ACTIVE_CLIENT, seed, "appSecret", ["APP_SECRET"], "APP_SECRET", CONST.consoleSecret),
  appVersion: resolveField(ACTIVE_CLIENT, seed, "appVersion", ["APP_VERSION"], "APP_VERSION", CONST.consoleAppVersion),
  vendorUrl: resolveField(ACTIVE_CLIENT, seed, "vendorUrl", ["VENDOR_URL"], "VENDOR_URL", ""),
  vendorEmail: resolveField(ACTIVE_CLIENT, seed, "vendorEmail", ["VENDOR_EMAIL"], "VENDOR_EMAIL", ""),
  vendorOtp: resolveField(ACTIVE_CLIENT, seed, "vendorOtp", ["VENDOR_OTP"], "VENDOR_OTP", ""),
};

/** Fail early and clearly if the selected client isn't fully configured. */
export function assertConfigured(cfg: ClientProfile = CONFIG): void {
  const missing = (["appUrl", "apiUrl", "buyerPhone", "otp"] as const).filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(
      `Client "${cfg.name}" is not fully configured. Missing: ${missing.join(", ")}. ` +
        `Set them in src/config.ts CLIENTS.${cfg.name} or via env ` +
        `(${missing.map((m) => `${cfg.name.toUpperCase()}_${m.replace(/([A-Z])/g, "_$1").toUpperCase()}`).join(", ")}).`,
    );
  }
}

/** Company selector, mirroring the API framework's COMPANY_ID switch (reserved). */
export const COMPANY_ID = env("COMPANY_ID");

/** Storage-state file the browser projects reuse after auth.setup runs. */
export const AUTH_FILE = ".auth/user.json";
/** Token bundle captured during auth.setup for the read-only config probe. */
export const TOKENS_FILE = ".auth/tokens.json";

export const TIMEOUTS = {
  SHORT: 5_000,
  MEDIUM: 10_000,
  LONG: 30_000,
  XLONG: 60_000,
} as const;

/**
 * Navigation options for every `page.goto`.
 *
 * Playwright's default `waitUntil: "load"` waits for EVERY subresource. The
 * Procol console keeps long-lived connections (analytics, websockets, deferred
 * chunks) open, so `load` can simply never fire — `/orders` timed out at 45s
 * and failed whole flows before a single click happened, while the page itself
 * had been usable for seconds. `domcontentloaded` is the honest signal here;
 * the page objects then wait on their own elements.
 */
export const NAV = { waitUntil: "domcontentloaded" as const, timeout: TIMEOUTS.XLONG };

/** localStorage keys the console uses (verified live on cpanel.ag-ri.in). */
export const STORAGE_KEYS = {
  selectedApi: "procol_current_selected_api",
  accessToken: "procol_access_token",
} as const;
