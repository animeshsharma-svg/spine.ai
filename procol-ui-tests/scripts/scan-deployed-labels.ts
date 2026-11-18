/**
 * Every UI string in the DEPLOYED buyer app, for the label guard (18 Nov 2026).
 *
 * scan-dashboard-labels.ts reads procol-client-dashboard at a fixed ref; a feature that is live on UAT but newer than
 * that ref (In-Principle Approval, PR #6319, still open on GitHub, deployed 13 Nov) has none of its words there, so
 * the compiler's labels for it read as guesses. This reads what the app really serves: the entry bundle and every
 * lazy chunk it names, string literals that look like words a person reads. Only the strings the source scan does
 * not already have are kept.
 *
 *   npx tsx scripts/scan-deployed-labels.ts [--host https://cpanel.ag-ri.in]
 *
 * Output: src/plan/generic/deployedLabels.json — dump-plan-catalog publishes them with the source labels.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "plan", "generic", "deployedLabels.json");
const SOURCE = join(here, "..", "src", "plan", "generic", "sourceLabels.json");
const i = process.argv.indexOf("--host");
const host = (i >= 0 ? process.argv[i + 1] : "https://cpanel.ag-ri.in").replace(/\/$/, "");

const html = await (await fetch(`${host}/login`)).text();
const entry = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], host).href);
if (!entry.length) throw new Error(`no script tag on ${host}/login`);
const seen = new Set<string>();
const queue = [...entry];
const texts = new Map<string, number>();
// A word a person reads: letters, spaces and light punctuation; no code, no paths, no class names.
const LOOKS_UI = /^(?=.*[A-Za-z]{2})[A-Za-z0-9₹%&()'’·…,.:;!?\-–— /+]{2,140}$/;
const CODE = /^[a-z]+[A-Z]|[_{}<>=\\`$]|^\/|https?:|\.(js|css|svg|png)$|^[a-z-]+$|^[A-Z_]+$/;

while (queue.length) {
  const url = queue.shift()!;
  if (seen.has(url)) continue;
  seen.add(url);
  const js = await (await fetch(url)).text();
  for (const m of js.matchAll(/["'`](assets\/[A-Za-z0-9_.-]+\.js)["'`]/g)) queue.push(new URL(`/${m[1]}`, host).href);
  // One pass per quote kind: a combined pattern drifts out of step after an apostrophe inside a "…" string
  // ("You don't have permission…") and then reads code as text.
  // Each literal is anchored to the code around it — a value after ":", "(", ",", "=", "?" … and followed by ",", ")",
  // "}" … — so one stray quote early in a file cannot shift every later pair onto the code between strings.
  const before = String.raw`(?<=[:,(=?\[{|&!+]\s*)`;
  const after = String.raw`(?=\s*[,)}\];:?+|&])`;
  for (const re of [
    new RegExp(`${before}"((?:[^"\\\\\\n]|\\\\.){2,140})"${after}`, "g"),
    new RegExp(`${before}'((?:[^'\\\\\\n]|\\\\.){2,140})'${after}`, "g"),
    new RegExp(`${before}\`([^\`$\\\\\\n]{2,140})\`${after}`, "g"),
  ]) {
    for (const m of js.matchAll(re)) {
      const t = m[1].replace(/\\u00b7/gi, "·").replace(/\\u2026/gi, "…").replace(/\\u2014/gi, "—").replace(/\\(["'])/g, "$1").trim();
      if (!LOOKS_UI.test(t) || CODE.test(t) || !/[A-Z]/.test(t[0] ?? "")) continue;
      texts.set(t, (texts.get(t) ?? 0) + 1);
    }
  }
}

const known = new Set<string>(
  existsSync(SOURCE) ? (JSON.parse(readFileSync(SOURCE, "utf8")).labels as Array<{ text: string }>).map((l) => l.text) : [],
);
const fresh = [...texts.keys()].filter((t) => !known.has(t)).sort();
writeFileSync(
  OUT,
  JSON.stringify({ source: "deployed buyer app (served JavaScript)", host, files: seen.size, collectedAt: new Date().toISOString(), labels: fresh.map((text) => ({ text })) }, null, 1),
);
console.log(`${seen.size} script files read on ${host}; ${texts.size} UI strings, ${fresh.length} not in the source scan → ${OUT}`);
for (const t of fresh.filter((x) => /principle|price recover|rfq 2|locked/i.test(x)).slice(0, 40)) console.log("  ·", t);
