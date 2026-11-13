/**
 * BEFORE → AFTER for a targeted recompile (the procol-qa skill, build-automation.md step 6).
 *
 *   npx tsx scripts/gap-close-result.ts            reads data/gap-close/targets.json + before/ + the stored plans now
 *
 * For every recompiled case: its coverage before and after, and why (which theme's gaps went away, which stayed).
 * A case whose new compile was a fallback (the model did not answer) counts as unchanged — its old plan was kept.
 * Writes data/gap-close/result.md and result.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES } from "../src/checks/gapThemes.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const GC = join(ROOT, "data", "gap-close");
const targets = JSON.parse(readFileSync(join(GC, "targets.json"), "utf8")) as { why: Record<string, string[]>; before: Record<string, { coverage: string; gaps: string[] }> };
const themeOf = (g: string) => THEMES.find((t) => t.re.test(g))?.key ?? "other";
const rank: Record<string, number> = { none: 0, partial: 1, full: 2 };

const rows: Array<{ id: string; reason: string; before: string; after: string; gone: string[]; left: string[]; recompiled: boolean }> = [];
for (const [id, reasons] of Object.entries(targets.why)) {
  const f = join(ROOT, "data", "compiled-plans", "ui-text", `${id}.json`);
  if (!existsSync(f)) continue;
  const now = JSON.parse(readFileSync(f, "utf8")).meta;
  const was = targets.before[id];
  const recompiled = Date.parse(now.compiledAt) > Date.parse("2026-11-12T12:40:00Z");
  const bt = new Set<string>((was.gaps ?? []).map(themeOf));
  const at = new Set<string>(((now.gaps ?? []) as string[]).map(themeOf));
  rows.push({ id, reason: reasons.join(", "), before: was.coverage, after: now.coverage, gone: [...bt].filter((t) => !at.has(t)), left: [...at], recompiled });
}
const done = rows.filter((r) => r.recompiled);
const count = (k: "before" | "after", v: string) => done.filter((r) => r[k] === v).length;
const up = done.filter((r) => rank[r.after] > rank[r.before]);
const down = done.filter((r) => rank[r.after] < rank[r.before]);
const gone: Record<string, number> = {};
for (const r of done) for (const t of r.gone) gone[t] = (gone[t] ?? 0) + 1;
const left: Record<string, number> = {};
for (const r of done) if (r.after !== "full") for (const t of r.left) left[t] = (left[t] ?? 0) + 1;

const md = [
  `# Gap closing — before → after (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`,
  "",
  `${done.length} of ${rows.length} targeted cases recompiled.`,
  "",
  `| | full | partial | none |`,
  `|---|---|---|---|`,
  `| before | ${count("before", "full")} | ${count("before", "partial")} | ${count("before", "none")} |`,
  `| after | ${count("after", "full")} | ${count("after", "partial")} | ${count("after", "none")} |`,
  "",
  `Moved up: ${up.length} (${up.filter((r) => r.after === "full").length} now full; ${up.filter((r) => r.before === "none").length} were not runnable at all). Moved down: ${down.length}.`,
  "",
  "Gap kinds that went away (cases): " + Object.entries(gone).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "),
  "",
  "What still holds the not-full ones back (cases): " + Object.entries(left).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "),
  "",
  down.length ? `## Moved down — read these\n\n${down.map((r) => `- ${r.id}: ${r.before} → ${r.after} (${r.left.join(", ")})`).join("\n")}` : "",
].join("\n");
writeFileSync(join(GC, "result.md"), md);
writeFileSync(join(GC, "result.json"), JSON.stringify({ rows }, null, 1));
console.log(md);
