import type { Locator, Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG } from "../config.js";
import { BasePage } from "../pages/BasePage.js";
import { findByRecipe, listWords, readView, recipeOf, refLocator, viewText, waitForList, type Recipe, type ScreenView } from "./view.js";
import { SYSTEM, callModel, parseDecision, turnPrompt, type Decision } from "./brain.js";
import { SAYS_STOP, askTester, mask, offered, type Answer, type Option, type Question } from "./ask.js";
import { controlHeld, handedBackAt, holdStartedAt, released, takeHandSteps, takeTold, type HandStep } from "../support/liveControl.js";
import { earlierAnswer, forgetAnswer, learnAnswer } from "../support/learnedStore.js";

/**
 * THE EXPLORER — a journey nobody has written steps for, worked out on screen.
 *
 * The step compiler (prototype/src/agents/planner.ts) can only use the steps
 * the browser catalog has: sourcing events, end to end. "Make a PO, then an
 * invoice from it" has no steps there, and used to end as "not tested". This
 * does it the way a new tester would, one screen at a time:
 *
 *   look   → number every control on screen and read what it says (view.ts)
 *   decide → the platform's model picks ONE action toward the goal (brain.ts)
 *   act    → do exactly that, on exactly that element; screenshot the result
 *
 * The tester is in the loop, the way a chat assistant asks before guessing
 * (ask.ts): when the model cannot choose ("an existing PO or a new one?"),
 * when it is stuck, before a click that sends, publishes, approves or deletes
 * something, and after many steps without reaching the goal. Every question
 * offers options and takes a typed reply; "stop" ends the run as failed and
 * says where.
 *
 * Nothing is believed on the model's say-so. A ref that is not on screen is
 * refused, an action that changes nothing is reported back as such, and
 * "done" has to quote words that are actually on the screen.
 *
 * A route that reached its goal is saved (explored/<company>-<goal>.json) and
 * followed first the next time the same goal is asked for, deterministically,
 * falling back to exploring from the first step that no longer matches. That
 * is how an unknown journey becomes a known one.
 */

export interface ExploreOptions {
  goal: string;
  runId: string;
  companyId: number | null;
  /** steps before the tester is asked whether to keep going */
  maxSteps?: number;
  /** ask before clicks that send, publish, approve or delete (default on) */
  confirmRisky?: boolean;
  /**
   * Ask the tester first, before guessing: the steps, any login, or "try on
   * your own" (Aanya, 21 Oct: "whatever u dont have, ask the user… dont fool
   * the user"). Default on; off when the caller has just asked (runPlan's
   * ask_tester), or UI_EXPLORE_ASK_FIRST=0. Never when a saved route is followed.
   */
  askFirst?: boolean;
}

export interface ExploreStepResult {
  step: string;
  status: "ok" | "failed" | "skipped";
  detail?: string;
  url?: string;
  /** file name under evidence/<run>/ */
  shot?: string;
  ms: number;
  /** done by following a saved route, not chosen this run */
  replayed?: boolean;
}

export interface ExploreResult {
  title: string;
  goal: string;
  explored: true;
  passed: boolean;
  steps: ExploreStepResult[];
  /** why it stopped, in plain words, when it did not pass */
  reason?: string;
  /** the words on screen that showed the goal was reached */
  proof?: string;
  /** part of the journey was done by the tester in the browser: partly tested, never a plain pass */
  byHand?: boolean;
  /** what the tester answered along the way */
  told: string[];
  route: { followed?: string; followedSteps?: number; savedTo?: string };
}

interface RouteStep {
  action: Decision["action"];
  step: string;
  recipe?: Recipe;
  value?: string;
  path: string;
}

interface SavedRoute {
  goal: string;
  companyId: number | null;
  savedAt: string;
  runId: string;
  steps: RouteStep[];
  told: string[];
}

/** Names of controls whose click changes something outside this screen. */
const RISKY = /\b(publish|send|submit|invite|approve|award|delete|remove|reject|release|issue|notify|e-?mail|place bid|pay|confirm|cancel (event|po|order|invoice))\b/i;
const STOP: Option = { id: "stop", label: "Stop here — mark it failed" };
/** The tester takes the live browser (support/liveControl.ts) and does this part by hand. */
const SELF: Option = { id: "self", label: "I'll do it myself in the browser" };

const slug = (s: string, n = 40) =>
  s
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, n) || "step";

/** "Make PO -> invoice" and "make a PO → Invoice!" are the same goal. */
export function goalKey(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/→|->|=>|>/g, " to ")
    .replace(/\b(a|an|the|please|then)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const ROUTES_DIR = join(process.cwd(), "explored");
const routeFile = (companyId: number | null, goal: string) => join(ROUTES_DIR, `${companyId ?? "any"}-${goalKey(goal)}.json`);

function loadRoute(companyId: number | null, goal: string): SavedRoute | null {
  const f = routeFile(companyId, goal);
  if (!existsSync(f)) return null;
  try {
    const r = JSON.parse(readFileSync(f, "utf8")) as SavedRoute;
    return Array.isArray(r.steps) && r.steps.length ? r : null;
  } catch {
    return null;
  }
}

/** Is there a saved route for this goal (one the explorer found, or one a tester showed it)? */
export function hasRoute(companyId: number | null, goal: string): boolean {
  return !!loadRoute(companyId, goal);
}

/**
 * Keep what a tester did by hand as the route for a goal (Aanya, 26 Oct: "whatever i do in ui,
 * learn that so that u dont get stuck again"): the next ask for it follows their steps on its
 * own. Never kept when they typed a code or password, or when there is nothing to repeat.
 */
export function saveHandRoute(companyId: number | null, goal: string, hand: { steps: HandStep[]; secret: boolean }, runId: string): string | null {
  if (hand.secret || !hand.steps.some((h) => h.recipe)) return null;
  try {
    mkdirSync(ROUTES_DIR, { recursive: true });
    const file = routeFile(companyId, goal);
    const keep: SavedRoute = {
      goal,
      companyId,
      savedAt: new Date().toISOString(),
      runId,
      steps: hand.steps.map((h) => ({ action: h.action as Decision["action"], step: h.step, recipe: h.recipe as Recipe | undefined, value: h.value, path: h.path })),
      told: [`(the tester showed these ${hand.steps.length} steps by hand)`],
    };
    writeFileSync(file, JSON.stringify(keep, null, 2));
    console.log(`[explore] saved the ${hand.steps.length} steps you did by hand as the route for "${mask(goal)}" — the next run follows them itself`);
    return file;
  } catch {
    return null;
  }
}

/** A route that reached a goal phrased with the tester's typed instructions, kept under the plain goal too. */
export function keepRouteAs(companyId: number | null, fromGoal: string, toGoal: string): void {
  const r = loadRoute(companyId, fromGoal);
  if (!r) return;
  try {
    writeFileSync(routeFile(companyId, toGoal), JSON.stringify({ ...r, goal: toGoal }, null, 2));
  } catch {
    /* never changes the verdict */
  }
}

/** "Clicked “Submit PO”" → "click “Submit PO”": a step in words, as something about to be done. */
function nextWords(words: string): string {
  const verbs: Record<string, string> = { clicked: "click", "double-clicked": "double-click", typed: "type", picked: "pick", pressed: "press", opened: "open", ticked: "tick", unticked: "untick", scrolled: "scroll" };
  return words.replace(/^([A-Za-z-]+)/, (v) => verbs[v.toLowerCase()] ?? v.toLowerCase());
}

/** The step in words, from what was actually done to which control — never the model's paraphrase. */
function stepWords(action: Decision["action"], value: string | undefined, c?: { role: string; name: string; placeholder?: string; where?: string; value?: string }): string {
  // An icon link is listed for the model as "link to /purchase-orders"; a person reads "the link to Purchase Orders".
  const to = c?.name.match(/^link to \/(.*)$/);
  if (to && (action === "click" || action === "dblclick")) {
    const page = to[1].split(/[/?#]/).filter(Boolean)[0] ?? "";
    const words = page.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    return words ? `Clicked the link to ${words}` : "Clicked the link to the home page";
  }
  const name = c ? `“${c.name || c.placeholder || c.role}”` : "";
  const row = c?.where?.startsWith("row:") ? ` (${c.where.replace(/^row:\s*/, "row ").slice(0, 60)})` : "";
  switch (action) {
    case "click":
      if (c && (c.role === "checkbox" || c.role === "switch")) return `${c.value === "checked" ? "Unticked" : "Ticked"} ${name}${row}`;
      if (c?.role === "row") return `Opened the row ${name}`;
      return `Clicked ${name}${row}`;
    case "dblclick":
      return `Double-clicked ${name}${row}`;
    case "fill":
      return `Typed “${value ?? ""}” in ${name}`;
    case "select":
      return `Picked “${value ?? ""}” in ${name}`;
    case "press":
      return `Pressed ${value ?? "Enter"}${c ? ` in ${name}` : ""}`;
    case "goto":
      return `Opened ${value}`;
    case "scroll":
      return c ? `Scrolled to ${name}` : `Scrolled ${value === "up" ? "up" : "down"}`;
    case "back":
      return "Went back a page";
    case "wait":
      return "Waited for the page to load";
    default:
      return String(action);
  }
}

/** Quotes, dashes and spacing as the screen and the model each write them, made the same. */
const plain = (t: string) =>
  t
    .toLowerCase()
    .replace(/[“”„"«»]/g, "")
    .replace(/[‘’`']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Is the model's proof really on the screen? Every part of it must be: the
 * model often quotes two things joined by "…" or a comma ("Purchase Orders …
 * Order ID"), which is still a quote, not a paraphrase. A part shorter than
 * three characters proves nothing and is not counted.
 */
function provenOnScreen(proof: string, view: ScreenView): boolean {
  const screen = plain([view.text, view.headings.join(" "), view.messages.join(" "), view.controls.map((c) => `${c.name} ${c.value ?? ""}`).join(" ")].join(" "));
  const parts = proofParts(proof);
  return parts.length > 0 && parts.join("").length >= 6 && parts.every((x) => screen.includes(x));
}

const proofParts = (proof: string) =>
  plain(proof)
    .split(/\s*(?:…|\.\.\.|\||;|,|\s-\s|\n)\s*/)
    .map((x) => x.replace(/^['\s]+|['\s.]+$/g, ""))
    .filter((x) => x.length >= 3);

/**
 * A proof that is only names of things — column headings, field labels —
 * shows the place a value would be, not the value. "check it shows PO
 * numbers" passed on "PO Number", the heading over an empty column.
 */
function onlyLabels(proof: string, view: ScreenView): boolean {
  const labels = (view.labels ?? []).map((l) => plain(l).replace(/[\s*:]+$/g, "").toLowerCase()).filter(Boolean);
  const parts = proofParts(proof).map((x) => x.toLowerCase());
  return parts.length > 0 && labels.length > 0 && parts.every((x) => labels.includes(x));
}

/** The narration lines the dashboard reads (launch() in uiFlowRunner.ts). */
function tell(e: { n: number; text: string; status: "run" | "ok" | "retry" | "failed" | "info"; why?: string; url?: string; shot?: string; replayed?: boolean }) {
  e = { ...e, text: mask(e.text), ...(e.why ? { why: mask(e.why) } : {}) };
  console.log(`[explore-step] ${JSON.stringify(e)}`);
  if (e.status !== "run") console.log(`[explore] ${e.n ? `step ${e.n} — ` : ""}${e.text}${e.status === "failed" ? " ✗" : e.status === "ok" ? " ✓" : ""}`);
}

export async function explore(page: Page, opts: ExploreOptions): Promise<ExploreResult> {
  const { goal, runId, companyId } = opts;
  const confirmRisky = opts.confirmRisky ?? process.env.UI_EXPLORE_CONFIRM !== "0";
  let budget = opts.maxSteps ?? (Number(process.env.UI_EXPLORE_STEPS) || 30);
  const evidenceDir = join(process.cwd(), "evidence", runId.replace(/[^\w.-]+/g, "_"));
  mkdirSync(evidenceDir, { recursive: true });
  const base = new (class extends BasePage {})(page);

  const steps: ExploreStepResult[] = [];
  const route: RouteStep[] = [];
  const done: string[] = []; // what the model is told it did
  const told: string[] = []; // what the tester answered
  let lastResult = "Nothing yet — this is the first look at the screen.";
  let allowRisky = !confirmRisky;
  // What the tester told the run, as the model reads it (logins included, so they can be typed)…
  const toldRaw: string[] = [];
  // …and as everything else sees it: `told`, masked (results, saved routes, the session).
  const usedLogin = () => mask(goal) !== goal || toldRaw.some((t) => mask(t) !== t);
  const result = (passed: boolean, extra: Partial<ExploreResult> = {}): ExploreResult => ({
    title: mask(goal),
    goal: mask(goal),
    explored: true,
    passed,
    steps: steps.map((x) => ({ ...x, step: mask(x.step), ...(x.detail ? { detail: mask(x.detail) } : {}) })),
    told: told.map(mask),
    route: {},
    ...extra,
    ...(extra.reason ? { reason: mask(extra.reason) } : {}),
    ...(extra.proof ? { proof: mask(extra.proof) } : {}),
  });

  // Pictures are proof, not a diary (Aanya, 26 Oct: no screenshot per action or per step): an ordinary
  // action is kept as its words and address; a picture only with UI_SPOTLIGHT=1.
  const everyAction = process.env.UI_SPOTLIGHT === "1";
  const shoot = async (n: number, words: string): Promise<string | undefined> => {
    const file = `${String(n).padStart(2, "0")}-${slug(mask(words))}.png`;
    return page
      .screenshot({ path: join(evidenceDir, file), timeout: 10_000 })
      .then(() => file)
      .catch(() => undefined);
  };
  const settle = async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 3_500 }).catch(() => {});
    await page.waitForTimeout(500);
  };
  const pathNow = () => {
    try {
      const u = new URL(page.url());
      return u.pathname + u.search;
    } catch {
      return page.url();
    }
  };

  /** Ask the tester; a typed reply is kept as an instruction for the rest of the run. */
  let questions = 0;
  /**
   * The feedback loop for questions: an answer the tester gave to the same
   * question on the same screen in an earlier run is used again, and the run
   * says so. Asked a second time in one run means it did not help: the tester
   * is asked, and their new answer replaces it. Never reused: "stop", "I'll do
   * it myself" (it needs a person) and the yes to a click with effects
   * (confirm questions are never learned — that is the tester's call each run).
   */
  const reused = new Set<string>();
  const LEARNED_KINDS = new Set(["question", "stuck"]);
  const STABLE = new Set(["other", "wait", "type", "more", "lookup"]);
  const ask = async (q: Question): Promise<Answer | null> => {
    const where = pathNow();
    const k = `${where}|${q.question}`;
    if (LEARNED_KINDS.has(q.kind)) {
      const before = earlierAnswer(companyId, where, q.question);
      if (before && !reused.has(k)) {
        reused.add(k);
        const said = before.text || before.option || "";
        tell({ n: 0, text: `I asked this on this screen before — using your earlier answer: “${said}”`, status: "info" });
        told.push(`${q.question} → ${said} (your earlier answer)`);
        toldRaw.push(`${q.question} → ${said} (your earlier answer)`);
        return { option: before.option && STABLE.has(before.option) ? before.option : null, text: said };
      }
      if (before && reused.has(k)) {
        forgetAnswer(companyId, where, q.question);
        tell({ n: 0, text: "Your earlier answer to this didn't get me past it, so I'm asking again.", status: "info" });
      }
    }
    tell({ n: 0, text: `Asked you: ${q.question}`, status: "info" });
    // The screen as it is now, so the question can be answered by looking.
    const shot = await shoot(steps.length + 1, `question-${++questions}`);
    const a = await askTester({ ...q, shot });
    if (a) {
      const said = a.text || a.option || "";
      toldRaw.push(`${q.question} → ${said}`);
      told.push(`${q.question} → ${mask(said)}`);
      tell({ n: 0, text: `You answered: ${said}`, status: "info" });
      // A login typed in an answer is used for this run only: never learned for the next.
      const keep = mask(said) === said && LEARNED_KINDS.has(q.kind) && a.option !== "stop" && a.option !== "self" && !(!a.option && SAYS_STOP.test(a.text));
      if (keep) learnAnswer(companyId, where, q.question, { option: a.option, text: said });
    }
    return a;
  };
  const stopped = (a: Answer | null) => !a || a.option === "stop" || (!a.option && SAYS_STOP.test(a.text));

  /** The last thing done, and why — what a "stuck" question is about. */
  let lastWhy = "";
  let lastControl: { role: string; name: string } | undefined;
  /**
   * What the tester needs to answer "I'm stuck": what I was doing, what the
   * screen shows now (a list still loading, a field still empty), and whether
   * the app said anything. "Going round in circles (clicked Vendor Name)" on
   * its own left her asking what had actually gone wrong.
   */
  const situation = async (): Promise<{ text: string; listy: boolean }> => {
    const v = await readView(page).catch(() => null);
    const parts: string[] = [];
    if (lastWhy) parts.push(`What I was doing: ${lastWhy.replace(/\.$/, "")}.`);
    if (v?.openList) parts.push(listWords(v.openList));
    else if (lastTyped && !lastTyped.listed) parts.push(`After I typed “${lastTyped.value}” in “${lastTyped.field}”, no list of options appeared.`);
    const field = lastControl && v ? v.controls.find((x) => x.role === lastControl!.role && x.name === lastControl!.name) : undefined;
    if (field && (field.role === "combobox" || field.role === "textbox" || field.role === "searchbox")) {
      parts.push(field.value ? `“${field.name}” now shows “${field.value}”.` : `“${field.name}” is still empty.`);
    }
    parts.push(v?.messages.length ? `The app says: ${v.messages.map((m) => `“${m}”`).join(", ")}.` : "The app showed no error.");
    parts.push(`I'm on ${v?.path ?? pathNow()}${v?.headings[0] ? ` (“${v.headings[0]}”)` : ""}.`);
    return { text: parts.join(" "), listy: !!v?.openList || lastControl?.role === "combobox" || !!lastTyped };
  };
  /** Ways out of a dropdown that will not fill, offered when the trouble is one. */
  const LIST_WAYS: Option[] = [
    { id: "wait", label: "Wait longer for the list to load" },
    { id: "type", label: "Type a few letters to search the list" },
  ];
  /** The tester's answer to a stuck question, as an instruction for the model. */
  const heard = (a: Answer, context: string): string =>
    a.option === "wait"
      ? `${context} The tester says: the list is slow — use "wait" (it waits up to 20 s for the list to load) and do NOT click the field again, which closes the list.`
      : a.option === "type"
        ? `${context} The tester says: type a few letters into the field with "fill" to search the list, then click one of the options that appear.`
        : a.option === "other"
          ? `${context} The tester says: try a completely different way — not those steps.`
          : `${context} The tester says: "${a.text}". Do that.`;
  /** After an action: a dropdown that opened still loading is waited for, not clicked again. */
  /** The last thing typed and where — "no options after typing" is a finding, not a dead end. */
  let lastTyped: { field: string; value: string; listed: boolean } | undefined;
  const letListLoad = async (typedInto?: { field: string; value: string }) => {
    // After typing into a search-as-you-type field the list takes a moment to appear at all.
    const { waitedMs, list } = await waitForList(page, 20_000, typedInto ? 4_000 : 0);
    if (typedInto) lastTyped = { ...typedInto, listed: !!list && list.state === "options" };
    if (waitedMs < 1_500) return;
    const secs = Math.round(waitedMs / 1000);
    tell({ n: 0, text: list?.state === "loading" ? `The list was still loading after ${secs} s.` : `The list took ${secs} s to load — I waited for it.`, status: "info" });
  };

  /** The final failed step: where it stopped and why, with the screen it stopped on. */
  const fail = async (reason: string, words = "Stopped"): Promise<ExploreResult> => {
    const n = steps.length + 1;
    const shot = await shoot(n, "stopped");
    steps.push({ step: `${words}: ${reason}`, status: "failed", detail: reason, url: pathNow(), shot, ms: 0 });
    tell({ n, text: `${words}: ${reason}`, status: "failed", url: pathNow(), shot });
    return result(false, { reason });
  };

  /** Do one action to one element. Throws with the reason when it could not be done. */
  const perform = async (action: Decision["action"], value: string | undefined, target: Locator | null, kind?: { role: string; tag?: string }) => {
    switch (action) {
      case "click":
      case "dblclick": {
        await target!.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
        const tabs = page.context().pages().length;
        if (action === "dblclick") await target!.dblclick({ timeout: 10_000 });
        else await target!.click({ timeout: 10_000 });
        // A link that opens a new tab: carry on in this one, at that address,
        // so the live view and every later step stay on one page.
        await page.waitForTimeout(400);
        const opened = page.context().pages().slice(tabs).find((p) => p !== page);
        if (opened) {
          await opened.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
          const to = opened.url();
          await opened.close().catch(() => {});
          if (to && to !== "about:blank") {
            console.log(`[explore] that opened a new tab (${new URL(to).pathname}) — continuing there in this window`);
            await page.goto(to, { waitUntil: "domcontentloaded", timeout: 45_000 });
          }
        }
        return;
      }
      case "fill": {
        const tag = kind?.tag ?? "";
        if (tag === "input" || tag === "textarea") {
          await target!.fill(value ?? "", { timeout: 10_000 });
          return;
        }
        const inner = target!.locator("input:not([type='hidden']), textarea").first();
        if (kind?.role !== "combobox" && (await inner.count().catch(() => 0))) {
          await inner.fill(value ?? "", { timeout: 10_000 });
          return;
        }
        // A dropdown or an editable cell: open it, then type as a person would.
        await target!.click({ timeout: 10_000 });
        await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
        await page.keyboard.type(value ?? "", { delay: 25 });
        return;
      }
      case "select": {
        await target!.selectOption({ label: value ?? "" }, { timeout: 10_000 }).catch(() => target!.selectOption(value ?? "", { timeout: 10_000 }));
        return;
      }
      case "press": {
        // In a sheet cell the key belongs to the editor open in it, not the cell (focusing the cell closes it).
        if (target && kind?.role !== "cell") await target.press(value || "Enter", { timeout: 10_000 });
        else await page.keyboard.press(value || "Enter");
        return;
      }
      case "goto": {
        const to = new URL(value ?? "/", CONFIG.appUrl);
        if (to.origin !== new URL(CONFIG.appUrl).origin) throw new Error(`${to.origin} is outside the app — the explorer only opens pages of ${new URL(CONFIG.appUrl).host}`);
        await page.goto(to.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
        return;
      }
      case "scroll": {
        if (target) await target.scrollIntoViewIfNeeded({ timeout: 5_000 });
        else await page.mouse.wheel(0, value === "up" ? -700 : 700);
        return;
      }
      case "back":
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
        return;
      case "wait": {
        const { waitedMs } = await waitForList(page, 20_000);
        if (waitedMs < 500) await page.waitForTimeout(2_500);
        return;
      }
    }
  };

  /**
   * After a click that submits, publishes or approves: the app's answer. Its
   * toast ("PO Submitted — Your PO has been submitted") can fade before the
   * screen is read again, and the page can show the old status ("Draft", the
   * same Submit PO button) for seconds after — read alone, that looked like
   * nothing had happened, and the next move was to submit again. So it is
   * caught here, while the button still spins, and kept.
   */
  const appAnswer = async (): Promise<string[]> => {
    const said: string[] = [];
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      const now: { msgs: string[]; busy: boolean } = await page
        .evaluate(() => {
          const shown = (e: Element) => {
            const r = (e as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
          };
          const msgs = Array.from(document.querySelectorAll(".ant-message-notice, .ant-notification-notice, [role='alert'], .ant-form-item-explain-error, [class*='toast' i]"))
            .filter(shown)
            .map((m) => ((m as HTMLElement).innerText || "").trim().replace(/\s*\n\s*/g, " — ").replace(/\s+/g, " ").slice(0, 200))
            .filter(Boolean);
          return { msgs, busy: !!document.querySelector(".ant-btn-loading, [aria-busy='true']") };
        })
        .catch(() => ({ msgs: [] as string[], busy: false }));
      for (const m of now.msgs) if (!said.includes(m)) said.push(m);
      if (said.length && !now.busy) break;
      await page.waitForTimeout(400);
    }
    return said;
  };
  /** An answer that says it did not go through: an error, a required field, a refusal. */
  const refused = (said: string[]) => said.some((m) => /\b(error|failed|failure|required|invalid|cannot|can't|unable|not allowed|please (fill|enter|select|add|provide))\b/i.test(m));
  /** Risky clicks that went through, by control and page: one is never repeated without asking. */
  const committed = new Map<string, { words: string; said: string[] }>();
  const doneKey = (c: { role: string; name: string }) => `${c.role}:${c.name.trim().toLowerCase()}@${pathNow().split("?")[0]}`;
  let insisted = 0;

  /** Before a click that sends, publishes, approves or deletes: true to go ahead. */
  const confirm = async (words: string, c: { name: string; where?: string }, why: string): Promise<"go" | "skip" | "stop"> => {
    if (allowRisky || !RISKY.test(c.name)) return "go";
    const effect = /delete|remove|reject|cancel/i.test(c.name)
      ? "It deletes or cancels something in UAT."
      : "It changes data in UAT, and the app may email or notify the supplier.";
    const a = await ask({
      kind: "confirm",
      question: `Next I'd ${nextWords(words)}${c.where && !c.where.startsWith("row:") ? ` ${c.where}` : ""}. Go ahead?`,
      detail: `${why ? `${why}. ` : ""}${effect}`,
      options: [
        { id: "yes", label: "Yes, go ahead" },
        { id: "always", label: "Yes, and don't ask again this run" },
        STOP,
      ],
    });
    if (stopped(a)) return "stop";
    if (a!.option === "always") allowRisky = true;
    if (a!.option === "yes" || a!.option === "always") return "go";
    // Their own words instead: not a yes. The model hears them and chooses again.
    lastResult = `You did NOT do it: before "${words}" the tester said: "${a!.text}". Follow what they said.`;
    return "skip";
  };

  console.log(`[explore] goal: ${mask(goal)}`);

  // ── 1. a route that reached this goal before, followed first ──────────────
  const saved = loadRoute(companyId, goal);
  let followed = 0;
  let routeNote: string | undefined;
  if (saved) {
    const day = new Date(saved.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    tell({ n: 0, text: `Following the route I worked out on ${day} (${saved.steps.length} steps); I'll explore from wherever the screen no longer matches.`, status: "info" });
    for (const rs of saved.steps) {
      const n = steps.length + 1;
      const started = Date.now();
      let target: Locator | null = null;
      if (rs.recipe) {
        target = await findByRecipe(page, rs.recipe, 12_000);
        if (!target) {
          routeNote = `The saved route's step ${n} ("${rs.step}") is not possible here: no ${rs.recipe.role} named "${rs.recipe.name}" on this screen.`;
          tell({ n: 0, text: `The saved route stops matching here (its next step was: ${rs.step}) — exploring from this screen.`, status: "info" });
          break;
        }
      }
      if ((rs.action === "click" || rs.action === "dblclick") && rs.recipe) {
        const go = await confirm(rs.step, rs.recipe, "");
        if (go === "stop") return fail("you asked me to stop", "Stopped");
        if (go === "skip") {
          routeNote = lastResult;
          break;
        }
      }
      tell({ n, text: rs.step, status: "run", replayed: true });
      try {
        await perform(rs.action, rs.value, target, rs.recipe);
        await letListLoad();
      } catch (err) {
        routeNote = `The saved route's step "${rs.step}" failed here: ${(err as Error).message.split("\n")[0]}`;
        tell({ n: 0, text: `The saved route's next step didn't work here (${rs.step}) — exploring from this screen.`, status: "info" });
        break;
      }
      await settle();
      const shot = everyAction ? await shoot(n, rs.step) : undefined;
      steps.push({ step: rs.step, status: "ok", detail: `as on the route saved ${day}`, url: pathNow(), shot, ms: Date.now() - started, replayed: true });
      route.push({ ...rs, path: pathNow() });
      done.push(`${rs.step} → now at ${pathNow()}`);
      tell({ n, text: rs.step, status: "ok", url: pathNow(), shot, replayed: true });
      followed++;
    }
    told.push(...saved.told.map((t) => `(on the saved run) ${t}`));
    toldRaw.push(...saved.told.map((t) => `(on the saved run) ${t}`));
    lastResult = routeNote ?? `Followed all ${followed} steps of the saved route. Check whether the goal is reached.`;
  }

  /** A route that reached the goal is kept, so the next ask for it starts by following it. */
  function finish(r: ExploreResult): ExploreResult {
    r.route.followed = saved ? saved.savedAt : undefined;
    r.route.followedSteps = saved ? followed : undefined;
    if (!r.passed || !route.length) return r;
    if (byHandUsed && handLost) {
      console.log("[explore] not saving this route — part of it was done by hand and could not be kept (a code was typed, or nothing was recorded)");
      return r;
    }
    if (usedLogin()) {
      console.log("[explore] not saving this route — it used a login you typed, which is never kept");
      return r;
    }
    try {
      mkdirSync(ROUTES_DIR, { recursive: true });
      const file = routeFile(companyId, goal);
      const keep: SavedRoute = {
        goal,
        companyId,
        savedAt: new Date().toISOString(),
        runId,
        steps: route,
        told: told.filter((t) => !t.startsWith("(on the saved run)")),
      };
      writeFileSync(file, JSON.stringify(keep, null, 2));
      r.route.savedTo = file;
      console.log(`[explore] saved this route (${route.length} steps${handKept ? `, ${handKept} of them done by you by hand` : ""}) — the next "${goal}" follows it first`);
    } catch {
      /* a route that cannot be saved never changes the verdict */
    }
    return r;
  }

  // ── 2. explore: look, decide, act ──────────────────────────────────────────
  let badAnswers = 0;
  let modelDown = 0;
  let noChange = 0;
  let errorsInRow = 0;
  let proofMisses = 0;
  /** what was done where, step by step — to notice going round in circles */
  let trail: string[] = [];
  const routeHint = saved ? saved.steps.map((s, i) => `${i + 1}. ${s.step}`).join("\n") : undefined;

  /**
   * The tester has the browser (they chose "I'll do it myself", or pressed
   * Take control on the live view): wait until they hand it back, then carry
   * on from the page as they left it. Their part is a step of its own in the
   * record, and the route is not saved — it has a gap only a person filled.
   */
  let byHandUsed = false;
  /** by-hand parts whose steps could not be kept (a code was typed, or nothing was recorded) */
  let handLost = false;
  let handKept = 0;
  /** when their by-hand steps were last taken into this route (a hold before that is not part of it) */
  let handSeen = Date.now();
  const byHand = async (asked: boolean): Promise<void> => {
    if (asked) {
      // The page takes control just before it answers; give the hold a moment to land. A hold they
      // already handed back (they took the browser from the live view, then answered) counts too.
      const until = Date.now() + 8_000;
      while (!controlHeld() && handedBackAt() < handSeen && Date.now() < until) await page.waitForTimeout(250);
      if (!controlHeld() && handedBackAt() < handSeen) {
        lastResult = "The tester said they would do it themselves but did not take the browser. Carry on toward the goal.";
        return;
      }
    }
    if (controlHeld()) {
      tell({ n: 0, text: "You have the browser — I'll wait until you hand it back.", status: "info" });
      await released();
    }
    await settle();
    byHandUsed = true;
    // What they did, kept in this route: the next run repeats it instead of asking again. Everything
    // since this route last took their steps — or since this hold began, if it began before that.
    const hand = takeHandSteps(Math.min(handSeen, holdStartedAt() || handSeen));
    handSeen = Date.now();
    if (hand.secret || !hand.steps.some((h) => h.recipe)) handLost = true;
    else {
      for (const h of hand.steps) {
        route.push({ action: h.action as Decision["action"], step: h.step, recipe: h.recipe as Recipe | undefined, value: h.value, path: h.path });
        done.push(`${h.step} (by the tester) → now at ${h.path}`);
      }
      handKept += hand.steps.length;
    }
    const n = steps.length + 1;
    const shot = await shoot(n, "done-by-hand");
    const words = "You did this part yourself in the browser";
    steps.push({ step: words, status: "ok", detail: "You took the browser and handed it back; I carried on from that screen.", url: pathNow(), shot, ms: 0 });
    tell({ n, text: words, status: "ok", url: pathNow(), shot });
    noChange = 0;
    errorsInRow = 0;
    trail = [];
    lastResult =
      "The tester took the browser, did part of the journey by hand, and handed it back. Look at the SCREEN NOW afresh " +
      "and carry on toward the goal from here — do not redo what they did.";
  };

  // ── 1½. no route and no steps: ask before guessing ─────────────────────────
  // Aanya, 21 Oct: "whatever u dont have, ask the user for creds or for the
  // further steps, dont fool the user". The explorer used to start clicking on
  // its own (a Technical + RFQ case became a single-stage RFQ); it now asks the
  // tester first, and works from their steps when they give some.
  if (!saved && (opts.askFirst ?? process.env.UI_EXPLORE_ASK_FIRST !== "0")) {
    const first = await ask({
      kind: "question",
      question: `I have no ready-made steps for this: ${mask(goal)}. How should I do it?`,
      detail:
        "Tell me the steps, and any login I need (another user, a second company…): it is used for this run only, never saved or shown. " +
        "Or let me try it on my own and ask you when I'm unsure, or do it yourself in the browser.",
      options: [
        { id: "try", label: "Try it on your own — ask me when you're unsure" },
        SELF,
        { id: "stop", label: "Stop here — count it as not tested" },
      ],
    });
    if (stopped(first)) return finish(await fail(first ? "you asked me to stop before I started" : "nobody answered my first question, so I did not guess", "Not tested"));
    if (first!.option === "self") await byHand(true);
    else if (!first!.option) lastResult = "The tester told you how to do it (see WHAT THE TESTER HAS TOLD YOU): follow their steps, in order.";
  }

  for (;;) {
    if (steps.length >= budget) {
      const a = await ask({
        kind: "budget",
        question: `I've taken ${steps.length} steps and haven't reached the goal yet. Keep going?`,
        detail: `Last thing I did: ${steps[steps.length - 1]?.step ?? "—"}.`,
        options: [{ id: "more", label: "Keep going (15 more steps)" }, STOP],
      });
      if (stopped(a)) return fail(a ? "you asked me to stop" : `no answer came, after ${steps.length} steps without reaching the goal`);
      budget = steps.length + 15;
      if (a!.option !== "more") lastResult = `The tester said: "${a!.text}". Follow it.`;
    }

    // The tester pressed Take control on the live view: their turn first. A hold that began and ended
    // while an action waited (the pointer's hook pauses it) is theirs too, never dropped (Aanya, 28 Oct:
    // "my platform doesnt ignore it").
    if (controlHeld() || handedBackAt() > handSeen) await byHand(false);
    // What the tester typed to the run while it went (the session's composer): followed at this move.
    for (const t of takeTold()) {
      toldRaw.push(`the tester, while you worked: ${t}`);
      lastResult = `The tester just told you, while you were working: "${t}". Follow it now; it overrides your own plan.`;
      console.log(`[note] · You said “${mask(t).slice(0, 160)}” — following it now.`);
    }
    await base.dismissDistractions().catch(() => false);
    let view: ScreenView;
    try {
      view = await readView(page);
    } catch (err) {
      await page.waitForTimeout(1_500);
      try {
        view = await readView(page);
      } catch {
        return fail(`the screen could not be read (${(err as Error).message.split("\n")[0]})`);
      }
    }

    let raw = "";
    try {
      raw = await callModel([
        { role: "system", content: SYSTEM },
        { role: "user", content: turnPrompt({ goal, done, told: toldRaw, lastResult, route: routeHint, screen: viewText(view) }) },
      ]);
      modelDown = 0;
    } catch (err) {
      modelDown++;
      console.log(`[explore] the model did not answer (${(err as Error).message.slice(0, 160)})`);
      if (modelDown >= 3) return fail("the AI that chooses each step did not answer three times in a row, so I could not go on", "Stopped");
      await page.waitForTimeout(3_000);
      continue;
    }
    const refs = new Set(view.controls.map((c) => c.ref));
    const { decision: d, problem } = parseDecision(raw, refs);
    if (!d) {
      badAnswers++;
      console.log(`[explore] unusable answer from the model: ${problem}`);
      if (badAnswers >= 4) return fail(`the AI kept choosing steps I could not use (${problem})`, "Stopped");
      lastResult = `Your last answer could not be used: ${problem}. Answer again with JSON only, using a ref from the CURRENT list.`;
      continue;
    }
    badAnswers = 0;

    // ── the tester's turn ──
    if (d.action === "ask") {
      const a = await ask({ kind: "question", question: d.question!, detail: d.why, options: [...offered(d.options), STOP] });
      if (stopped(a)) return fail(a ? "you asked me to stop" : "no answer came to my question, so I stopped");
      lastResult = `The tester answered your question ("${d.question}"): "${a!.text}". Carry on with that.`;
      continue;
    }
    if (d.action === "stuck") {
      const why = d.why || "I can't find a way forward on this screen";
      const sit = await situation();
      const a = await ask({
        kind: "stuck",
        question: `I'm stuck: ${why.replace(/\.$/, "")}. What should I do?`,
        detail: sit.text,
        options: [...offered(d.options).slice(0, sit.listy ? 1 : 3), ...(sit.listy ? LIST_WAYS : []), SELF, STOP],
      });
      if (stopped(a)) return fail(`${why.replace(/\.$/, "")}. ${sit.text}`, "Got stuck");
      if (a!.option === "self") {
        await byHand(true);
        continue;
      }
      lastResult = heard(a!, `You were stuck (${why}).`);
      noChange = 0;
      errorsInRow = 0;
      continue;
    }
    // The check the goal asks for was made, and the app does not meet it — a
    // result, not being stuck: the run ends Failed with what was seen.
    if (d.action === "fail") {
      const n = steps.length + 1;
      const shot = await shoot(n, "check-failed");
      const why = d.why.replace(/\.$/, "");
      const words = `Checked — the app does not meet the goal: ${why}`;
      const proof = (d.proof ?? "").trim();
      steps.push({ step: words, status: "failed", detail: proof && provenOnScreen(proof, view) ? `On the screen: “${proof}”` : undefined, url: view.path, shot, ms: 0 });
      tell({ n, text: words, status: "failed", url: view.path, shot });
      return finish(result(false, { reason: why }));
    }
    if (d.action === "done") {
      const proof = (d.proof ?? "").trim();
      const labelOnly = !!proof && onlyLabels(proof, view);
      const shown = !labelOnly && provenOnScreen(proof, view);
      if (labelOnly) {
        console.log(`[explore] said the goal is reached, quoting “${proof}” — a heading or label, not a value`);
        lastResult =
          `“${proof}” is a column heading or field label — it shows where a value would be, not that one is there. ` +
          `Quote a VALUE from the screen that shows the goal is reached. If the values are not there (the column is empty, the field is blank), answer "fail" and say so.`;
        proofMisses++;
        if (proofMisses < 3) continue;
      } else if (!shown) console.log(`[explore] said the goal is reached, quoting ${proof ? `“${proof}”` : "nothing"} — not found on the screen`);
      if (shown) {
        const n = steps.length + 1;
        const shot = await shoot(n, "goal-reached");
        const words = `Checked the goal is reached — the screen shows “${proof}”`;
        steps.push({ step: words, status: "ok", detail: d.why || undefined, url: view.path, shot, ms: 0 });
        tell({ n, text: words, why: d.why, status: "ok", url: view.path, shot });
        return finish(result(true, { proof, ...(byHandUsed ? { byHand: true } : {}) }));
      }
      proofMisses++;
      if (proofMisses < 2) {
        lastResult = proof
          ? `You said the goal is reached, but "${proof}" is not on the screen. Look again: either quote words that ARE on the screen, or keep going.`
          : `You said the goal is reached but gave no proof. Quote the words on the screen that show it, or keep going.`;
        continue;
      }
      const a = await ask({
        kind: "done",
        question: "I think the goal is reached, but I can't point to anything on the screen that proves it. Is it done?",
        detail: d.why || undefined,
        options: [
          { id: "yes", label: "Yes, it's done — mark it passed" },
          { id: "more", label: "No, keep going" },
          STOP,
        ],
      });
      if (stopped(a)) return fail(a ? "you asked me to stop" : "no answer came, and I could not show the goal was reached");
      if (a!.option === "yes") {
        const n = steps.length + 1;
        const shot = await shoot(n, "goal-reached");
        const words = "The goal is reached — on your word";
        steps.push({ step: words, status: "ok", detail: "You confirmed it; I could not quote proof from the screen.", url: view.path, shot, ms: 0 });
        tell({ n, text: words, status: "ok", url: view.path, shot });
        return finish(result(true, { proof: "confirmed by the tester", ...(byHandUsed ? { byHand: true } : {}) }));
      }
      proofMisses = 0;
      lastResult = a!.option === "more" ? "The tester says the goal is NOT reached yet. Keep going." : `The tester says: "${a!.text}". Do that.`;
      continue;
    }

    // ── an action on the screen ──
    const c = d.ref !== undefined ? view.controls.find((x) => x.ref === d.ref) : undefined;
    const words = stepWords(d.action, d.value, c);
    // The same submit / publish / approve again, on the page where the app
    // already took it: not done, and not asked about, the first time — the
    // model is told it went through. Asked only if it insists.
    let againOk = false;
    if ((d.action === "click" || d.action === "dblclick") && c && RISKY.test(c.name)) {
      const prior = committed.get(doneKey(c));
      if (prior) {
        const said = prior.said.length ? ` and the app said “${prior.said.join(" · ")}”` : "";
        if (++insisted < 2) {
          tell({ n: 0, text: `Not clicking “${c.name}” again — it was already done on this page${said}.`, status: "info" });
          lastResult =
            `You ALREADY ${prior.words.charAt(0).toLowerCase()}${prior.words.slice(1)} on this page${said}. It went through — do NOT do it again. ` +
            `The page can take a few seconds to show the new status: "wait" if it still looks unchanged, then carry on toward the goal (check the result, e.g. find it in its list).`;
          await page.waitForTimeout(2_000);
          continue;
        }
        const a = await ask({
          kind: "confirm",
          question: `I already clicked “${c.name}” on this page${said}, but the page still offers it. Click it again?`,
          detail: "Clicking it again may do it a second time in UAT.",
          options: [{ id: "no", label: "No — it's done, carry on" }, { id: "yes", label: "Yes, click it again" }, STOP],
        });
        insisted = 0;
        if (stopped(a)) return fail("you asked me to stop", "Stopped");
        if (a!.option !== "yes") {
          lastResult = a!.option === "no"
            ? `The tester confirmed “${c.name}” is already done — do NOT click it again. Carry on toward the goal from here (check the result).`
            : heard(a!, `You wanted to click “${c.name}” again, though it was already done.`);
          continue;
        }
        againOk = true;
      }
    }
    if ((d.action === "click" || d.action === "dblclick") && c && !againOk) {
      const go = await confirm(words, c, d.why);
      if (go === "stop") return fail("you asked me to stop", "Stopped");
      if (go === "skip") continue;
    }
    const n = steps.length + 1;
    const started = Date.now();
    tell({ n, text: words, why: d.why, status: "run" });
    const before = view.fingerprint;
    lastWhy = d.why || lastWhy;
    lastControl = c ? { role: c.role, name: c.name } : lastControl;
    try {
      await perform(d.action, d.value, d.ref !== undefined ? refLocator(page, d.ref) : null, c);
      // Only a dropdown is expected to list options after typing; a plain search box is not.
      if (d.action !== "wait") await letListLoad(d.action === "fill" && c?.role === "combobox" ? { field: c.name || c.placeholder || c.role, value: d.value ?? "" } : undefined);
    } catch (err) {
      const msg = (err as Error).message
        .split("\n")[0]
        .replace(/^[\w.]+: /, "")
        .replace(/Timeout (\d+)ms exceeded\.?/i, (_m, ms) => `nothing happened within ${Math.round(Number(ms) / 1000)} s`)
        .replace(/\s+/g, " ")
        .slice(0, 200);
      errorsInRow++;
      tell({ n: 0, text: `${words} — didn't work (${msg})`, status: "retry" });
      lastResult = `"${words}" FAILED: ${msg}. Try another way.`;
      if (errorsInRow >= 3) {
        const sit = await situation();
        const a = await ask({
          kind: "stuck",
          question: `Three tries in a row haven't worked — the last was: ${words}. What should I do?`,
          detail: `It said: ${msg}. ${sit.text}`,
          options: [...(sit.listy ? LIST_WAYS : []), { id: "other", label: "Try a different way" }, SELF, STOP],
        });
        if (stopped(a)) return fail(`three actions in a row failed (the last was: ${words}) — ${msg}. ${sit.text}`, "Got stuck");
        errorsInRow = 0;
        if (a!.option === "self") await byHand(true);
        else lastResult = heard(a!, "Three actions in a row failed.");
      }
      continue;
    }
    errorsInRow = 0;
    const risky = (d.action === "click" || d.action === "dblclick") && !!c && RISKY.test(c.name);
    const pathBefore = pathNow().split("?")[0];
    const answered = risky ? await appAnswer() : [];
    await settle();
    const after = await readView(page).catch(() => null);
    const changed = !after || after.fingerprint !== before;
    const shot = everyAction ? await shoot(n, words) : undefined;
    steps.push({ step: words, status: "ok", detail: d.why || undefined, url: pathNow(), shot, ms: Date.now() - started });
    tell({ n, text: words, why: d.why, status: "ok", url: pathNow(), shot });
    route.push({
      action: d.action,
      step: words,
      recipe: c ? recipeOf(c) : undefined,
      value: d.value,
      path: pathNow(),
    });
    const msgs = after?.messages.length ? ` Messages now: ${after.messages.map((m) => `"${m}"`).join(", ")}.` : "";
    const saidNote = answered.length ? ` — the app said “${answered.join(" · ")}”` : "";
    done.push(`${words} → now at ${pathNow()}${saidNote}${changed || answered.length ? "" : " (nothing changed)"}`);
    const wentThrough = risky && (answered.length ? !refused(answered) : pathNow().split("?")[0] !== pathBefore);
    if (risky && c) {
      if (wentThrough) committed.set(doneKey(c), { words, said: answered });
      insisted = 0;
      if (answered.length) tell({ n: 0, text: `The app said: “${answered.join(" · ")}”`, status: refused(answered) ? "retry" : "info" });
    }

    // Going round in circles: the same step at the same place over and over,
    // each one changing the screen (so "nothing changed" never fires) and none
    // getting closer. Seen live: click a PO number (selects a cell), click an
    // icon (wrong page), back to Purchase Orders, again, for sixty steps.
    // A wait is no step toward anything; and a goal that IS waiting (a bidding window to lapse)
    // re-checks, waits, re-checks by design — D54, 23 Oct, was flagged as circling twice and
    // never finished. Neither counts here; the step budget still bounds the run.
    const waitingGoal = /\bwait\b[^.]{0,80}\b(close[sd]?|expire[sd]?|ends?|ended|lapse[sd]?|finish(es|ed)?)\b/i.test(goal);
    const counts = d.action !== "wait" && !waitingGoal;
    const sig = `${words} @ ${pathNow()}`;
    const seenBefore = trail.filter((x) => x === sig).length;
    if (counts) trail.push(sig);
    const recent = trail.slice(-8);
    const repeats = new Map<string, number>();
    for (const x of recent) repeats.set(x, (repeats.get(x) ?? 0) + 1);
    const circling = counts ? [...repeats.entries()].filter(([, k]) => k >= 3).map(([x]) => x.replace(/ @ .*$/, "")) : [];
    if (circling.length) {
      const sit = await situation();
      const a = await ask({
        kind: "stuck",
        question: `I'm going round in circles — I keep repeating the same steps (${circling.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join("; ")}) without getting closer. What should I do?`,
        detail: `${sit.text} Tell me what to do next, or where to find it.`,
        options: [...(sit.listy ? LIST_WAYS : []), { id: "other", label: "Try a completely different way" }, SELF, STOP],
      });
      if (stopped(a)) return fail(`I went round in circles (${circling.join(", ")}). ${sit.text}`, "Got stuck");
      trail = [];
      if (a!.option === "self") await byHand(true);
      else lastResult = heard(a!, `You were going in circles (${circling.join("; ")}).`);
      continue;
    }
    const again = seenBefore ? ` You already did exactly this here ${seenBefore === 1 ? "once" : `${seenBefore} times`} before — if it did not get you closer then, do something else.` : "";
    if (risky && answered.length && wentThrough) {
      noChange = 0;
      lastResult =
        `Done: ${words}. The app answered: “${answered.join(" · ")}”. It went through — do NOT do it again, ` +
        `even if the page still shows the old status for a few seconds; carry on toward the goal (check the result).${again}`;
    } else if (risky && answered.length) {
      noChange = 0;
      lastResult = `Did: ${words}, but the app answered: “${answered.join(" · ")}” — it did NOT go through. Deal with that first, then try again.`;
    } else if (changed) {
      noChange = 0;
      lastResult = `Done: ${words}. The screen changed.${msgs}${again}`;
    } else if (d.action === "wait" || d.action === "scroll") {
      lastResult = `Did: ${words}.${msgs}`;
    } else {
      noChange++;
      lastResult = `Did: ${words}, but NOTHING on the screen changed.${msgs} Don't repeat it.`;
      if (noChange >= 3) {
        const sit = await situation();
        const a = await ask({
          kind: "stuck",
          question: "The last three things I tried didn't change anything on the screen. What should I do?",
          detail: `The last was: ${words}. ${sit.text}`,
          options: [...(sit.listy ? LIST_WAYS : []), { id: "other", label: "Try a different way" }, SELF, STOP],
        });
        if (stopped(a)) return fail(`three actions in a row changed nothing on the screen (the last was: ${words}). ${sit.text}`, "Got stuck");
        noChange = 0;
        if (a!.option === "self") await byHand(true);
        else lastResult = heard(a!, "Three actions in a row changed nothing.");
      }
    }
  }

}
