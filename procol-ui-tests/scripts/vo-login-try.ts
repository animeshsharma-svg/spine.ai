import { readFileSync } from "node:fs";
const API = "https://sec-api.ag-ri.in/api";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
const boot = Buffer.from("agribid_web_key:agribid_web_secret").toString("base64");
const h = { "access-token": boot, "app-version": "2.30.292", "Content-Type": "application/json" };
for (const email of process.argv.slice(2)) {
  const g = await fetch(API + "/v1/generate_otp", { method: "POST", headers: h, body: JSON.stringify({ email }) });
  const r = await fetch(API + "/v1/verify_otp", { method: "POST", headers: h, body: JSON.stringify({ email, otp: env.CLIENTA_OTP, device_info: { browser: "Chrome", os: "macOS" }, device_id: "qa-probe", push_token: null }) });
  const t = await r.text(); let j: any = {}; try { j = JSON.parse(t); } catch {}
  console.log(email, "generate", g.status, (await g.text()).slice(0, 60), "| verify", r.status, j.access_token ? "SIGNED IN as " + (j.user?.company?.name ?? "?") : t.slice(0, 100));
}
