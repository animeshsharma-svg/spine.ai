// Run the 66 stress prompts through spine.ai exactly as Run tests → UI does (GET /api/plan-run),
// one at a time, and keep what the platform said about each: the compiled plan's coverage and
// gaps, whether the explorer took over, the run id, how it ended. score.py then checks each run
// against cases.json and Procol's own data.
//
//   node run.mjs --server http://127.0.0.1:4310 [--ids A01,B24] [--out runs/<tag>] [--budget 60]
//
// One case at a time on purpose: every run signs in to PROCOL DEMO with an OTP read from the
// database, and two sign-ins at once could take each other's codes.
// A finished case is skipped on a re-run of the same --out, so a stopped run can be resumed.
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const server = arg("server", "http://127.0.0.1:4310");
const out = join(HERE, arg("out", `runs/${new Date().toISOString().slice(0, 10)}`));
const budget = Number(arg("budget", 60));
const caseTimeoutMs = 75 * 60_000;
const company = 198678; // PROCOL DEMO

let cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")).cases;
if (arg("ids")) { const want = new Set(arg("ids").split(",")); cases = cases.filter((c) => want.has(c.id)); }
mkdirSync(out, { recursive: true });

/** This Slingring key's spend this week (USD), so the run stops before it eats the shared budget. */
async function spend() {
  const env = readFileSync(join(HERE, "..", "..", "prototype", ".env"), "utf8");
  const key = env.match(/^SLINGRING_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim();
  const base = env.match(/^SLINGRING_BASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? "http://slingring.procol.tech";
  try {
    const info = await (await fetch(`${base}/key/info`, { headers: { authorization: `Bearer ${key}` } })).json();
    const user = await (await fetch(`${base}/user/info?user_id=${info.info.user_id}`, { headers: { authorization: `Bearer ${key}` } })).json();
    return Number(user.user_info.spend);
  } catch {
    return NaN;
  }
}

/** One case through the platform's own endpoint; resolves with what the stream said. */
function runCase(c) {
  return new Promise((resolve) => {
    const rec = { id: c.id, prompt: c.prompt, startedAt: new Date().toISOString(), runId: null, plan: null, explore: null, blocked: null, notes: [], stages: [], verdicts: null, done: null, error: null };
    const u = new URL("/api/plan-run", server);
    u.searchParams.set("q", c.prompt);
    u.searchParams.set("c", String(company));
    u.searchParams.set("headed", "0");
    const req = http.get(u, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.*)$/m)?.[1];
          if (!ev || raw === undefined || ev === "frame" || ev === "log" || ev === "ping") continue;
          let d;
          try { d = JSON.parse(raw); } catch { continue; }
          if (ev === "stage") { rec.stages.push(d.name); if (d.runId) rec.runId = d.runId; }
          else if (ev === "plan") rec.plan = { title: d.title, steps: (d.steps ?? []).map((s) => s.step), source: d.source, coverage: d.coverage, gaps: d.gaps, warnings: d.warnings };
          else if (ev === "explore") { rec.explore = { why: d.why }; rec.runId = d.runId; }
          else if (ev === "blocked") rec.blocked = { reason: d.reason };
          else if (ev === "note") rec.notes.push(d.line);
          else if (ev === "verdicts") rec.verdicts = d.verdicts;
          else if (ev === "done") rec.done = { exitCode: d.exitCode, notRun: !!d.notRun };
          else if (ev === "run-error") rec.error = d.line ?? JSON.stringify(d).slice(0, 300);
        }
      });
      res.on("end", () => resolve(rec));
      res.on("error", (e) => { rec.error ||= `stream: ${e.message}`; resolve(rec); });
    });
    req.on("error", (e) => { rec.error ||= `request: ${e.message}`; resolve(rec); });
    req.setTimeout(caseTimeoutMs, () => { rec.error ||= `no end after ${caseTimeoutMs / 60000} min`; req.destroy(); });
  });
}

const spend0 = await spend();
console.log(`stress eval · ${cases.length} case(s) · ${server} · out ${out} · Slingring spend at start $${spend0.toFixed(2)} (stop at +$${budget})`);
for (const [i, c] of cases.entries()) {
  const file = join(out, `${c.id}.json`);
  if (existsSync(file)) { console.log(`[${i + 1}/${cases.length}] ${c.id} · already done, skipped`); continue; }
  const now = await spend();
  if (now - spend0 > budget) { console.log(`STOPPED: this run has spent $${(now - spend0).toFixed(2)}, over the $${budget} limit`); break; }
  const t0 = Date.now();
  const rec = await runCase(c);
  rec.endedAt = new Date().toISOString();
  rec.ms = Date.now() - t0;
  rec.spendAfter = await spend();
  writeFileSync(file, JSON.stringify(rec, null, 1));
  const how = rec.error ? `error: ${rec.error.slice(0, 90)}` : rec.blocked ? `blocked: ${rec.blocked.reason.slice(0, 90)}` : rec.done?.notRun ? "not run (no steps)" : `exit ${rec.done?.exitCode ?? "?"}`;
  console.log(`[${i + 1}/${cases.length}] ${c.id} · ${Math.round(rec.ms / 1000)} s · ${rec.explore ? "explorer" : `plan ${rec.plan?.coverage ?? "?"}`} · ${how} · run ${rec.runId ?? "-"} · spend +$${(rec.spendAfter - spend0).toFixed(2)}`);
}
console.log("done");
