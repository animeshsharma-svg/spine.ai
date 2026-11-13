/**
 * WHERE THE AUTOMATION FALLS SHORT, COUNTED — the first step of closing a gap (the procol-qa skill, "build").
 *
 *   npx tsx scripts/gap-census.ts                 sourcing-side cases (every family but the PRD roadmap)
 *   npx tsx scripts/gap-census.ts --all           every compiled text case, PRD roadmap included
 *   npx tsx scripts/gap-census.ts --theme labels  list the cases and gaps of one theme
 *   npx tsx scripts/gap-census.ts --compare data/gap-close/census-2026-11-12.json   before → after
 *   npx tsx scripts/gap-census.ts --dir ../other/data/compiled-plans/ui-text --out baseline.json   a baseline
 *
 * Reads the compiler's own verdicts (data/compiled-plans/ui-text/*.json: coverage full / partial / none and the
 * gaps it named) and sorts every gap into the capability that is missing. The themes are the kinds of fix the
 * skill knows (a label to confirm, a step's description, a new step, a start state, a setting, test data, an
 * identity…), so the biggest number is the next thing to build. Writes data/gap-close/census-<date>.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES } from "../src/checks/gapThemes.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const arg = (n: string) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : undefined);
// --dir: another checkout's stored plans (a baseline before a change)
const DIR = arg("dir") ?? join(ROOT, "data", "compiled-plans", "ui-text");
const ALL = process.argv.includes("--all");



interface Meta { caseId: string; coverage: "full" | "partial" | "none"; gaps?: string[]; state?: string; source?: string }
function load(): Meta[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")).meta as Meta);
}
const themeOf = (g: string) => THEMES.find((t) => t.re.test(g))?.key ?? "other";

const metas = load().filter((m) => ALL || !m.caseId.startsWith("PRD"));
const coverage: Record<string, number> = {};
const byFamily: Record<string, Record<string, number>> = {};
const themes: Record<string, { gaps: number; cases: Set<string>; only: Set<string> }> = {};
for (const m of metas) {
  coverage[m.coverage] = (coverage[m.coverage] ?? 0) + 1;
  const fam = m.caseId.split("-")[0];
  (byFamily[fam] ??= {})[m.coverage] = (byFamily[fam][m.coverage] ?? 0) + 1;
  const ts = (m.gaps ?? []).map(themeOf);
  for (const t of ts) {
    themes[t] ??= { gaps: 0, cases: new Set(), only: new Set() };
    themes[t].gaps++;
    themes[t].cases.add(m.caseId);
  }
  // cases this theme ALONE holds back: fixing it makes them full
  if (ts.length && new Set(ts).size === 1) themes[ts[0]].only.add(m.caseId);
}

const one = arg("theme");
if (one) {
  for (const m of metas) for (const g of m.gaps ?? []) if (themeOf(g) === one) console.log(`${m.caseId.padEnd(22)} ${m.coverage.padEnd(8)} ${g.slice(0, 150)}`);
  process.exit(0);
}

const rows = Object.entries(themes).sort((a, b) => b[1].cases.size - a[1].cases.size);
console.log(`${metas.length} compiled text cases${ALL ? "" : " (PRD roadmap left out; --all for every case)"} — coverage ${JSON.stringify(coverage)}`);
console.log(`families: ${Object.entries(byFamily).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(" · ")}`);
console.log("\ncases  gaps  alone  theme            → the fix");
for (const [k, v] of rows) console.log(`${String(v.cases.size).padStart(5)} ${String(v.gaps).padStart(5)} ${String(v.only.size).padStart(6)}  ${k.padEnd(16)} → ${THEMES.find((t) => t.key === k)?.fix ?? "read them: --theme other"}`);

const out = {
  at: new Date().toISOString(),
  scope: ALL ? "all" : "non-PRD",
  coverage,
  byFamily,
  themes: Object.fromEntries(rows.map(([k, v]) => [k, { cases: v.cases.size, gaps: v.gaps, alone: v.only.size }])),
};
mkdirSync(join(ROOT, "data", "gap-close"), { recursive: true });
const file = arg("out") ?? join(ROOT, "data", "gap-close", `census-${out.at.slice(0, 10)}${ALL ? "-all" : ""}.json`);
const cmp = arg("compare");
if (cmp && existsSync(cmp)) {
  const before = JSON.parse(readFileSync(cmp, "utf8"));
  console.log(`\nsince ${before.at.slice(0, 16)}: coverage ${JSON.stringify(before.coverage)} → ${JSON.stringify(coverage)}`);
  for (const [k, v] of rows) {
    const b = before.themes?.[k]?.cases ?? 0;
    if (b !== v.cases.size) console.log(`  ${k.padEnd(16)} ${b} → ${v.cases.size}`);
  }
} else writeFileSync(file, JSON.stringify(out, null, 1));
console.log(cmp ? "" : `\nwritten ${file}`);
