/**
 * A RUN YOU TALK TO — the server's half (Aanya, 29 Oct: "if the user says something then it continues with the same
 * step the user asks it to do"). What the tester types to a running browser plan (POST /api/live/say) is turned
 * into steps and queued for that run as a patch (procol-ui-tests/.plans/<run>-patch.jsonl); the run applies it
 * between steps in the same browser, or — once its own steps are done and it is waiting — runs it on the screen it
 * is on (procol-ui-tests/src/support/converse.ts).
 *
 *   insert   do this next, then carry on with the plan ("also invite one more vendor")
 *   replace  do this instead of the steps not run yet ("don't award, just close it")
 *   append   do this after the plan ("then approve the award")
 *   answer   a question or a remark: a sentence back, nothing changes
 *
 * Steps come only from the plan catalog (the runner's own steps); anything it has no step for is a do_on_screen
 * goal, which the explorer works out on screen. Never a verdict: the run judges.
 */
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";

const here = dirname(fileURLToPath(import.meta.url));
const UI_TESTS = join(here, "..", "..", "..", "procol-ui-tests");
const PLANS = join(UI_TESTS, ".plans");

type Step = { step: string; args?: Record<string, unknown> };
export type ConverseResult = { op: "insert" | "replace" | "append" | "answer"; steps: Step[]; reply: string; before?: string; after?: string };

type CatalogStep = { name: string; purpose?: string; args?: Record<string, string> };
let catalog: CatalogStep[] | null = null;
function steps(): CatalogStep[] {
  if (catalog) return catalog;
  try {
    catalog = (JSON.parse(readFileSync(join(UI_TESTS, "plan-catalog.json"), "utf8")).steps ?? []) as CatalogStep[];
  } catch {
    catalog = [];
  }
  return catalog;
}

const readJson = (f: string) => {
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  } catch {
    return null;
  }
};

const SYSTEM = [
  `You turn what a QA tester types into steps for a browser test that is running on Procol (a procurement app).`,
  `The test keeps its browser and goes on from where it is: it never starts again. Reply with JSON only:`,
  `{"op":"insert"|"replace"|"append"|"answer","steps":[{"step":"<catalog name>","args":{…}}],"before":"<step>"?,"after":"<step>"?,"reply":"one short sentence"}`,
  ``,
  `- insert: do this next, then carry on with the remaining steps ("also invite one more vendor", "use 120 as the price").`,
  `  When they say WHERE ("before saving the draft", "after publishing"), add "before" or "after" with the name of that`,
  `  coming step from STEPS (e.g. "before":"save_draft"); without it the steps run next.`,
  `- replace: do this INSTEAD of the steps not run yet ("don't award it, just close the event", "stop after publishing").`,
  `- append: do this after the remaining steps ("then approve the award"). When the run is WAITING (its steps are done),`,
  `  everything they ask for is append.`,
  `- answer: a question or a remark with nothing to do ("what event is this?", "nice"); steps []. Answer from the record.`,
  ``,
  `Use ONLY step names from the catalog, with its args. For something no step covers, use`,
  `{"step":"do_on_screen","args":{"goal":"<what to do, in plain words>"}} — it is worked out on screen. Add an expect_…`,
  `step after an action when the tester says what should happen. Keep to what they asked: no extra steps.`,
  `The event the run is on is the one in the record: never open or create another unless they say so.`,
  `"reply" says what will happen, in the tester's words, e.g. "Inviting one more vendor next, then carrying on."`,
].join("\n");

/** The steps the tester's words mean, for this run where it is. */
export async function stepsFor(runId: string, text: string): Promise<ConverseResult> {
  const state = readJson(join(PLANS, `${runId}-state.json`));
  const plan = readJson(join(PLANS, `${runId}.json`));
  const list = (state?.steps ?? plan?.steps ?? []) as Array<{ step: string; args?: unknown; status?: string; detail?: string }>;
  const at = Number(state?.at ?? 0);
  const waiting = !!state?.waiting;
  const record = [
    `RUN: ${plan?.title ?? state?.title ?? runId}`,
    state?.projectId ? `EVENT: project ${state.projectId}${state.eventTitle ? ` (“${state.eventTitle}”)` : ""}` : "",
    state?.url ? `SCREEN NOW: ${state.url}` : "",
    waiting ? `STATE: WAITING — all its steps are done; the browser is open on that screen.` : `STATE: running step ${at + 1} of ${list.length}.`,
    `STEPS:`,
    ...list.map((s, k) => `${k + 1}. ${s.step} ${JSON.stringify(s.args ?? {})} — ${s.status ?? (k < at ? "done" : k === at ? "running" : "waiting")}${s.detail ? `: ${s.detail}` : ""}`),
  ].filter(Boolean).join("\n");
  const cat = steps()
    .map((c) => `${c.name}${c.args ? ` ${JSON.stringify(Object.fromEntries(Object.keys(c.args).map((k) => [k, "…"])))}` : ""} — ${String(c.purpose ?? "").replace(/\s+/g, " ").slice(0, 150)}`)
    .join("\n");
  // THE VENDOR'S PART GOES TO place_bid (6 Nov, plan-mw57y3sv: "login with the vendor who's invited" became an
  // on-screen goal in the buyer's browser and signed the buyer out). place_bid opens a vendor browser of its own.
  const vendorPart = /(\b(log ?in|sign ?in|login)\b[^.?]*\b(vendor|supplier)s?\b|\b(vendor|supplier)s?\b[^.?]*\b(log ?in|sign ?in|login|portal)\b)/i.test(text) && !/\?\s*$/.test(text);
  if (vendorPart) {
    const n = Math.max(1, Math.min(5, Number(/\b(\d+)\s+(?:more\s+)?(?:vendors?|suppliers?)\b/i.exec(text)?.[1] ?? 1)));
    return { op: waiting ? "append" : "insert", steps: Array.from({ length: n }, () => ({ step: "place_bid", args: {} })), reply: `Signing in as ${n === 1 ? "an invited vendor" : `${n} invited vendors`} on the vendor portal to bid — in a browser of its own; the buyer stays signed in.` };
  }
  let raw = "";
  try {
    raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `CATALOG:\n${cat}\n\n${record}\n\nTESTER SAYS: ${text}` },
      ],
      { tier: "reason", temperature: 0.1, maxTokens: 1200, reasoningEffort: "low" },
    );
  } catch {
    raw = "";
  }
  const parsed = parse(raw);
  if (!parsed) {
    // A question with no model to answer it is said so, never turned into an on-screen goal.
    if (/\?\s*$/.test(text)) return { op: "answer", steps: [], reply: "I could not work out an answer just now (the model did not reply) — the run carries on; ask again in a moment." };
    // No model, or no sense from it: the words go to the run as they are, for an on-screen step to follow.
    return { op: waiting ? "append" : "insert", steps: [{ step: "do_on_screen", args: { goal: text } }], reply: `Doing “${text.slice(0, 80)}” on screen ${waiting ? "now" : "next"}.` };
  }
  if (waiting && (parsed.op === "insert" || parsed.op === "replace")) parsed.op = "append";
  return parsed;
}

function parse(raw: string): ConverseResult | null {
  const t = raw.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try {
    j = JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
  const op = ["insert", "replace", "append", "answer"].includes(j?.op) ? j.op : null;
  if (!op) return null;
  const known = new Set(steps().map((c) => c.name));
  const out: Step[] = [];
  for (const s of Array.isArray(j.steps) ? j.steps : []) {
    const name = String(s?.step ?? "");
    const args = s?.args && typeof s.args === "object" ? s.args : {};
    // a step the runner does not have becomes an on-screen goal, never dropped silently
    if (known.has(name)) out.push({ step: name, args });
    else if (name) out.push({ step: "do_on_screen", args: { goal: `${name.replace(/_/g, " ")}${Object.keys(args).length ? ` ${JSON.stringify(args)}` : ""}` } });
  }
  const reply = String(j.reply ?? "").trim().slice(0, 300);
  if (op === "answer" || !out.length) return { op: "answer", steps: [], reply: reply || "Noted — nothing to change in the run." };
  const where = (v: unknown) => (typeof v === "string" && known.has(v) ? v : undefined);
  return { op, steps: out.slice(0, 12), reply, ...(op === "insert" && where(j.before) ? { before: where(j.before) } : {}), ...(op === "insert" && where(j.after) ? { after: where(j.after) } : {}) };
}

/** Queue the steps for the run (it applies them between steps, or right away when it is waiting). */
export function queueForRun(runId: string, r: ConverseResult, said: string): void {
  appendFileSync(join(PLANS, `${runId}-patch.jsonl`), JSON.stringify({ n: Date.now(), op: r.op, steps: r.steps, said, reply: r.reply, before: r.before, after: r.after }) + "\n");
}
