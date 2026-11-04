// Refresh the DLF UAT session (.auth/dlf.json) with the tester-provided phone + login code. Never prints secrets.
import { readFileSync, writeFileSync } from "node:fs";
const F = "/Users/animesh/Desktop/procol/procol-ui-tests/.auth/dlf.json";
const cfg = JSON.parse(readFileSync(F, "utf8"));
const [key, sec] = Buffer.from(cfg.accessTokenHeader, "base64").toString().split(":");
const meta: any = await fetch(cfg.webUrl + "/meta.json").then((r) => r.json()).catch(() => ({}));
const h = { "access-token": Buffer.from(`${key}:${sec}`).toString("base64"), "app-version": meta.version || "9.4.377", "Content-Type": "application/json" };
const g = await fetch(cfg.apiUrl + "/v1/generate_otp", { method: "POST", headers: h, body: JSON.stringify({ phone: cfg.loginPhone, phone_prefix: "+91" }) });
console.log("generate_otp", g.status);
for (const extra of [{}, { terms_and_policy_accepted: true }]) {
  const v = await fetch(cfg.apiUrl + "/v1/verify_otp", { method: "POST", headers: h, body: JSON.stringify({ phone: cfg.loginPhone, phone_prefix: "+91", otp: cfg.loginCode, push_token: null, device_info: { browser: "Chrome", os: "macOS" }, device_id: `qa-${Date.now()}`, ...extra }) });
  const t = await v.text(); let j: any = {}; try { j = JSON.parse(t); } catch {}
  if (j.access_token) { cfg.accessTokenHeader = Buffer.from(`${key}:${sec}:${j.access_token}`).toString("base64"); writeFileSync(F, JSON.stringify(cfg, null, 2)); console.log("signed in:", (j.user?.first_name || "").slice(0, 4) + "…", "role", j.user?.role); process.exit(0); }
  console.log("verify_otp", v.status, String(j.error?.code ?? ""), String(j.error?.message ?? "").slice(0, 80));
  if (!/705|terms/i.test(t)) break;
}
process.exit(1);
