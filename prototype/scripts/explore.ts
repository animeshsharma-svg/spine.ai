/**
 * Explore a page from the terminal: spine.ai opens it, writes tests from what is on it, asks you
 * whenever it needs a person, runs the tests and saves a report (src/agents/explorer.ts).
 *
 *   npx tsx scripts/explore.ts "<console URL or /path>" [--c 198678] [--max 6]
 *   --auto   answer every question with a safe default (for checking the loop without a person)
 *
 * Reports: data/explore-runs/<id>.json (also GET /api/explore/run?id=… on the dashboard).
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { startExplore, subscribe, answer, getSession } = await import("../src/agents/explorer.js");

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.log('usage: npx tsx scripts/explore.ts "<console URL or /path>" [--c 198678] [--max 6] [--auto]');
  process.exit(1);
}
const AUTO = process.argv.includes("--auto");
const t = () => new Date().toISOString().slice(11, 19);
const rl = AUTO ? null : createInterface({ input: process.stdin, output: process.stdout });

const r = startExplore({ url, companyId: Number(arg("c") ?? 198678), max: Number(arg("max") ?? 6) });
if (!r.id) {
  console.log(`cannot explore: ${r.why}`);
  process.exit(1);
}
const id = r.id;
console.log(`[${t()}] session ${id}`);

await new Promise<void>((resolve) => {
  subscribe(id, async (event: string, data: any) => {
    switch (event) {
      case "start":
      case "info":
        console.log(`[${t()}] ${data.text ?? `exploring ${data.path}`}`);
        break;
      case "progress":
        console.log(`[${t()}]   · ${data.line}`);
        break;
      case "screen":
        console.log(`[${t()}] opened ${data.path} — ${data.controls} controls`);
        if (data.screenshot) console.log(`           screenshot: ${data.screenshot}`);
        console.log(`           saw: ${data.sample.slice(0, 14).join(", ")}${data.controls > 14 ? " …" : ""}`);
        break;
      case "cases":
        console.log(`[${t()}] wrote ${data.cases.length} case(s):`);
        for (const c of data.cases) console.log(`   ${c.n}. ${c.title}  [${c.grounded}] · ${c.coverage}`);
        for (const c of data.alreadyCovered ?? []) console.log(`   = ${c.title} — already ${c.by}`);
        break;
      case "question": {
        console.log(`\n[${t()}] ❓ ${data.text}`);
        if (data.screenshot) console.log(`   screenshot: ${data.screenshot}`);
        (data.options ?? []).forEach((o: string, i: number) => console.log(`   ${data.kind === "choose" ? "" : `[${i + 1}] `}${o}`));
        const hint = data.kind === "choose" ? 'numbers (e.g. "1 3"), "all" or "stop"' : data.kind === "one" ? "a number, or type your own answer" : "type your answer";
        let a: string;
        if (AUTO) {
          a = data.kind === "choose" ? "1" : data.kind === "one" ? (data.options?.includes("Skip") ? "Skip" : "Stop") : "skip";
          console.log(`   (auto) ${a}`);
        } else {
          a = (await rl!.question(`   your answer (${hint}): `)).trim();
          const pick = Number(a);
          if (data.kind === "one" && Number.isInteger(pick) && data.options?.[pick - 1]) a = data.options[pick - 1];
        }
        const res = answer(id, data.id, a || "skip");
        if (!res.ok) console.log(`   (not taken: ${res.why})`);
        break;
      }
      case "running":
        console.log(`\n[${t()}] ▶ running ${data.n}. ${data.title}`);
        break;
      case "case":
        console.log(`[${t()}] ${data.verdict === "worked" ? "✓" : data.verdict === "partly" ? "◐" : data.verdict === "broken" ? "✗" : "–"} ${data.verdict === "partly" ? "partly checked" : data.verdict.replace("_", " ")}: ${data.title}${data.why ? ` — ${data.why}` : ""}`);
        break;
      case "failed":
        console.log(`[${t()}] stopped: ${data.why}`);
        resolve();
        break;
      case "done":
        console.log(`\n[${t()}] ${data.status} — ${data.summary.worked} worked · ${data.summary.partly} partly checked · ${data.summary.broken} broken · ${data.summary.notChecked} not checked · ${data.summary.skipped} skipped · ${data.summary.questions} question(s)`);
        resolve();
        break;
    }
  });
});

const s = getSession(id);
console.log(`report: ${join(here, "..", "data", "explore-runs", `${id}.json`)}`);
for (const c of s?.cases ?? []) {
  console.log(`  ${c.n}. ${c.verdict.padEnd(11)} ${c.title}`);
  for (const st of c.run?.steps ?? []) console.log(`       ${st.status === "ok" ? "✓" : st.status === "failed" ? "✗" : "·"} ${st.step}${st.detail ? ` — ${String(st.detail).slice(0, 110)}` : ""}`);
}
rl?.close();
process.exit(0);
