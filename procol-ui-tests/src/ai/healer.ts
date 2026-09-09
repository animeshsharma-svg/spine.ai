/**
 * THE AI HEALER — self-healing for steps whose selectors have drifted.
 *
 * WHY THIS EXISTS
 * The event journeys kept dying on hardcoded selectors. Four separate ones were
 * found and patched in a single flow, and each fix only moved the failure:
 *   - "Create Event" turned out to be a split control
 *   - the evaluator picker renders rows matching no expected test-id
 *   - a page-wide input selector kept grabbing a DISABLED vendor field
 * Patching selectors one at a time is a losing game, so when the deterministic
 * path fails we ask an LLM to find the element by MEANING instead.
 *
 * WHY NOT STAGEHAND (tried first, documented so nobody repeats it)
 * Stagehand v4 drives the page through its own Chrome EXTENSION. Playwright's
 * test runner launches a NON-persistent context, and Chromium only honours
 * --load-extension in a persistent context — so the extension never loads and
 * connect() fails with "This Chrome build does not support
 * Extensions.loadUnpacked". Making it work would mean rebuilding the whole
 * Playwright setup around launchPersistentContext.
 * We get the same capability far more simply: Playwright already exposes the
 * page's accessibility tree via ariaSnapshot(), which is exactly the input an
 * LLM needs to pick an element. So we read the tree, ask Gemini which node
 * matches the intent, and act with plain Playwright. No extension, no CDP, no
 * second browser, same self-healing behaviour.
 *
 * THE DESIGN (deterministic-first, always)
 *   1. Try the normal Playwright locators — fast, free, repeatable.
 *   2. Only on failure, ask the model which element to use.
 * The AI never runs on the happy path, so a green run costs nothing extra.
 *
 * Enable with:  UI_AI_HEAL=1 GOOGLE_API_KEY=... npx playwright test ...
 * Without those it is inert: heal() returns false and the test fails exactly as
 * before, so this can never make a passing run worse.
 */
import type { Locator, Page } from "@playwright/test";

const MODEL = process.env.UI_AI_MODEL ?? "gemini-flash-lite-latest";
const API = "https://generativelanguage.googleapis.com/v1beta/models";
/** Minimum model confidence before we let the AI touch the page. */
const ACT_THRESHOLD = Number(process.env.UI_AI_MIN_CONFIDENCE ?? "0.75");

/** Is the healer switched on and usable? */
export function healerEnabled(): boolean {
  return process.env.UI_AI_HEAL === "1" && !!process.env.GOOGLE_API_KEY;
}

/** What the model is asked to return: how to find the element, and what to do. */
interface Plan {
  strategy: "role" | "text" | "placeholder" | "label";
  role?: string;
  name?: string;
  text?: string;
  action: "click" | "fill";
  value?: string;
  reason?: string;
  /** 0-1. We refuse to act below ACT_THRESHOLD — a wrong action is worse than a clean failure. */
  confidence?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/** Ask Gemini which element satisfies the instruction, given the a11y tree. */
async function planStep(snapshot: string, instruction: string): Promise<Plan | null> {
  const key = process.env.GOOGLE_API_KEY!;
  const prompt = `You are helping a browser test recover from a broken selector.

Below is the ACCESSIBILITY TREE of the current page (Playwright ariaSnapshot format).
Decide which single element satisfies this instruction, and what to do with it.

INSTRUCTION: ${instruction}

ACCESSIBILITY TREE:
${snapshot.slice(0, 18000)}

Reply with ONLY a JSON object, no prose, no markdown fence:
{"strategy":"role|text|placeholder|label","role":"<aria role if strategy=role>","name":"<accessible name>","text":"<visible text if strategy=text>","action":"click|fill","value":"<text to type if action=fill>","confidence":0.0-1.0,"reason":"<one short line>"}

RULES — read carefully, the most important one is the last:
- Prefer strategy "role" with the EXACT accessible name shown in the tree.
- Choose an element that is ENABLED and visible; never a disabled input.
- If the instruction says to type, use action "fill" and put the text in "value".
- "confidence" must reflect how certain you are that this element is THE ONE the
  instruction describes — not merely that it is a plausible element to use.
- NEVER SUBSTITUTE A DIFFERENT ELEMENT. If the tree does not clearly contain the
  element described, reply exactly {"strategy":"none"}. Acting on the wrong
  element corrupts the test and is far worse than doing nothing. For example, if
  asked for a "line item product search box" and the tree only offers a project
  title field, that is NOT a match — reply {"strategy":"none"}.`;

  const res = await fetch(`${API}/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const j: any = await res.json();
  const raw: string = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const plan = JSON.parse(m[0]) as Plan;
  return plan?.strategy && (plan as any).strategy !== "none" ? plan : null;
}

/** Turn the model's plan into a real Playwright locator. */
function locatorFor(page: Page, plan: Plan): Locator | null {
  const exact = (s?: string) => (s ? new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : undefined);
  switch (plan.strategy) {
    case "role":
      if (!plan.role) return null;
      return plan.name
        ? page.getByRole(plan.role as any, { name: exact(plan.name)! })
        : page.getByRole(plan.role as any);
    case "text":
      return plan.text ? page.getByText(exact(plan.text)!) : null;
    case "placeholder":
      return plan.name || plan.text ? page.getByPlaceholder(exact(plan.name ?? plan.text)!) : null;
    case "label":
      return plan.name ? page.getByLabel(exact(plan.name)!) : null;
    default:
      return null;
  }
}

/**
 * Ask the AI to perform one step described in plain language.
 * Returns true when it actually acted, false otherwise — callers treat false as
 * "the step genuinely could not be done".
 */
export async function heal(page: Page, instruction: string): Promise<boolean> {
  if (!healerEnabled()) return false;
  try {
    console.log(`[healer] deterministic step failed → asking AI: "${instruction}"`);
    const snapshot = await withTimeout(page.locator("body").ariaSnapshot(), 15_000, "ariaSnapshot");
    const plan = await withTimeout(planStep(snapshot, instruction), 40_000, "gemini");
    if (!plan) {
      console.log("[healer] AI found nothing in the accessibility tree that matches");
      // Dump what the page DOES offer — when the AI says the element is absent,
      // that is a real diagnostic about the page state, not just an AI miss.
      if (process.env.UI_AI_DUMP === "1") {
        console.log("[healer] --- accessibility tree at failure ---");
        console.log(snapshot.slice(0, 4000));
        console.log("[healer] --- end tree ---");
      }
      return false;
    }
    console.log(`[healer] AI plan: ${JSON.stringify(plan)}`);

    // A wrong action is worse than a clean failure: the model once typed into
    // "Enter the title of the project" when asked for the line-item search box,
    // silently corrupting the event. Refuse anything it is not sure about.
    const confidence = typeof plan.confidence === "number" ? plan.confidence : 0;
    if (confidence < ACT_THRESHOLD) {
      console.log(
        `[healer] refusing to act — confidence ${confidence} < ${ACT_THRESHOLD}. ` +
          `Failing cleanly instead of touching the wrong element.`,
      );
      return false;
    }

    const loc = locatorFor(page, plan);
    if (!loc) {
      console.log("[healer] AI returned a plan we cannot turn into a locator");
      return false;
    }
    // Only ever act on something enabled and visible.
    const target = loc.first();
    await target.waitFor({ state: "visible", timeout: 8_000 });
    if (plan.action === "fill") {
      await target.fill(plan.value ?? "", { timeout: 8_000 });
    } else {
      await target.click({ timeout: 8_000 });
    }
    await page.waitForTimeout(600); // let the SPA react before the caller asserts
    console.log(`[healer] AI completed: "${instruction}"`);
    return true;
  } catch (e: any) {
    console.log(`[healer] AI could not do it: ${e?.message ?? e}`);
    return false;
  }
}

/**
 * Run a deterministic step; if it throws or reports failure, fall back to the AI.
 *
 *   await tryThenHeal(page, () => page.getByTestId("x").click(),
 *                     "click the Add evaluator button");
 */
export async function tryThenHeal(
  page: Page,
  deterministic: () => Promise<unknown>,
  instruction: string,
): Promise<boolean> {
  try {
    const r = await deterministic();
    if (r !== false) return true;
  } catch {
    /* fall through to the AI */
  }
  return heal(page, instruction);
}

/** Nothing persistent to close — kept so callers don't need to change. */
export async function closeHealer(): Promise<void> {
  /* no-op: the healer holds no browser or session of its own */
}
