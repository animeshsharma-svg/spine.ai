import { request as pwRequest } from "@playwright/test";

import { CONFIG, IdentityConfig, Role } from "../config.js";
import type { AuthTokens } from "../api/client.js";
import {
  buildAccessToken,
  buildBootstrapToken,
  buildLightspeedToken,
} from "./token.js";

export interface LoginResult extends AuthTokens {
  role: Role;
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
  if (!id.otp) throw new Error(`No OTP for role "${id.role}" on client "${CONFIG.name}".`);

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

    const verify = await ctx.post("/v1/verify_otp", {
      data: JSON.stringify({
        ...idBody,
        otp: id.otp,
        push_token: null,
        device_info: deviceInfo,
        device_id: deviceId,
      }),
      timeout: CONFIG.timeoutMs,
    });
    const text = await verify.text();
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
