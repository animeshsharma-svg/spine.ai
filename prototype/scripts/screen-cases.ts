/**
 * Write test cases from screens: open each screen in its real state, take its inventory (every
 * control, its state, the screenshot), and draft cases grounded in the rules Procol's code
 * enforces there (src/agents/screenCases.ts). Drafts go to the review queue — none joins the
 * catalog until a person approves it. QA vendors only; it only opens screens.
 *
 *   npx tsx scripts/screen-cases.ts [--c 198678] [--only create-erfx,project-live] [--max 8]
 *   npx tsx scripts/screen-cases.ts --from <file.inventory.json>      # no browser
 *   flags: --no-save (print only)  --no-compile (skip the plan check)
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
// the fast tier answers a long screen prompt in 10-30 s; at the 4 s default it fell through to another provider
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { buildUiState } = await import("../src/ui/uiSetup.js");
const { runUiPlan } = await import("../src/ui/uiFlowRunner.js");
const { draftCasesFromScreen } = await import("../src/agents/screenCases.js");

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const COMPANY = Number(arg("c") ?? 198678);
const MAX = Number(arg("max") ?? 8);
const ONLY = arg("only")?.split(",").map((s) => s.trim());
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

type State = "none" | "live" | "bid" | "proposal" | "awarded" | "upcoming";
const TARGETS: Array<{ label: string; state: State; steps: Array<Record<string, unknown>> }> = [
  { label: "create-erfx", state: "none", steps: [{ step: "open_create", args: { path: "erfx" } }] },
  { label: "create-erfx-filled", state: "none", steps: [{ step: "open_create", args: { path: "erfx" } }, { step: "set_title" }, { step: "select_template" }, { step: "add_line_items", args: { count: 2 } }] },
  { label: "events-list", state: "none", steps: [{ step: "open_events_list" }] },
  { label: "project-live", state: "live", steps: [{ step: "open_prepared", args: { screen: "summary" } }] },
  { label: "participants-live", state: "live", steps: [{ step: "open_prepared", args: { screen: "participants" } }] },
  { label: "master-qcs-bid", state: "bid", steps: [{ step: "open_prepared", args: { screen: "master_qcs" } }] },
  { label: "proposal", state: "proposal", steps: [{ step: "open_prepared", args: { screen: "proposal" } }] },
];

const states = new Map<State, any>();
async function contextFor(state: State): Promise<any | undefined> {
  if (state === "none") return undefined;
  if (states.has(state)) return states.get(state);
  log(`building the ${state} state through the API…`);
  const b: any = await buildUiState(COMPANY, state as any, {});
  const x = b.ok ? b.context : null;
  const ctx = x ? { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values, buyerUserId: x.buyerUserId } : null;
  if (!ctx) log(`  could not build ${state}: ${b.why}`);
  states.set(state, ctx);
  return ctx;
}

/** Open a screen and take its inventory; returns the inventory file the run wrote. */
function inventoryOf(t: (typeof TARGETS)[number], context: any): Promise<string | null> {
  return new Promise((resolve) => {
    let file: string | null = null;
    const steps = [...t.steps, { step: "inventory_screen", args: { label: t.label } }];
    runUiPlan({ plan: { title: `inventory ${t.label}`, steps, ...(context ? { context } : {}) }, companyId: COMPANY, runId: `inv-${t.label}-${Date.now().toString(36)}`, headed: false }, (e: any) => {
      const line = String(e.line ?? "");
      const m = /\[inventory\]\s+(\S+\.inventory\.json)/.exec(line);
      if (m) file = m[1];
      if (e.type === "log" && /\[plan\] .*✗/.test(line)) log(`  ${line.trim().slice(0, 200)}`);
      if (e.type === "done" || e.type === "run-error") resolve(file);
    });
  });
}

const inventories: string[] = [];
const from = arg("from");
if (from) inventories.push(from);
else {
  for (const t of TARGETS.filter((x) => !ONLY || ONLY.includes(x.label))) {
    const ctx = await contextFor(t.state);
    if (t.state !== "none" && !ctx) continue;
    log(`opening ${t.label}…`);
    const f = await inventoryOf(t, ctx);
    if (f && existsSync(f)) {
      inventories.push(f);
      log(`  screenshot: ${f.replace(/\.inventory\.json$/, ".png")}`);
      log(`  inventory:  ${f}`);
    }
    else log(`  no inventory for ${t.label}`);
  }
}

const results: any[] = [];
const seen: Array<{ id: string; title: string }> = [];
for (const f of inventories) {
  const inv = JSON.parse(readFileSync(f, "utf8"));
  log(`${inv.label}: what it saw — ${inv.controls.map((c: any) => `${c.kind} "${c.name}"${c.disabled ? " (disabled)" : ""}`).slice(0, 40).join(", ")}${inv.controls.length > 40 ? ` … +${inv.controls.length - 40} more` : ""}`);
  const r = await draftCasesFromScreen(inv, { max: MAX, companyId: COMPANY, save: !flag("no-save"), compile: !flag("no-compile"), onLine: log, seen });
  results.push(r);
  log(`${r.screen}: ${r.controls} controls · ${r.rulesGiven} rules (${r.untestedRulesGiven} untested) · drafted ${r.drafted} → saved ${r.saved.length}, already covered ${r.alreadyCovered.length}, dropped ${r.dropped.length}`);
  for (const s of r.saved) log(`  + ${s.id} [${s.grounded}] ${s.title}${s.coverage && !flag("no-compile") ? ` — plan: ${s.coverage}${s.gaps?.length ? ` (${s.gaps.slice(0, 2).join("; ")})` : ""}` : ""}`);
  for (const c of r.alreadyCovered) log(`  = ${c.title} — already ${c.by}`);
  for (const d of r.dropped) log(`  − ${d.title} — ${d.why}`);
}
const outDir = join(here, "..", "data", "screen-cases");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ company: COMPANY, at: new Date().toISOString(), results }, null, 2));
log(`summary → ${out}`);
process.exit(0);
