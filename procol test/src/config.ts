import { config as loadEnv } from "dotenv";

loadEnv();

/**
 * Mirrors the Postman collection's master config (the "env variables" request):
 *   LAYER 1  CONST    — product facts, never change across clients
 *   LAYER 2  CLIENTS  — per-client inputs (URL + logins + OTP + catalog)
 *   ACTIVE_CLIENT     — the one line you flip to switch environment
 *
 * All values here are non-secret sandbox test data (the same values the
 * collection ships with), so they live in code — override any of them via
 * env when needed (e.g. ACTIVE_CLIENT, or CLIENTA_BASE_URL).
 */

// ── LAYER 1 — CONSTANTS ─────────────────────────────────────────────────────
export const CONST = {
  consoleKey: "console_app_key",
  consoleSecret: "console_app_secret",
  consoleAppVersion: "9.4.291",
  agribidKey: "agribid_web_key",
  agribidSecret: "agribid_web_secret",
  agribidAppVersion: "2.30.292",
  phonePrefix: "+91",
} as const;

// ── LAYER 2 — PER-CLIENT INPUTS ─────────────────────────────────────────────
export interface ClientInputs {
  baseURL: string;
  url?: string;
  vendorUrl?: string;
  appVersionOverride?: string;
  vendorAppVersionOverride?: string;

  buyerPhone: string;
  vendorEmail: string;
  evalPhone: string;
  otp: string;

  // catalog / reference ids for this client's seeded data
  productUuid: string;
  productQualityUuid: string;
  technicalTemplateUuid: string;
  pricingTemplateUuid: string;
  locationUuid: string;
  vendorBidCompanyUuid: string;
  useRfqQuotes: boolean;
}

export const CLIENTS: Record<string, ClientInputs> = {
  // clientA — the live sec-api env we test against (kept on the current host).
  clientA: {
    baseURL: "https://sec-api-v1.ag-ri.in/api",
    url: "https://cpanel.ag-ri.in",
    vendorUrl: "https://quotes.ag-ri.in",

    buyerPhone: "1234567516",
    // A known valid vendor on this env. The vendor-lifecycle spec instead picks
    // a vendor dynamically (whoever it invites), which is more robust — this is
    // just the fallback for the static `asVendor()` identity.
    vendorEmail: "amd@gmail.com",
    evalPhone: "9811397474",
    otp: "130899",

    productUuid: "TnBEa3BjWA==",
    productQualityUuid: "WFhYTlprWg==",
    technicalTemplateUuid: "a1haZEQ=",
    pricingTemplateUuid: "RFFEaw==",
    locationUuid: "a05aWk4=",
    vendorBidCompanyUuid: "cGNYWlpE",
    useRfqQuotes: true,
  },

  // rfxdev — sandbox demo env (catalog ids need filling before its flows run).
  rfxdev: {
    baseURL: "https://procol-sandbox-demo-rfx-dev.ag-ri.in/api",
    url: "https://client-chore-get-vendor-optimisation.preview.procol.tech",
    vendorUrl: "https://vendor-main.preview.procol.tech",
    appVersionOverride: "9.4.273",
    vendorAppVersionOverride: "2.30.308",

    buyerPhone: "1123987231",
    vendorEmail: "vendor53@gmail.in",
    evalPhone: "FILL_EVALUATOR_PHONE",
    otp: "991133",

    productUuid: "FILL",
    productQualityUuid: "FILL",
    technicalTemplateUuid: "FILL",
    pricingTemplateUuid: "FILL",
    locationUuid: "FILL",
    vendorBidCompanyUuid: "RFpjWlhw",
    useRfqQuotes: true,
  },
};

// ── ACTIVE CLIENT ───────────────────────────────────────────────────────────
export const ACTIVE_CLIENT = process.env.ACTIVE_CLIENT?.trim() || "clientA";

const input = CLIENTS[ACTIVE_CLIENT];
if (!input) {
  throw new Error(
    `Unknown ACTIVE_CLIENT="${ACTIVE_CLIENT}". Known: ${Object.keys(CLIENTS).join(", ")}`,
  );
}
// allow a couple of high-value env overrides without editing code
const active: ClientInputs = {
  ...input,
  baseURL: process.env[`${ACTIVE_CLIENT.toUpperCase()}_BASE_URL`]?.trim() || input.baseURL,
  otp: process.env.OTP?.trim() || input.otp,
};

// ── DERIVED — identities & per-run test data ────────────────────────────────
export type Role = "buyer" | "vendor" | "evaluator";

export interface IdentityConfig {
  role: Role;
  baseURL: string;
  appKey: string;
  appSecret: string;
  appVersion: string;
  /** login identifier */
  phone?: string;
  email?: string;
  phonePrefix: string;
  otp: string;
  /**
   * The company this login acts for (the tenant a run is testing). On UAT its
   * own login code is accepted for its users and for the vendors it invites,
   * so login tries that code first (auth/uatOtp.ts).
   */
  tenantCompanyId?: number;
}

const buyer: IdentityConfig = {
  role: "buyer",
  baseURL: active.baseURL,
  appKey: CONST.consoleKey,
  appSecret: CONST.consoleSecret,
  appVersion: active.appVersionOverride ?? CONST.consoleAppVersion,
  phone: active.buyerPhone,
  phonePrefix: CONST.phonePrefix,
  otp: active.otp,
};

const vendor: IdentityConfig = {
  role: "vendor",
  baseURL: active.baseURL,
  appKey: CONST.agribidKey,
  appSecret: CONST.agribidSecret,
  appVersion: active.vendorAppVersionOverride ?? CONST.agribidAppVersion,
  email: active.vendorEmail,
  phonePrefix: CONST.phonePrefix,
  otp: active.otp,
};

const evaluator: IdentityConfig = {
  role: "evaluator",
  baseURL: active.baseURL,
  appKey: CONST.consoleKey,
  appSecret: CONST.consoleSecret,
  appVersion: active.appVersionOverride ?? CONST.consoleAppVersion,
  phone: active.evalPhone,
  phonePrefix: CONST.phonePrefix,
  otp: active.otp,
};

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export interface Catalog {
  productUuid: string;
  productQualityUuid: string;
  technicalTemplateUuid: string;
  pricingTemplateUuid: string;
  locationUuid: string;
  vendorBidCompanyUuid: string;
  useRfqQuotes: boolean;
}

export interface AppConfig {
  name: string;
  timeoutMs: number;
  inputs: ClientInputs;
  identities: Record<Role, IdentityConfig>;
  catalog: Catalog;
  /** fresh-per-process test data (like the collection's random values) */
  testData: {
    quantityUnit: string;
    quantityValue: number;
    bidPrice: number;
    priceCapValue: number;
    vendorCountTarget: number;
  };
  // convenience for existing read specs
  baseURL: string;
  appVersion: string;
}

export const CONFIG: AppConfig = {
  name: ACTIVE_CLIENT,
  timeoutMs: 30_000,
  inputs: active,
  identities: { buyer, vendor, evaluator },
  catalog: {
    productUuid: active.productUuid,
    productQualityUuid: active.productQualityUuid,
    technicalTemplateUuid: active.technicalTemplateUuid,
    pricingTemplateUuid: active.pricingTemplateUuid,
    locationUuid: active.locationUuid,
    vendorBidCompanyUuid: active.vendorBidCompanyUuid,
    useRfqQuotes: active.useRfqQuotes,
  },
  testData: {
    quantityUnit: "KG",
    quantityValue: randInt(10, 100),
    bidPrice: randInt(50, 200),
    priceCapValue: 500,
    vendorCountTarget: 100,
  },
  baseURL: active.baseURL,
  appVersion: buyer.appVersion,
};
