/**
 * Crawl the main event screens once and record every control name the product really shows,
 * so the UI compiler names buttons, tabs, menu items, fields and columns the way the product
 * does instead of guessing (guessed names were the second-largest cause of "couldn't tell").
 *
 * For each target: build the starting state through the API (QA vendors only, one state per
 * kind, reused), open the screen through the normal plan runner with UI_CRAWL_OUT set — the
 * plan test then writes every visible control name (tests/plan.spec.ts) — and merge the names
 * into procol-ui-tests/src/plan/generic/knownLabels.json under that screen.
 * Read-only on the screens: it only opens them (and the Settings menu).
 *
 *   npx tsx scripts/crawl-screens.ts [--c 198678] [--only summary,proposal]
 */
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { buildUiState } = await import("../src/ui/uiSetup.js");
const { runUiPlan } = await import("../src/ui/uiFlowRunner.js");

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const COMPANY = Number(arg("c") ?? 198678);
const ONLY = arg("only")?.split(",").map((s) => s.trim());
const LABELS = join(here, "..", "..", "procol-ui-tests", "src", "plan", "generic", "knownLabels.json");
const OUT = join(here, "..", "..", "procol-ui-tests", ".plans", `crawl-${Date.now()}.jsonl`);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

type Target = { screen: string; state: "none" | "upcoming" | "live" | "bid" | "proposal"; technical?: boolean; steps: Array<Record<string, unknown>> };
const TARGETS: Target[] = [
  { screen: "create_erfx", state: "none", steps: [{ step: "open_create", args: { path: "erfx" } }] },
  { screen: "create_erfx_sheet", state: "none", steps: [{ step: "open_create", args: { path: "erfx" } }, { step: "set_title", args: { title: "QA_Platform_crawl" } }, { step: "select_template", args: {} }, { step: "add_line_items", args: { count: 1 } }] },
  { screen: "create_single", state: "none", steps: [{ step: "open_create", args: { path: "single-stage" } }, { step: "configure_single_stage", args: { eventType: "rfq" } }, { step: "select_template", args: {} }] },
  { screen: "create_single_auction", state: "none", steps: [{ step: "open_create", args: { path: "single-stage" } }, { step: "configure_single_stage", args: { eventType: "auction", auctionSubtype: "traffic_light", awarding: "lot" } }] },
  { screen: "summary", state: "live", steps: [{ step: "open_prepared", args: { screen: "summary" } }] },
  { screen: "event_settings", state: "live", steps: [{ step: "open_prepared", args: { screen: "summary" } }, { step: "open_event_settings", args: {} }] },
  { screen: "event_settings_upcoming", state: "upcoming", steps: [{ step: "open_prepared", args: { screen: "summary" } }, { step: "open_event_settings", args: {} }] },
  { screen: "participants", state: "live", steps: [{ step: "open_prepared", args: { screen: "participants" } }] },
  { screen: "overview", state: "live", steps: [{ step: "open_prepared", args: { screen: "overview" } }] },
  { screen: "responses", state: "bid", steps: [{ step: "open_prepared", args: { screen: "responses" } }] },
  { screen: "master_qcs", state: "bid", steps: [{ step: "open_prepared", args: { screen: "master_qcs" } }] },
  { screen: "proposal", state: "proposal", steps: [{ step: "open_prepared", args: { screen: "proposal" } }] },
];

const states = new Map<string, any>();
async function contextFor(state: Target["state"]): Promise<any | undefined> {
  if (state === "none") return undefined;
  if (states.has(state)) return states.get(state);
  log(`building the ${state} state through the API…`);
  const b: any = await buildUiState(COMPANY, state as any, {});
  if (!b.ok || !b.context) {
    log(`  could not build ${state}: ${b.why}`);
    states.set(state, null);
    return null;
  }
  const x = b.context;
  const ctx = { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values };
  states.set(state, ctx);
  return ctx;
}

function runPlan(plan: unknown): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code);
    };
    const { stop } = runUiPlan({ plan, companyId: COMPANY, runId: `crawl-${Date.now().toString(36)}`, headed: false }, (e: any) => {
      if (e.type === "log" && /\[plan\]/.test(e.line ?? "")) log(`   ${String(e.line).trim().slice(0, 150)}`);
      if (e.type === "done" || e.type === "run-error") finish(e.exitCode ?? null);
    });
    const timer = setTimeout(() => {
      try {
        stop();
      } catch {
        /* gone */
      }
      finish(null);
    }, 6 * 60_000);
  });
}

process.env.UI_CRAWL_OUT = OUT;
const found: Record<string, Array<{ kind: string; text: string }>> = {};
for (const t of TARGETS) {
  if (ONLY && !ONLY.includes(t.screen)) continue;
  const ctx = await contextFor(t.state);
  if (ctx === null) continue;
  log(`── ${t.screen} (${t.state})`);
  const before = existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).length : 0;
  await runPlan({ title: `crawl ${t.screen}`, steps: t.steps, ...(ctx ? { context: ctx } : {}) });
  const lines = existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean) : [];
  const fresh = lines.slice(before).map((l) => JSON.parse(l));
  const names = fresh.flatMap((f) => f.names ?? []);
  found[t.screen] = names;
  log(`   ${names.length} control name(s) recorded`);
}

// Merge into the compiler's known labels (screen-tagged; never removes anything).
const doc = JSON.parse(readFileSync(LABELS, "utf8"));
const list: any[] = Array.isArray(doc) ? doc : doc.labels;
const have = new Set(list.map((l) => `${l.screen}|${String(l.text).toLowerCase()}`));
let added = 0;
for (const [screen, names] of Object.entries(found)) {
  for (const n of names) {
    // the label list is committed: never keep anything that could be a person's data or a
    // run's own record (emails, long numbers such as phones / ids, our test event titles)
    if (/@|\d{5,}|QA_Platform|UI_Plan|API_Test|API_Journey|RFX-\d|RFQ-\d|RFP-\d|RA-\d/.test(n.text)) continue;
    // nor a time or date shown on screen (a schedule button reads "Now - 03:06 pm, 5th Oct") —
    // it is that moment's data, not a control's name
    if (/\d{1,2}:\d{2}\s*(am|pm)?|\b\d{1,2}(st|nd|rd|th)\s+[A-Z][a-z]{2}\b/i.test(n.text)) continue;
    const k = `${screen}|${n.text.toLowerCase()}`;
    if (have.has(k)) continue;
    have.add(k);
    list.push({ screen, kind: n.kind, text: n.text, source: `live crawl ${new Date().toISOString().slice(0, 10)} (client ${COMPANY})` });
    added++;
  }
}
writeFileSync(LABELS, JSON.stringify(doc, null, 2));
log(`merged ${added} new label(s) into knownLabels.json (now ${list.length})`);
try {
  unlinkSync(OUT);
} catch {
  /* keep */
}
process.exit(0);
