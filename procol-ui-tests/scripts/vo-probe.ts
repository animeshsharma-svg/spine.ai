// Probe: QA prospect vendor on cpanel's company (sec-api) → vendor sign-in → onboarding event with a studio template.
import { readFileSync, writeFileSync } from "node:fs";
const API = "https://sec-api.ag-ri.in/api";
const buyerTok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader as string;
const env = Object.fromEntries(readFileSync("../procol test/.env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
const OTP = env.CLIENTA_OTP;
const b64 = (s: string) => Buffer.from(s).toString("base64");
async function call(tok: string, method: string, path: string, body?: unknown, ver = "9.4.377") {
  const r = await fetch(API + path, { method, headers: { "access-token": tok, "app-version": ver, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
}
const stamp = String(Date.now()).slice(-7);
const email = `qa_vo_${stamp}@example.com`;
const firm = `QA_Platform VO ${stamp}`;
// 1. invite as a prospect (onboarding NOT skipped)
const inv = await call(buyerTok, "POST", "/invitations/send_invite", { invite_type: "vendor_invite", firm_name: firm, name: "QA VO Vendor", email, category: "manufacturer", address: "QA Platform Street 1", city_id: 8, skip_vendor_onboarding: false });
console.log("invite", inv.s, inv.t.slice(0, 300));
const vcUuid = inv.j?.company?.uuid;
// 2. vendor first sign-in (agribid web app) with the inviter's UAT code
const boot = b64("agribid_web_key:agribid_web_secret");
const dev = { device_info: { browser: "Chrome", os: "macOS", browser_version: "130", resolution: "1600x1000" }, device_id: `qa-${stamp}`, push_token: null };
const g = await call(boot, "POST", "/v1/generate_otp", { email }, "2.30.292"); console.log("generate_otp", g.s, g.t.slice(0, 160));
let v = await call(boot, "POST", "/v1/verify_otp", { email, otp: OTP, ...dev }, "2.30.292"); console.log("verify_otp", v.s, v.t.slice(0, 200));
if (v.s === 422 && /705|terms/i.test(v.t)) { v = await call(boot, "POST", "/v1/verify_otp", { email, otp: OTP, terms_and_policy_accepted: true, ...dev }, "2.30.292"); console.log("verify_otp (terms)", v.s, v.t.slice(0, 200)); }
const vTok = v.j?.access_token ? b64(`agribid_web_key:agribid_web_secret:${v.j.access_token}`) : "";
if (vTok) { const su = await call(vTok, "POST", "/v1/vendor_signup", { email, name: "QA VO Vendor", firm_name: `${firm} Home`, city_id: 8, address: "QA Platform Street 1", terms_and_policy_accepted: true }, "2.30.292"); console.log("vendor_signup", su.s, su.t.slice(0, 200)); }
writeFileSync("/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e/probe-vendor.json", JSON.stringify({ email, firm, vcUuid, vTok: vTok ? "<kept in memory only>" : null }, null, 2));
// 3. what the prospect list says
const pr = await call(buyerTok, "GET", `/companies/all_vendors?tab=unverified&page=1&search=${encodeURIComponent(firm)}`, undefined, "1.0.0");
console.log("prospect row", (pr.j?.companies ?? []).filter((c: any) => c.name === firm).map((c: any) => ({ id: c.id, uuid: c.uuid, status: c.vendor_status ?? c.status })));
console.log(JSON.stringify({ vcUuid, email }));
