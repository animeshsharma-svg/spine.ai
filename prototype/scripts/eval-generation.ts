/**
 * A12 — THE GENERATION EVAL (guided session plan §10, Fri 20 Nov 2026).
 *
 * How close do the cases the session writes from a PRD come to the cases a tester wrote by hand from the same PRD?
 * For every hand-written case, the three generated cases nearest in meaning (embeddings) go to a judge, which says
 * which one (if any) checks the same thing — fully or partly. Out come:
 *   recall    the hand-written cases a generated case covers (full; full + partly), overall and by the sheet's test type
 *   beyond    generated cases no hand-written case matches (new coverage — or noise; the list is printed to judge)
 *   misses    the hand-written cases nothing covers (what generation still cannot see)
 * Nothing is written to the repo: the report goes to data/runs/evals/ (git-ignored per-machine state) and stdout.
 *
 *   npx tsx scripts/eval-generation.ts --sheet gen-<session id> --gold ../test-cases/PR_Assignee_Filter_and_Notification_Test_Cases.xlsx [--tab "PR Assignee Test Cases"]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { sheetCases } from "../src/checks/sheetCases.js";
import { embedMany } from "../src/rag/embedder.js";
import { chat } from "../src/ai/llm.js";
import { jsonOf } from "../src/agents/deriveCases.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const sheet = arg("sheet");
const goldFile = arg("gold");
if (!sheet || !goldFile) { console.error("usage: --sheet gen-<session id> --gold <hand-written xlsx> [--tab <sheet tab>]"); process.exit(2); }

interface Row { id: string; title: string; type: string; steps: string; expected: string }
const wb = XLSX.read(readFileSync(goldFile), { type: "buffer" });
const tab = arg("tab") ?? wb.SheetNames.find((n) => /test cases/i.test(n)) ?? wb.SheetNames[0];
const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[tab], { defval: "" });
const col = (r: Record<string, unknown>, re: RegExp) => String(r[Object.keys(r).find((k) => re.test(k.trim())) ?? ""] ?? "").trim();
const gold: Row[] = raw.map((r) => ({ id: col(r, /^test case id$/i), title: col(r, /^test case title$|^title$/i), type: col(r, /^test type$/i) || "-", steps: col(r, /^test steps$|^steps$/i), expected: col(r, /^expected/i) }))
  .filter((r) => r.id && r.title);
const gen: Row[] = sheetCases(sheet).map((c) => ({ id: c.id, title: c.title, type: c.testType ?? "-", steps: Array.isArray(c.steps) ? c.steps.join(" ") : String(c.steps ?? ""), expected: c.expected ?? "" }));
if (!gold.length || !gen.length) { console.error(`nothing to compare: ${gold.length} hand-written (tab "${tab}"), ${gen.length} generated (sheet ${sheet})`); process.exit(1); }

const text = (r: Row) => `${r.title}. Steps: ${r.steps.slice(0, 600)}. Expected: ${r.expected.slice(0, 400)}`;
const t0 = Date.now();
const [gv, nv] = [await embedMany(gold.map(text)), await embedMany(gen.map(text))];
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y || 1); };

const JUDGE = `You compare test cases for the same feature. Case H was written by a human tester. Candidates G1..G3 were generated.
Say which candidate checks the SAME behaviour as H: same action under the same condition, and the same thing verified. Wording, order and test data may differ.
"full" = the candidate checks everything H checks. "partly" = it checks the core of H but misses a condition or a check H has. "none" = no candidate checks H's behaviour.
Answer JSON only: {"match":"G1|G2|G3|none","degree":"full|partly|none","why":"one short sentence"}`;

type Verdict = { gold: Row; match?: Row; degree: "full" | "partly" | "none"; why: string; sim: number };
const verdicts: Verdict[] = [];
const matchedGen = new Set<string>();
let i = 0;
for (const g of gold) {
  const near = gen.map((n, k) => ({ n, s: cos(gv[i], nv[k]) })).sort((a, b) => b.s - a.s).slice(0, 3);
  i++;
  const user = `H: ${text(g)}\n\n${near.map((x, k) => `G${k + 1}: ${text(x.n)}`).join("\n\n")}`;
  const out = jsonOf(await chat([{ role: "system", content: JUDGE }, { role: "user", content: user }], { tier: "fast", temperature: 0, maxTokens: 300 }).catch(() => "")) as { match?: string; degree?: string; why?: string } | null;
  const k = Number(String(out?.match ?? "").replace(/\D/g, "")) - 1;
  const degree = (out?.degree === "full" || out?.degree === "partly") && near[k] ? out.degree : "none";
  const match = degree !== "none" ? near[k].n : undefined;
  if (match) matchedGen.add(match.id);
  verdicts.push({ gold: g, match, degree, why: String(out?.why ?? "the judge gave no answer"), sim: near[0]?.s ?? 0 });
  process.stdout.write(degree === "full" ? "●" : degree === "partly" ? "◐" : "○");
}
process.stdout.write("\n");

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");
const full = verdicts.filter((v) => v.degree === "full").length;
const partly = verdicts.filter((v) => v.degree === "partly").length;
const byType = new Map<string, Verdict[]>();
for (const v of verdicts) byType.set(v.gold.type, [...(byType.get(v.gold.type) ?? []), v]);
const beyond = gen.filter((n) => !matchedGen.has(n.id));
const lines = [
  `# Generation eval (A12) — ${sheet} vs ${goldFile.split("/").pop()} (${new Date().toISOString().slice(0, 16)} UTC)`,
  "",
  `Hand-written: ${gold.length} (tab "${tab}"). Generated: ${gen.length}. Judge: Slingring fast tier over the 3 nearest generated cases by meaning. ${Math.round((Date.now() - t0) / 1000)} s.`,
  "",
  `**Recall** — covered fully: ${full}/${gold.length} (${pct(full, gold.length)}); fully or partly: ${full + partly}/${gold.length} (${pct(full + partly, gold.length)}).`,
  `**Beyond the hand-written sheet** — generated cases no hand-written case matches: ${beyond.length}/${gen.length} (${pct(beyond.length, gen.length)}).`,
  "",
  "| Hand-written test type | Cases | Full | Full or partly |",
  "|---|---|---|---|",
  ...[...byType.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, vs]) => `| ${t} | ${vs.length} | ${pct(vs.filter((v) => v.degree === "full").length, vs.length)} | ${pct(vs.filter((v) => v.degree !== "none").length, vs.length)} |`),
  "",
  "## Misses — hand-written cases nothing generated covers",
  ...verdicts.filter((v) => v.degree === "none").map((v) => `- ${v.gold.id} (${v.gold.type}) ${v.gold.title} — nearest similarity ${v.sim.toFixed(2)}; ${v.why}`),
  "",
  "## Partly covered",
  ...verdicts.filter((v) => v.degree === "partly").map((v) => `- ${v.gold.id} ${v.gold.title} ← ${v.match!.id} ${v.match!.title} — ${v.why}`),
  "",
  "## Generated, beyond the hand-written sheet",
  ...beyond.map((n) => `- ${n.id} (${n.type}) ${n.title}`),
];
const dir = join(ROOT, "data", "runs", "evals");
mkdirSync(dir, { recursive: true });
const file = join(dir, `generation-${sheet}-${Date.now()}.md`);
writeFileSync(file, lines.join("\n") + "\n");
writeFileSync(file.replace(/\.md$/, ".json"), JSON.stringify({ sheet, gold: goldFile, tab, counts: { gold: gold.length, generated: gen.length, full, partly, beyond: beyond.length }, verdicts: verdicts.map((v) => ({ gold: v.gold.id, type: v.gold.type, degree: v.degree, match: v.match?.id ?? null, sim: v.sim, why: v.why })) }, null, 1));
console.log(lines.slice(0, 12 + byType.size).join("\n"));
console.log(`\nreport: ${file}`);
process.exit(0);
