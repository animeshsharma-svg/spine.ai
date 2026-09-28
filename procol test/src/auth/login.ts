import { request as pwRequest } from "@playwright/test";

import { CONFIG, IdentityConfig, Role } from "../config.js";
import type { AuthTokens } from "../api/client.js";
import {
  buildAccessToken,
  buildBootstrapToken,
  buildLightspeedToken,
} from "./token.js";
import { loginOtpCandidates, type UatOtp } from "./uatOtp.js";

export interface LoginResult extends AuthTokens {
  role: Role;
  /** where the one-time code that worked came from, for the report */
  otpSource?: string;
  /** true when this login recorded a QA test user's Terms-of-Use acceptance */
  termsAccepted?: boolean;
  appVersion: string;
  baseURL: string;
  raw: unknown;
}

interface VerifyResponse {
  access_token: string;
  user?: {
    uuid?: string;
    company?: { uuid?: string };
    company_uuid?: string;
  };
  [k: string]: unknown;
}

/** A user the platform created for testing: qa_…@example.com (reserved test domain). */
export const QA_TEST_EMAIL = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;
const isQaTestUser = (id: IdentityConfig): boolean =>
  [id.email, id.ownerEmail].some((e) => typeof e === "string" && QA_TEST_EMAIL.test(e));

const deviceInfo = {
  browser: "Chrome",
  os: "OS X 10.15.7 64-bit",
  browser_version: "149.0.0.0",
  resolution: "1440x900",
};

const randDeviceId = (): string => {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return s;
};

/**
 * Generic OTP login for any identity, mirroring the collection:
 *   generate_otp  (buyer/evaluator: {phone, phone_prefix} | vendor: {email})
 *   verify_otp    → response.access_token → 3-segment token (that identity's key:secret:access_token)
 * The bootstrap (2-segment, that identity's key:secret) is used on both calls.
 */
export async function authenticate(id: IdentityConfig): Promise<LoginResult> {
  const isEmail = id.role === "vendor";
  const identifier = isEmail ? id.email : id.phone;
  if (!identifier) {
    throw new Error(`No login identifier for role "${id.role}" on client "${CONFIG.name}".`);
  }
  /**
   * Which codes to try. On UAT every tenant (and, for a vendor, every buyer it
   * deals with) has its own login code, so the configured one is only right
   * for one account. The codes the backend would accept for THIS login come
   * first, read from the database the way the backend reads them; the
   * configured code is the fallback. Capped at four so a wrong guess never
   * turns into hammering the login.
   */
  const uat = await loginOtpCandidates(isEmail ? { email: identifier } : { phone: identifier }, id.tenantCompanyId);
  const candidates: UatOtp[] = [];
  for (const c of [...uat, ...(id.otp ? [{ otp: id.otp, source: "the configured code" }] : [])]) {
    if (!candidates.some((x) => x.otp === c.otp)) candidates.push(c);
  }
  if (!candidates.length) throw new Error(`No OTP for role "${id.role}" on client "${CONFIG.name}".`);
  const tries = candidates.slice(0, 4);

  const bootstrap = buildBootstrapToken(id.appKey, id.appSecret);
  const lightspeedToken = buildLightspeedToken();
  const deviceId = randDeviceId();

  const ctx = await pwRequest.newContext({
    baseURL: id.baseURL,
    extraHTTPHeaders: {
      "access-token": bootstrap,
      "lightspeed-token": lightspeedToken,
      "app-version": id.appVersion,
      "Content-Type": "application/json",
    },
  });

  try {
    const idBody = isEmail
      ? { email: identifier }
      : { phone: identifier, phone_prefix: id.phonePrefix };

    const gen = await ctx.post("/v1/generate_otp", {
      data: JSON.stringify(idBody),
      timeout: CONFIG.timeoutMs,
    });
    if (gen.status() < 200 || gen.status() > 204) {
      throw new Error(`generate_otp (${id.role}) failed: HTTP ${gen.status()} — ${await gen.text()}`);
    }

    // One code sent, then each candidate tried in turn: the UAT codes are
    // accepted alongside the sent one, so no second generate is needed.
    let verify!: Awaited<ReturnType<typeof ctx.post>>;
    let text = "";
    let used: UatOtp = tries[0];
    for (const c of tries) {
      used = c;
      verify = await ctx.post("/v1/verify_otp", {
        data: JSON.stringify({
          ...idBody,
          otp: c.otp,
          push_token: null,
          device_info: deviceInfo,
          device_id: deviceId,
        }),
        timeout: CONFIG.timeoutMs,
      });
      text = await verify.text();
      const ok = verify.status() >= 200 && verify.status() <= 204;
      // Only "Invalid OTP" is worth another code; any other refusal is final.
      if (ok || !/invalid otp|"code"\s*:\s*6\b/i.test(text)) break;
    }
    /**
     * Code 705: the code was right, but the user has never accepted Procol's
     * current Terms of Use and Privacy Policy. For a QA TEST user the platform
     * created itself (qa_…@example.com — a reserved test domain, no real
     * mailbox) acceptance is recorded with the same flag the web app sends when
     * the box is ticked. A real person's consent is never given on their behalf:
     * for them the refusal stands and the report says what to do.
     */
    let termsAccepted = false;
    if (verify.status() === 422 && /"code"\s*:\s*705\b|accept the terms of use/i.test(text) && isQaTestUser(id)) {
      verify = await ctx.post("/v1/verify_otp", {
        data: JSON.stringify({
          ...idBody,
          otp: used.otp,
          terms_and_policy_accepted: true,
          push_token: null,
          device_info: deviceInfo,
          device_id: deviceId,
        }),
        timeout: CONFIG.timeoutMs,
      });
      text = await verify.text();
      termsAccepted = verify.status() >= 200 && verify.status() <= 204;
    }
    if (verify.status() < 200 || verify.status() > 204) {
      throw new Error(`verify_otp (${id.role}) failed: HTTP ${verify.status()} — ${text}`);
    }

    const raw = JSON.parse(text) as VerifyResponse;
    if (!raw.access_token) {
      throw new Error(`verify_otp (${id.role}) missing access_token. Keys: ${Object.keys(raw).join(", ")}`);
    }

    const accessToken = buildAccessToken(id.appKey, id.appSecret, raw.access_token);
    const userUuid = raw.user?.uuid;
    const companyUuid = raw.user?.company?.uuid ?? raw.user?.company_uuid;

    return {
      role: id.role,
      appVersion: id.appVersion,
      baseURL: id.baseURL,
      accessToken,
      lightspeedToken,
      userUuid,
      companyUuid,
      otpSource: used.source,
      ...(termsAccepted ? { termsAccepted: true } : {}),
      raw,
    };
  } finally {
    await ctx.dispose();
  }
}

export const loginBuyer = () => authenticate(CONFIG.identities.buyer);
export const loginVendor = () => authenticate(CONFIG.identities.vendor);
export const loginEvaluator = () => authenticate(CONFIG.identities.evaluator);

/** Back-compat helper used by the early auth spec. */
export function login(opts: { isVendor?: boolean } = {}): Promise<LoginResult> {
  return authenticate(
    opts.isVendor ? CONFIG.identities.vendor : CONFIG.identities.buyer,
  );
}
