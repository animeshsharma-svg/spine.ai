// Sign a QA test vendor in on sec-api through the vendor web app identity; codes come from the UAT rule, never printed.
import { pathToFileURL } from "node:url";
const PT = "/Users/animesh/Desktop/procol/procol test";
const { loginOtpCandidates } = await import(pathToFileURL(`${PT}/src/auth/uatOtp.ts`).href);
const API = "https://sec-api.ag-ri.in/api";
const KEY = "agribid_web_key", SEC = "agribid_web_secret", VER = "2.30.292";
const b64 = (s: string) => Buffer.from(s).toString("base64");
export async function vendorLogin(email: string, tenant = 198678): Promise<{ token: string; raw: any }> {
  const boot = b64(`${KEY}:${SEC}`);
  const h = { "access-token": boot, "app-version": VER, "Content-Type": "application/json" };
  await fetch(API + "/v1/generate_otp", { method: "POST", headers: h, body: JSON.stringify({ email }) });
  const cands: Array<{ otp: string; source?: string }> = await loginOtpCandidates({ email }, tenant);
  for (const c of cands) {
    for (const extra of [{}, { terms_and_policy_accepted: true }]) {
      const r = await fetch(API + "/v1/verify_otp", { method: "POST", headers: h, body: JSON.stringify({ email, otp: c.otp, push_token: null, device_info: { browser: "Chrome", os: "macOS" }, device_id: `qa-${Date.now()}`, ...extra }) });
      const t = await r.text(); let j: any = {}; try { j = JSON.parse(t); } catch {}
      if (j.access_token) return { token: b64(`${KEY}:${SEC}:${j.access_token}`), raw: { ...j, access_token: undefined, otpSource: c.source } };
      if (/705|terms/i.test(t) && /^qa_.*@example\.com$/i.test(email)) continue;
      if (!/invalid otp|"code":\s*6/i.test(t)) throw new Error(`verify_otp: ${r.status} ${t.slice(0, 160)}`);
      break;
    }
  }
  throw new Error("no login code accepted");
}
export async function vcall(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { "access-token": token, "app-version": VER, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
}
if (process.argv[1]?.endsWith("vo-vendor-login.ts")) {
  const email = process.argv[2];
  const { token, raw } = await vendorLogin(email);
  console.log("signed in:", email, "user exists:", !!raw.user, "company:", raw.user?.company?.name, "via", raw.otpSource);
  if (process.argv.includes("--signup")) {
    const su = await vcall(token, "POST", "/v1/vendor_signup", { email, name: "QA VO Vendor", firm_name: `QA_Platform VO Home ${Date.now() % 1e5}`, city_id: 8, address: "QA Platform Street 1", terms_and_policy_accepted: true });
    console.log("vendor_signup", su.s, su.t.slice(0, 200));
  }
  const { closePool } = await import(pathToFileURL(`${PT}/src/db/pool.ts`).href); await closePool();
}
