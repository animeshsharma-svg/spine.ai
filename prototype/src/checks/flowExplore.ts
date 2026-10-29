/**
 * EXPLORE THE IMPORTANT FLOWS — "what happens if I click this?", with the company's settings as they are and switched.
 *
 * For each flow (the create screens, a live / bid-in / closed RFQ, Master QCS, the award proposal …) the agent builds
 * the starting event through the API, opens the screen and runs the probe step (procol-ui-tests/src/plan/probe.ts):
 * every control and every item of the Settings / ⋮ / Actions menus is clicked on a freshly reloaded screen and what
 * the app did is recorded (dialog, menu, page, message, greyed out + tooltip, error, nothing). Then, for each company
 * setting that decides something on that screen, the setting is switched (PROCOL DEMO only, switched back after —
 * companySettings.withSettings) and the screen is listed again; whatever appears, disappears or greys out is clicked.
 *
 * Every observation becomes a test case in the house style with its "Configs Needed" filled, and anything that looks
 * wrong (an error, a click that does nothing, a setting that changes nothing it says it does, odd numbers) becomes a
 * QUESTION for the tester instead of a guessed expected result.
 *
 * Writes data/flow-explore/<flow>.json (raw), docs/test-cases/explored/Procol-Explored-Flows.xlsx and questions.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { BUYER_LOGIN, SHEET_COLUMNS, formatConfigs, type ConfigNeed, type SheetRow } from "../agents/caseStyle.js";
import { contextForPlan } from "../ui/prepareForPlan.js";
import { readPlanResult, runUiPlan } from "../ui/uiFlowRunner.js";
import type { UiState } from "../ui/uiSetup.js";
import { chat } from "../ai/llm.js";
import { STYLE_GUIDE } from "../agents/caseStyle.js";
import { currentValue, settingBlockers, settingsCatalog, withSettings } from "./companySettings.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const UI = join(PROTO, "..", "procol-ui-tests");
const RAW = join(PROTO, "data", "flow-explore");
const OUT = join(PROTO, "..", "docs", "test-cases", "explored");

type Step = { step: string; args?: Record<string, unknown> };
interface Probe { within?: string; max?: number; skip?: string[] }
export interface FlowDef {
  key: string;
  name: string;
  /** the starting state the API builds ("none" = start from nothing) */
  state: UiState;
  technical?: boolean;
  auction?: boolean;
  /** the steps that reach the screen (first is open_prepared for a built state) */
  start: Step[];
  /** how a person reaches it, after logging in */
  reach: string[];
  pre: string;
  probes: Probe[];
  /** company settings that decide something on this screen: each is switched to its other value and the screen listed again */
  settings: string[];
  /** settings the screen needs as they are (named in every case's Configs Needed) */
  needs?: ConfigNeed[];
}

const OPEN_EVENT = (tab: string) => [
  'From the left menu click "Events" and open the event (type its title in "Search Title" and click it)',
  ...(tab ? [`Click the RFQ stage tab, then its "${tab}" tab`] : []),
];
const ERFX: ConfigNeed = { key: "rfx_project_enabled", value: true, why: "turns on eRFX projects" };

export const FLOWS: FlowDef[] = [
  {
    key: "create-menu", name: "Events list and the Create Event menu", state: "none",
    start: [{ step: "open_prepared", args: { screen: "events_list" } }],
    reach: ['From the left menu click "Events"'], pre: "The buyer can create events on the test company.",
    probes: [{ max: 25, skip: ["Search"] }], settings: ["rfx_project_enabled", "boq_in_erfx_allowed", "scheduled_events_enabled"],
  },
  {
    key: "create-single", name: "Single stage create screen (RFQ with a product)", state: "none",
    start: [{ step: "open_create", args: { path: "single-stage" } }, { step: "configure_single_stage", args: { eventType: "rfq" } }, { step: "select_template", args: {} }, { step: "add_line_items", args: { count: 1, search: "CYLINDER WITH KEY & KNOB" } }],
    reach: ['From the left menu click "Events", click "Create Event" and choose "Single Stage"', 'Under Event Type click "RFQ", choose the "Buy Template" and add the product "CYLINDER WITH KEY & KNOB" with quantity 10'],
    pre: "The buyer can create events on the test company.",
    probes: [{ max: 35 }], settings: ["lock_vendors_addition_in_event_creation", "can_add_ceil_price", "enable_tnc_mandatory_button"],
  },
  {
    key: "live-rfq", name: "A live RFQ — Responses tab and Settings menu", state: "live",
    start: [{ step: "open_prepared", args: { screen: "responses" } }],
    reach: OPEN_EVENT("Responses"), pre: "A live RFQ (bidding open) with the QA vendors invited and no bid yet.",
    probes: [{ max: 30 }, { within: "Settings" }], needs: [ERFX],
    settings: ["hide_withdraw_in_intake_and_event", "disable_withdraw_during_submission_time", "is_vendor_masking_allowed_for_everyone"],
  },
  {
    key: "bid-rfq", name: "A live RFQ with a vendor's bid — Responses, Settings and the bid's ⋮ menu", state: "bid",
    start: [{ step: "open_prepared", args: { screen: "responses" } }],
    reach: OPEN_EVENT("Responses"), pre: "A live RFQ where Vendor A has bid (bidding still open).",
    probes: [{ max: 30 }, { within: "Settings" }, { within: "⋮ (more)" }], needs: [ERFX],
    settings: ["hide_counter_offer_rfq", "disable_reject_bid_in_bidding_time", "can_buyer_edit_bid", "is_counter_offer_percent_bid_allowed"],
  },
  {
    key: "closed-rfq", name: "A closed RFQ — Responses, Settings and the bid's ⋮ menu", state: "closed",
    start: [{ step: "open_prepared", args: { screen: "responses" } }],
    reach: OPEN_EVENT("Responses"), pre: "A closed RFQ (bidding over) where Vendor A has bid.",
    probes: [{ max: 30 }, { within: "Settings" }, { within: "⋮ (more)" }], needs: [ERFX],
    settings: ["is_allowed_to_add_surrogate_bid_post_expiry", "can_buyer_edit_bid", "allow_event_evaluation_reopen_for_everyone"],
  },
  {
    key: "closed-qcs", name: "Master QCS of a closed RFQ", state: "closed",
    start: [{ step: "open_prepared", args: { screen: "master_qcs" } }],
    reach: ['From the left menu click "Events" and open the event (type its title in "Search Title" and click it)', 'Click "Master QCS"'],
    pre: "A closed RFQ (bidding over) where Vendor A has bid.",
    probes: [{ max: 30 }], needs: [ERFX], settings: ["is_partial_awarding_enabled", "restrict_unlock_bid_before_evaluation", "is_over_awarding_allowed"],
  },
  {
    key: "draft", name: "A saved eRFX draft", state: "draft",
    start: [{ step: "open_prepared", args: { screen: "draft" } }],
    reach: ['From the left menu click "Events", open the "Drafts" tab and click the draft'], pre: "A saved eRFX draft (not published).",
    probes: [{ max: 35 }], needs: [ERFX], settings: ["lock_vendors_addition_in_event_creation", "is_add_new_stage_allowed"],
  },
  {
    key: "proposal", name: "The award proposal page", state: "proposal",
    start: [{ step: "open_prepared", args: { screen: "proposal" } }],
    reach: ['From the left menu click "Events" and open the event', 'Click "Master QCS", then open the award proposal'],
    pre: "A closed RFQ with an award proposal created for Vendor A.", probes: [{ max: 30 }], needs: [ERFX], settings: ["ntd_required_on_proposal"],
  },
  {
    key: "awarded", name: "An awarded event — Project details and Settings", state: "awarded",
    start: [{ step: "open_prepared", args: { screen: "responses" } }],
    reach: OPEN_EVENT("Responses"), pre: "An event already awarded to Vendor A.", probes: [{ max: 30 }, { within: "Settings" }], needs: [ERFX], settings: [],
  },
];

interface ProbeRecord {
  n: number; role: string; name: string; disabled: boolean; tooltip?: string; outcome: string;
  dialog?: { title: string; buttons: string[]; fields: string[]; text: string }; menu?: string[]; url?: string;
  messages?: Array<{ kind: string; text: string }>; requests?: Array<{ method: string; path: string; status: number }>; newText?: string[]; changedEvent?: boolean; screenshot?: string; note?: string;
  emptySubmit?: { button: string; stayedOpen: boolean; fieldErrors: string[]; messages: Array<{ kind: string; text: string }>; requests: Array<{ method: string; path: string; status: number }> };
  fieldDetails?: Array<{ label: string; kind: string; required: boolean; value: string; placeholder: string }>;
}
interface ProbeRun { probe: Probe; records: ProbeRecord[]; listed?: string[]; odd?: string[]; shot?: string }
interface Variant { key: string; from: unknown; to: unknown; listed: ProbeRun[]; clicked: ProbeRun[]; diff: string[]; why?: string }
export interface FlowResult { flow: string; at: string; baseline: ProbeRun[]; baselineSettings: ConfigNeed[]; variants: Variant[]; why?: string }

/** Build the flow's starting event (if any), open its screen and run the probes in ONE browser run. */
async function probeOnce(flow: FlowDef, probes: Array<Record<string, unknown>>, companyId: number, line: (l: string) => void): Promise<{ runs: ProbeRecord[][]; listed: string[][]; meta?: Array<{ odd?: string[]; shot?: string }>; why?: string }> {
  const plan: { title: string; steps: Step[]; context?: Record<string, unknown> } = { title: `explore ${flow.key}`, steps: [...flow.start, ...probes.map((args) => ({ step: "probe_controls", args }))] };
  if (flow.state === "none") plan.context = { state: "none" };
  else {
    const prep = await contextForPlan(`explore ${flow.name}`, plan, companyId, line, { state: flow.state, technical: flow.technical, auction: flow.auction });
    if (!prep.context) return { runs: [], listed: [], why: prep.why ?? "the starting event could not be built" };
    plan.context = prep.context;
  }
  const runId = `explore-${flow.key}-${Date.now().toString(36)}`;
  await new Promise<void>((res) =>
    runUiPlan({ plan, companyId, runId }, (e: any) => {
      if (e.type === "log" && /\[probe\]|\[plan\] \d+\/\d+/.test(String(e.line ?? ""))) line(String(e.line).replace(/^.*?\[(probe|plan)\]\s*/, "").slice(0, 260));
      if (e.type === "done" || e.type === "run-error") res();
    }),
  );
  const result = readPlanResult(runId) as { steps?: Array<{ step: string; status: string; detail?: string }> } | null;
  const failedStart = result?.steps?.slice(0, flow.start.length).find((s) => s.status !== "ok");
  if (failedStart) return { runs: [], listed: [], why: `could not reach the screen: ${failedStart.step} — ${String(failedStart.detail ?? "").slice(0, 200)}` };
  const dir = join(UI, "evidence", runId);
  const files = probes.map((_, i) => {
    const f = join(dir, `probe-${flow.start.length + i + 1}.json`);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { records?: ProbeRecord[]; listed?: string[]; oddOnScreen?: string[]; screenShot?: string }) : {};
  });
  return { runs: files.map((x) => x.records ?? []), listed: files.map((x) => x.listed ?? (x.records ?? []).map((r) => r.name)), meta: files.map((x) => ({ odd: x.oddOnScreen, shot: x.screenShot })) };
}

/** Names that change from run to run (event cards with ids and countdowns, "Now - 05:52 pm" chips) are not controls to compare. */
const DYNAMIC = /\b(RFQ|RFP|RFX|AUC)-\d+|ends in|\d+m : \d+s|\d{1,2}:\d{2}\s*(am|pm)|in progress|\bQA_Platform|spine-(ui|api)-automation/i;
/** What a screen offered: every control it listed (whether or not its click worked), greyed out or not. */
const offered = (run: ProbeRun) =>
  new Map((run.listed ?? run.records.filter((r) => r.outcome !== "not found").map((r) => r.name)).filter((n) => !DYNAMIC.test(n)).map((n) => [n, run.records.find((r) => r.name === n)?.disabled ?? false]));

export async function exploreFlow(flow: FlowDef, opts: { companyId: number; variants?: boolean; line: (l: string) => void }): Promise<FlowResult> {
  const { companyId, line } = opts;
  line(`── ${flow.name}: clicking everything on the screen as the company is set up now`);
  const base = await probeOnce(flow, flow.probes as Array<Record<string, unknown>>, companyId, line);
  const result: FlowResult = { flow: flow.key, at: new Date().toISOString(), baseline: flow.probes.map((p, i) => ({ probe: p, records: base.runs[i] ?? [], listed: base.listed[i], odd: base.meta?.[i]?.odd, shot: base.meta?.[i]?.shot })), baselineSettings: [], variants: [], why: base.why };
  const known = new Map((await settingsCatalog()).map((s) => [s.key, s]));
  for (const key of flow.settings.filter((k) => known.has(k))) {
    const cur = await currentValue(companyId, key);
    result.baselineSettings.push({ key, value: cur.value ?? known.get(key)!.def, why: known.get(key)!.description.slice(0, 70) });
  }
  if (base.why || opts.variants === false) return save(result);
  for (const b of result.baselineSettings) {
    if (typeof b.value !== "boolean") continue;
    if (settingBlockers()[b.key]) {
      result.variants.push({ key: b.key, from: b.value, to: !b.value, listed: [], clicked: [], diff: [], why: `BLOCKED — ${settingBlockers()[b.key]}` });
      continue;
    }
    const to = !b.value;
    line(`── ${flow.name}: switching ${b.key} to ${to ? "On" : "Off"} and looking again`);
    const v: Variant = { key: b.key, from: b.value, to, listed: [], clicked: [], diff: [] };
    const out = await withSettings(companyId, [{ key: b.key, value: to, why: "explore the screen with it switched" }], `explore-${flow.key}`, line, async (): Promise<{ why?: string }> => {
      const listed = await probeOnce(flow, flow.probes.map((p) => ({ ...p, listOnly: true })), companyId, line);
      if (listed.why) return { why: listed.why };
      v.listed = flow.probes.map((p, i) => ({ probe: p, records: listed.runs[i] ?? [], listed: listed.listed[i] }));
      // what changed against the screen as it was: appeared, disappeared, greyed out or no longer greyed out
      const changedNames: string[][] = flow.probes.map(() => []);
      // a screen that lost most of what it showed did not load the same way: no comparison, not a finding
      const lost = flow.probes.map((_, i) => {
        const was = offered(result.baseline[i]), now = offered(v.listed[i]);
        return was.size >= 6 && [...was.keys()].filter((n) => !now.has(n)).length > was.size / 2;
      });
      if (lost.some(Boolean)) return { why: "the screen did not load the same way with the setting switched (most of its controls were missing) — run it again to compare" };
      flow.probes.forEach((p, i) => {
        const was = offered(result.baseline[i]), now = offered(v.listed[i]);
        for (const [n, dis] of now) {
          if (!was.has(n)) { v.diff.push(`appears: "${n}"${dis ? " (greyed out)" : ""}`); changedNames[i].push(n); }
          else if (was.get(n) !== dis) { v.diff.push(`${dis ? "greyed out" : "no longer greyed out"}: "${n}"`); changedNames[i].push(n); }
        }
        for (const [n] of was) if (!now.has(n)) v.diff.push(`gone: "${n}"`);
      });
      const toClick = flow.probes.map((p, i) => ({ p, names: changedNames[i].map((n) => n.replace(/^.*? → /, "")) })).filter((x) => x.names.length);
      if (toClick.length) {
        const clicked = await probeOnce(flow, toClick.map((x) => ({ ...x.p, include: x.names })), companyId, line);
        v.clicked = toClick.map((x, i) => ({ probe: x.p, records: clicked.runs[i] ?? [] }));
      }
      return {};
    }).catch((e: Error) => ({ refused: `exploring with it switched broke: ${e.message.slice(0, 160)}` }));
    if ("refused" in out) v.why = out.refused;
    else if ((out.result as { why?: string }).why) v.why = (out.result as { why?: string }).why;
    line(`   ${b.key} ${to ? "On" : "Off"}: ${v.why ? `not explored — ${v.why}` : v.diff.length ? v.diff.join("; ") : "nothing on the screen changed"}`);
    result.variants.push(v);
    save(result);
  }
  return save(result);
}

function save(r: FlowResult): FlowResult {
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, `${r.flow}.json`), JSON.stringify(r, null, 1));
  return r;
}
export function loadFlowResult(key: string): FlowResult | null {
  const f = join(RAW, `${key}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as FlowResult) : null;
}

// ── observations → test cases and questions ─────────────────────────────────────────────────
const q = (t: string) => `"${t.replace(/"/g, "'")}"`;
const list = (xs: string[], n = 8) => xs.slice(0, n).map(q).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");
const SCREEN = (path: string) =>
  /master_qcs/.test(path) ? "Master QCS" : /proposal/.test(path) ? "award proposal page" : /\/details/.test(path) ? "Project Details page" : /quick-create/.test(path) ? "create screen" : /\/orders/.test(path) ? "events list" : /\/project\//.test(path) ? "stage page" : path;
const ODD_NUMBER = /₹\s*-\s*\d|-\d[\d,.]*\s*%|NaN|undefined|Invalid date|null\b/;

export interface ExploredCase { row: SheetRow; question?: string; screenshot?: string; bug?: { id: string; title: string; seen: string; flow: string; screenshot?: string } }

/** Wrong values the tester has confirmed as bugs: the case expects the right value and is marked failed with the bug. */
const CONFIRMED_BUGS: Array<{ id: string; match: RegExp; title: string; expected: string; look: string; confirmed: string }> = [
  {
    id: "BUG-BROKEN-VALUE", match: /\bNaN\b|\bundefined\b|Invalid date|\bnull\b/,
    title: "A value on the screen reads NaN / undefined / Invalid date",
    expected: "Every label and number on the screen shows a real value (or \"-\" when there is none) — never \"NaN\", \"undefined\", \"null\" or \"Invalid date\".",
    look: "Look over the page for a value that reads NaN, undefined, null or Invalid date",
    confirmed: "a broken value is always a bug",
  },
  {
    id: "BUG-LPP-NEGATIVE", match: /last purchase price.*₹\s*-\s*\d|₹\s*-\s*\d[\d,]*.*-\d[\d.]*\s*%/i,
    title: "Last Purchase Price is never shown as a negative amount",
    expected: 'The "Last Purchase Price" at the bottom of the Responses tab is a positive amount (or "-" when there is none), and the % beside it is worked out from it. A negative last purchase price (e.g. "₹-12,740 (-240.74%)") is wrong.',
    look: 'Look at "Last Purchase Price" at the bottom left of the Responses tab',
    confirmed: "confirmed as a bug by the tester, 29 Oct",
  },
];


function observed(r: ProbeRecord): { title: string; expected: string; question?: string; type: string } {
  const label = r.name.replace(/^(.*?) → /, "");
  if (r.outcome === "disabled")
    // every greyed-out control must say why in a tooltip (the tester, 30 Oct): one without is a bug, not a question
    return { title: `"${label}" is greyed out and says why`, expected: `"${label}" is greyed out and does nothing when clicked; moving the mouse over it shows a tooltip saying why${r.tooltip ? ` — ${q(r.tooltip)}` : ""}.`, type: "Negative" };
  if (r.outcome === "dialog" && r.dialog)
    return { title: `"${label}" opens the ${q(r.dialog.title || "pop-up")} window`, expected: `A window ${q(r.dialog.title || "(no title)")} opens${r.dialog.fields.length ? ` with ${list(r.dialog.fields, 6)}` : ""}${r.dialog.buttons.length ? ` and the buttons ${list(r.dialog.buttons)}` : ""}. Nothing changes on the event until a button in it is pressed.`, type: "Positive" };
  if (r.outcome === "menu" && r.menu) return { title: `"${label}" opens its menu`, expected: `A menu opens listing ${list(r.menu, 12)}.`, type: "Positive" };
  if (r.outcome === "navigated" && r.url) return { title: `"${label}" opens the ${SCREEN(new URL(r.url).pathname)}`, expected: `The ${SCREEN(new URL(r.url).pathname)} opens (the address changes to …${new URL(r.url).pathname.replace(/\/[A-Za-z0-9]{8,}/g, "/…")}).`, type: "Positive" };
  if (r.outcome === "error") {
    const said = r.messages?.find((m) => m.kind === "error")?.text ?? r.requests?.find((x) => x.status >= 500)?.path;
    return { title: `"${label}" — record what happens (the app showed an error)`, expected: `Record what happens. During exploration the app answered ${said ? q(said) : "with an error"}${r.requests?.some((x) => x.status >= 500) ? ` (server error ${r.requests.find((x) => x.status >= 500)!.status} from ${r.requests.find((x) => x.status >= 500)!.path})` : ""}.`, type: "Edge", question: `Clicking "${r.name}" made the app answer ${said ? q(said) : "with an error"}. Is that expected here, and what should happen instead?` };
  }
  if (r.outcome === "message" || r.outcome === "request") {
    const msg = r.messages?.[0]?.text;
    if (msg) return { title: `"${label}" shows ${q(msg.slice(0, 50))}`, expected: `The app shows ${q(msg)}.`, type: "Positive" };
    if (r.role === "tab") return { title: `the "${label}" tab opens`, expected: `The "${label}" tab opens and shows its content${r.newText?.length ? ` (e.g. ${list(r.newText.filter((t) => !/^\d+m : \d+s$/.test(t)), 3)})` : ""}, with no error.`, type: "Positive" };
    const fresh = (r.newText ?? []).filter((t) => !/^\d+m : \d+s$/.test(t));
    if (fresh.length) return { title: `"${label}" shows ${q(fresh[0].slice(0, 40))}`, expected: `The screen now shows ${list(fresh, 4)}.`, type: "Positive" };
  }
  if (r.role === "tab") return { title: `the "${label}" tab can be opened`, expected: `The "${label}" tab opens (or stays open) with no error.`, type: "Positive" };
  return { title: `"${label}" — record what happens`, expected: "Record what happens (during exploration nothing visible changed after the click).", type: "Edge", question: `Clicking "${r.name}" did nothing visible on the screen. What should it do?` };
}

export function casesForFlow(flow: FlowDef, r: FlowResult, startNo = 1): ExploredCase[] {
  const out: ExploredCase[] = [];
  let n = startNo;
  const id = () => `EXP-${flow.key.toUpperCase().replace(/[^A-Z0-9]+/g, "")}-${String(n++).padStart(3, "0")}`;
  const module = `Explored — ${flow.name}`;
  const asIs: ConfigNeed[] = [...(flow.needs ?? []), ...r.baselineSettings.filter((b) => typeof b.value === "boolean")];
  const steps = (p: Probe, rec: ProbeRecord) => {
    const label = rec.name.replace(/^(.*?) → /, "");
    return [BUYER_LOGIN, ...flow.reach, ...(p.within ? [`Click ${q(p.within.replace(/ \(more\)$/, ""))}${p.within.startsWith("⋮") ? " on the vendor's bid" : ""} to open its menu`] : []), rec.outcome === "disabled" ? `Move the mouse over ${q(label)} and try to click it` : `Click ${q(label)}`, "Look at what opens or changes"].map((s, i) => `${i + 1}. ${s}`).join("\n");
  };
  const row = (title: string, p: Probe, rec: ProbeRecord, expected: string, type: string, configs: ConfigNeed[], scenario: string): SheetRow => ({
    "Test Case ID": id(), Module: module, Scenario: scenario, "Test Case Title": `${flow.name.split(" — ")[0]}: ${title}`, "User Role": "Buyer", Portal: "Buyer portal",
    "Pre-conditions": flow.pre, "Configs Needed": formatConfigs(configs), "Test Data": "-", "Test Steps": steps(p, rec), "Expected Result": expected,
    Priority: p.within === "Settings" || /publish|award|withdraw|counter|reject|submit/i.test(rec.name) ? "High" : "Medium", "Test Type": type, Status: "Not Run",
  });
  for (const run of r.baseline)
    for (const rec of run.records) {
      if (["not found", "probe failed", "skipped"].includes(rec.outcome)) continue;
      const o = observed(rec);
      if (rec.outcome === "disabled" && !rec.tooltip) {
        const rw = row(o.title, run.probe, rec, o.expected, o.type, asIs, run.probe.within ? `${run.probe.within} menu` : "What each control does");
        const title = `${flow.name.split(" — ")[0]}: "${rec.name.replace(/^(.*?) → /, "")}" is greyed out with no tooltip saying why`;
        rw.Status = "Fail — BUG-NO-TOOLTIP: greyed out, and moving the mouse over it shows nothing (every greyed-out control must say why — the tester, 30 Oct)";
        rw.Priority = "Medium";
        out.push({ row: rw, screenshot: rec.screenshot, bug: { id: "BUG-NO-TOOLTIP", title, seen: `"${rec.name}" greyed out, no tooltip`, flow: flow.name, screenshot: rec.screenshot } });
        continue;
      }
      const odd = (rec.newText ?? []).find((t) => ODD_NUMBER.test(t)) ?? (rec.dialog?.text.match(ODD_NUMBER) ? rec.dialog.text.slice(0, 160) : undefined);
      const question = o.question ?? (odd ? `After clicking "${rec.name}" the screen shows ${q(odd)} — is that value right?` : undefined);
      out.push({ row: row(o.title, run.probe, rec, o.expected, o.type, asIs, run.probe.within ? `${run.probe.within} menu` : "What each control does"), question, screenshot: rec.screenshot });
    }
  // one level deeper into every window: what the app asks for when its main button is pressed as it opened, and Cancel
  const seenDialogs = new Set<string>();
  for (const run of r.baseline)
    for (const rec of run.records) {
      if (rec.outcome !== "dialog" || !rec.dialog || seenDialogs.has(rec.dialog.title)) continue;
      seenDialogs.add(rec.dialog.title);
      const win = q(rec.dialog.title || rec.name);
      const cancel = rec.dialog.buttons.find((b) => /^(cancel|close|no)$/i.test(b));
      if (cancel) out.push({ row: row(`${win}: "${cancel}" closes it and changes nothing`, run.probe, rec, `The ${win} window closes. Nothing on the event changes (status, times, vendors and bids are as before).`, "Positive", asIs, `${rec.dialog.title} window`), screenshot: rec.screenshot });
      const es = rec.emptySubmit;
      if (!es) continue;
      const req = (rec.fieldDetails ?? []).filter((f) => f.required).map((f) => f.label || f.placeholder).filter(Boolean);
      if (es.stayedOpen && (es.fieldErrors.length || es.messages.length))
        out.push({ row: row(`${win}: "${es.button}" with the fields as they open is refused`, run.probe, rec, `The window stays open and the app asks for what is missing: ${list([...es.fieldErrors, ...es.messages.map((m) => m.text)], 6)}. Nothing is saved.`, "Negative", asIs, `${rec.dialog.title} window`), screenshot: rec.screenshot });
      else if (!es.stayedOpen && es.requests.some((x) => x.status < 400) && !(rec.fieldDetails ?? []).some((f) => f.required && !f.value))
        out.push({ row: row(`${win}: "${es.button}" with the values it opens with goes through`, run.probe, rec, `The window closes and the app saves it with the values the window opened with${es.messages[0] ? `, saying ${q(es.messages[0].text)}` : ""}.`, "Positive", asIs, `${rec.dialog.title} window`), screenshot: rec.screenshot });
      else if (!es.stayedOpen && es.requests.some((x) => x.status < 400))
        out.push({
          row: row(`${win}: "${es.button}" with the fields as they open goes through`, run.probe, rec, `Record what happens. During exploration the window closed and the app saved it${es.messages[0] ? `, saying ${q(es.messages[0].text)}` : ""} without anything being filled in${req.length ? ` (fields marked required: ${list(req)})` : ""}.`, "Edge", asIs, `${rec.dialog.title} window`),
          question: `In ${win}, pressing "${es.button}" without filling anything went through${es.messages[0] ? ` ("${es.messages[0].text.slice(0, 80)}")` : ""}. Is that right, or should it ask for ${req.length ? req.join(", ") : "something first (e.g. a reason)"}?`,
          screenshot: rec.screenshot,
        });
      else if (es.stayedOpen && !es.fieldErrors.length && !es.messages.length)
        out.push({ row: row(`${win}: "${es.button}" with the fields as they open — record what happens`, run.probe, rec, "Record what happens (during exploration the window stayed open and nothing said what was missing).", "Edge", asIs, `${rec.dialog.title} window`), question: `In ${win}, pressing "${es.button}" with the fields as they open did nothing and showed no message. What should it say?`, screenshot: rec.screenshot });
    }
  // values on the screen that are never right: a confirmed bug fails its case; anything else is asked
  for (const run of r.baseline)
    for (const odd of run.odd ?? []) {
      const bug = CONFIRMED_BUGS.find((b) => b.match.test(odd));
      const rec: ProbeRecord = { n: 0, role: "text", name: "the screen", disabled: false, outcome: "skipped" };
      if (bug) {
        const rw = row(bug.title, run.probe, rec, bug.expected, "Negative", asIs, "Values on the screen");
        rw["Test Steps"] = [BUYER_LOGIN, ...flow.reach, bug.look].map((x, i) => `${i + 1}. ${x}`).join("\n");
        rw.Priority = "High";
        rw.Status = `Fail — ${bug.id}: seen ${q(odd)} (${bug.confirmed})`;
        out.push({ row: rw, screenshot: run.shot, bug: { id: bug.id, title: bug.title, seen: odd, flow: flow.name, screenshot: run.shot } });
      } else out.push({ row: row(`the value ${q(odd.slice(0, 40))} on the screen — record what happens`, run.probe, rec, `Record what happens. During exploration the screen showed ${q(odd)}.`, "Edge", asIs, "Values on the screen"), question: `"${flow.name}" shows ${q(odd)} — is that value right?`, screenshot: run.shot });
    }
  for (const v of r.variants) {
    if (v.why || !v.diff.length) continue;

    const configs = asIs.map((c) => (c.key === v.key ? { ...c, value: v.to } : c));
    const setting = `${v.key} = ${v.to ? "On" : "Off"}`;
    for (const d of v.diff) {
      const name = /"(.+)"/.exec(d)?.[1] ?? d;
      const pi = r.baseline.findIndex((b) => b.records.some((x) => x.name === name)) ;
      const probe = flow.probes[Math.max(0, pi)] ?? flow.probes[0];
      const clicked = v.clicked.flatMap((c) => c.records).find((x) => x.name === name);
      const label = name.replace(/^(.*?) → /, "");
      const what = d.startsWith("gone") ? `${q(label)} is not offered` : d.startsWith("appears") ? `${q(label)} is offered` : d.startsWith("greyed") ? `${q(label)} is greyed out` : `${q(label)} can be clicked`;
      const more = clicked && !d.startsWith("gone") ? ` ${observed(clicked).expected}` : "";
      const rec: ProbeRecord = { n: 0, role: "button", name, disabled: d.startsWith("greyed"), outcome: d.startsWith("gone") ? "not found" : "skipped" };
      out.push({
        row: row(`with ${v.key} ${v.to ? "On" : "Off"}, ${what}`, probe, rec, `With the company setting ${setting}: ${what}${probe.within ? ` in the ${q(probe.within)} menu` : ""}.${more} (With it ${v.from ? "On" : "Off"}, as the company was: ${d.startsWith("gone") ? "it is offered" : d.startsWith("appears") ? "it is not offered" : d.startsWith("greyed") ? "it can be clicked" : "it is greyed out"}.)`, "Edge", configs, `Setting ${v.key}`),
        screenshot: clicked?.screenshot,
      });
    }
  }
  // a setting the catalogue says changes this screen, but switching it changed nothing visible
  for (const v of r.variants)
    if (v.why?.startsWith("BLOCKED")) {
      const rw = row(`with ${v.key} ${v.to ? "On" : "Off"} — blocked`, flow.probes[0], { n: 0, role: "button", name: v.key, disabled: false, outcome: "skipped" }, `Record what happens on this screen with the company setting ${v.key} = ${v.to ? "On" : "Off"}.`, "Edge", asIs.map((c) => (c.key === v.key ? { ...c, value: v.to } : c)), `Setting ${v.key}`);
      rw.Status = `Blocked — ${v.why.replace(/^BLOCKED — /, "")}`;
      out.push({ row: rw });
    }
  for (const v of r.variants)
    if (!v.why && !v.diff.length)

      out.push({
        row: row(`switching ${v.key} changes nothing visible here`, flow.probes[0], { n: 0, role: "button", name: v.key, disabled: false, outcome: "skipped" }, `Record what happens. During exploration, switching ${v.key} from ${v.from ? "On" : "Off"} to ${v.to ? "On" : "Off"} changed nothing on this screen's controls or menus.`, "Edge", asIs.map((c) => (c.key === v.key ? { ...c, value: v.to } : c)), `Setting ${v.key}`),
      });
  return out;
}

/**
 * In-depth cases for one window the probe found (its fields, buttons and what an as-opened submit did): valid input,
 * each required field left empty, limits and wrong types, Cancel, and the window's own rules — written by the model
 * in the house style from what was SEEN, with "Record what happens" + a question wherever the expected result is
 * not known. Cached per flow + window title (data/flow-explore/deep-cache.json), so it is written once.
 */
const DEEP_CACHE = join(RAW, "deep-cache.json");
async function deepCasesForWindow(flow: FlowDef, rec: ProbeRecord, configs: ConfigNeed[]): Promise<Array<{ title: string; steps: string[]; expected: string; testType: string; priority: string; testData: string; question?: string }>> {
  const key = `${flow.key}|${rec.dialog?.title}`;
  const cache: Record<string, any[]> = existsSync(DEEP_CACHE) ? JSON.parse(readFileSync(DEEP_CACHE, "utf8")) : {};
  if (cache[key]) return cache[key];
  const seen = {
    window: rec.dialog?.title, openedBy: rec.name, buttons: rec.dialog?.buttons, fields: rec.fieldDetails ?? rec.dialog?.fields, text: rec.dialog?.text?.slice(0, 500),
    pressedAsOpened: rec.emptySubmit ?? "not tried",
  };
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You write IN-DEPTH manual test cases for ONE window of Procol (a procurement app), from what an exploration SAW in it. " +
          "Cover: the normal use with valid values; each required field left empty; each field's limits and wrong input (past dates, zero, negative, very large, letters in numbers, very long text, special characters); Cancel / close; and anything the window's text implies. " +
          "Expected results come ONLY from what was seen (the app's own messages in quotes) or from plain sense a tester would not dispute; when the right result is not known, write \"Record what happens\" and put a short question for the product owner in \"question\". Never invent message texts. " +
          "Steps start AFTER the window is open (the runner prepends how to get there). 6 to 10 cases.\n" + STYLE_GUIDE +
          '\nReply with JSON only: [{"title","steps":["…"],"expected","testData","testType":"Positive|Negative|Edge","priority":"Critical|High|Medium|Low","question":"… or omit"}]',
      },
      { role: "user", content: `SCREEN: ${flow.name}\nSTARTING STATE: ${flow.pre}\nCOMPANY SETTINGS: ${configs.map((c) => `${c.key}=${JSON.stringify(c.value)}`).join(", ") || "none"}\nWHAT WAS SEEN:\n${JSON.stringify(seen, null, 1)}` },
    ],
    { temperature: 0.2, maxTokens: 3000 },
  ).catch(() => "");
  let cases: any[] = [];
  try {
    const i = raw.indexOf("["), j = raw.lastIndexOf("]");
    cases = i >= 0 && j > i ? JSON.parse(raw.slice(i, j + 1)) : [];
  } catch {
    cases = [];
  }
  cases = cases.filter((c) => c && c.title && Array.isArray(c.steps) && c.expected).slice(0, 10);
  if (cases.length) {
    cache[key] = cases;
    mkdirSync(RAW, { recursive: true });
    writeFileSync(DEEP_CACHE, JSON.stringify(cache, null, 1));
  }
  return cases;
}

async function deepCasesForFlow(flow: FlowDef, r: FlowResult, startNo: number): Promise<ExploredCase[]> {
  const out: ExploredCase[] = [];
  let n = startNo;
  const asIs: ConfigNeed[] = [...(flow.needs ?? []), ...r.baselineSettings.filter((b) => typeof b.value === "boolean")];
  const seen = new Set<string>();
  for (const run of r.baseline)
    for (const rec of run.records) {
      if (rec.outcome !== "dialog" || !rec.dialog?.title || seen.has(rec.dialog.title)) continue;
      seen.add(rec.dialog.title);
      if (!(rec.fieldDetails?.length || rec.dialog.fields.length)) continue; // a window with nothing to type has no depth
      const label = rec.name.replace(/^(.*?) → /, "");
      const reach = [BUYER_LOGIN, ...flow.reach, ...(run.probe.within ? [`Click ${q(run.probe.within.replace(/ \(more\)$/, ""))} to open its menu`] : []), `Click ${q(label)} — the ${q(rec.dialog.title)} window opens`];
      for (const c of await deepCasesForWindow(flow, rec, asIs)) {
        out.push({
          row: {
            "Test Case ID": `EXP-${flow.key.toUpperCase().replace(/[^A-Z0-9]+/g, "")}-${String(n++).padStart(3, "0")}`, Module: `Explored — ${flow.name}`, Scenario: `${rec.dialog.title} window (in depth)`,
            "Test Case Title": `${rec.dialog.title}: ${String(c.title).replace(/\.$/, "")}`, "User Role": "Buyer", Portal: "Buyer portal", "Pre-conditions": flow.pre, "Configs Needed": formatConfigs(asIs),
            "Test Data": String(c.testData ?? "-") || "-", "Test Steps": [...reach, ...c.steps.map((x: unknown) => String(x).replace(/^\s*\d+[.)]\s*/, ""))].map((x, i) => `${i + 1}. ${x}`).join("\n"),
            "Expected Result": String(c.expected), Priority: /^(Critical|High|Medium|Low)$/.test(c.priority) ? c.priority : "Medium", "Test Type": /^(Positive|Negative|Edge)$/.test(c.testType) ? c.testType : "Negative", Status: "Not Run",
          },
          screenshot: rec.screenshot,
        });
      }
    }
  return out;
}

/** All explored flows → the xlsx sheet (house columns), the questions and the bugs. */
export async function writeExploredSheet(keys = FLOWS.map((f) => f.key), opts: { deep?: boolean } = {}): Promise<{ file: string; cases: number; questions: string[]; bugs: string[] }> {
  const all: ExploredCase[] = [];
  for (const k of keys) {
    const flow = FLOWS.find((f) => f.key === k);
    const r = loadFlowResult(k);
    if (!flow || !r) continue;
    const mine = casesForFlow(flow, r);
    all.push(...mine);
    if (opts.deep !== false) all.push(...(await deepCasesForFlow(flow, r, mine.length + 1)));
  }
  mkdirSync(OUT, { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(all.map((c) => c.row), { header: [...SHEET_COLUMNS] });
  (ws as any)["!cols"] = [16, 34, 22, 60, 10, 14, 40, 44, 10, 70, 70, 9, 10, 9].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, "Explored Flows");
  const qs = all.filter((c) => c.question).map((c) => ({ id: c.row["Test Case ID"], q: c.question!, shot: c.screenshot }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qs.map((x) => ({ "Test Case ID": x.id, Question: x.q, Screenshot: x.shot ?? "" }))), "Questions");
  const bugs = all.filter((c) => c.bug).map((c) => ({ "Bug ID": c.bug!.id, Title: c.bug!.title, Where: c.bug!.flow, Seen: c.bug!.seen, "Test Case ID": c.row["Test Case ID"], Screenshot: c.bug!.screenshot ?? "" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bugs.length ? bugs : [{ "Bug ID": "-", Title: "none", Where: "", Seen: "", "Test Case ID": "", Screenshot: "" }]), "Bugs");
  const file = join(OUT, "Procol-Explored-Flows.xlsx");
  XLSX.writeFile(wb, file);
  writeFileSync(join(OUT, "questions.md"), `# Questions from exploring the flows\n\nAnswer each one; the answer becomes the case's expected result.\n\n${qs.map((x) => `- **${x.id}** — ${x.q}`).join("\n")}\n`);
  // the platform's Bugs page reads these (report/sheetDefects.ts)
  const at = new Date().toISOString();
  writeFileSync(
    join(RAW, "bugs.json"),
    JSON.stringify(
      all.filter((c) => c.bug).map((c) => ({ id: c.bug!.id, title: c.bug!.title, seen: c.bug!.seen, flow: c.bug!.flow, caseId: c.row["Test Case ID"], severity: c.row.Priority as "High", expected: c.row["Expected Result"], steps: c.row["Test Steps"].split("\n"), screenshot: c.bug!.screenshot, at })),
      null,
      1,
    ),
  );
  writeFileSync(join(OUT, "bugs.md"), `# Bugs found while exploring\n\n${bugs.map((b) => `- **${b["Bug ID"]}** — ${b.Title}. Seen on ${b.Where}: ${b.Seen} (case ${b["Test Case ID"]}; screenshot ${String(b.Screenshot).replace(/^.*\/procol-ui-tests\//, "procol-ui-tests/")})`).join("\n") || "None yet."}\n`);
  return { file, cases: all.length, questions: qs.map((x) => `${x.id}: ${x.q}`), bugs: bugs.map((b) => `${b["Bug ID"]}: ${b.Title} — ${b.Seen}`) };
}
