// Run the API cases (cases.json here) through spine.ai's API path, one at a time, and keep every event the
// stream sent: node run_api.mjs [--server http://127.0.0.1:4310] [--ids A,B] [--out runs/<tag>]
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const server = arg("server", "http://127.0.0.1:4310");
const out = join(HERE, arg("out", `runs/${new Date().toISOString().slice(0, 10)}`));
let cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")).cases;
if (arg("ids")) { const want = new Set(arg("ids").split(",")); cases = cases.filter((c) => want.has(c.id)); }
mkdirSync(out, { recursive: true });
function runCase(c) {
  return new Promise((resolve) => {
    const rec = { id: c.id, text: c.text, expect: c.expect, startedAt: new Date().toISOString(), lines: [], checks: [], done: null, fatal: null };
    const u = new URL("/api/run-case-api", server);
    u.searchParams.set("c", "198678");
    u.searchParams.set("text", c.text);
    const started = Date.now();
    const req = http.get(u, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.*)$/m)?.[1];
          if (!ev || !raw) continue;
          let d; try { d = JSON.parse(raw); } catch { continue; }
          if (ev === "line") rec.lines.push(d.line);
          else if (ev === "check") rec.checks.push(d.check);
          else if (ev === "done") rec.done = d;
          else if (ev === "fatal") rec.fatal = d.message;
        }
      });
      res.on("end", () => { rec.ms = Date.now() - started; resolve(rec); });
    });
    req.on("error", (e) => { rec.fatal = e.message; rec.ms = Date.now() - started; resolve(rec); });
    req.setTimeout(20 * 60_000, () => req.destroy(new Error("timed out after 20 min")));
  });
}
console.log(`api cases · ${cases.length} · ${server} · out ${out}`);
for (const [k, c] of cases.entries()) {
  const file = join(out, `${c.id}.json`);
  if (existsSync(file)) { console.log(`[${k + 1}/${cases.length}] ${c.id} · already run`); continue; }
  const rec = await runCase(c);
  writeFileSync(file, JSON.stringify(rec, null, 1));
  const main = rec.checks[0];
  console.log(`[${k + 1}/${cases.length}] ${c.id} · ${Math.round(rec.ms / 1000)} s · ${rec.fatal ? `fatal: ${rec.fatal}` : main ? `${main.pass ? "PASS" : main.inconclusive ? "COULDN'T TELL" : "FAIL"} · ${main.inputSummary ?? ""} → ${main.httpStatus ?? "-"} · ${(main.verdict ?? "").slice(0, 120)}` : "no check"}`);
}
