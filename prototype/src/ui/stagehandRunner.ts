/**
 * STAGEHAND UI RUNNER — the self-healing browser layer (Phase 1).
 *
 * Stagehand wraps Playwright with an LLM so we describe actions in plain English
 * ("click the Login button") instead of brittle CSS selectors. When the UI
 * changes, it re-finds elements by MEANING, so small front-end changes don't
 * break the test — that's the self-healing.
 *
 * We run it FULLY LOCAL: a real, visible Chromium (no Browserbase account) so you
 * can watch. The LLM is Gemini Flash (free tier), configured in config/settings.ts.
 *
 * Grounded in the installed Stagehand v4 API:
 *   localBrowser.launch({headless}) -> StagehandBrowser
 *   Stagehand.create({browser, model:{modelName, apiKey}}) -> stagehand
 *   page = stagehand.browser.context.pages()[0]
 *   page.goto / page.observe / page.extract / page.act / page.screenshot
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import { STAGEHAND } from "../../config/settings.js";
import type { UiStepEvent, UiEmit, UiCheckResult } from "./browserRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const PROCOL_TEST = join(PROTO, "..", "procol test");
const SHOTS_DIR = join(PROTO, "public", "shots");
loadEnv({ path: join(PROTO, ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

const LOGIN_URL = "https://cpanel.ag-ri.in";

/** Do we have the Gemini key needed for the AI primitives? */
export function hasStagehandKey(): boolean {
  const k = process.env[STAGEHAND.apiKeyEnvVar];
  return !!k && k.trim().length > 0;
}

interface StagehandHandle {
  stagehand: Stagehand;
  page: any; // Stagehand Page (goto/observe/extract/act/screenshot)
  dispose: () => Promise<void>;
}

/**
 * Launch a local, visible Chromium and attach Stagehand + the Gemini model.
 * Throws a friendly error if the key is missing (the AI steps can't run without it).
 */
export async function makeStagehand(): Promise<StagehandHandle> {
  if (!hasStagehandKey()) {
    throw new Error(
      `No ${STAGEHAND.apiKeyEnvVar} set. Get a free key at aistudio.google.com → "Get API key", ` +
        `paste it into prototype/.env as ${STAGEHAND.apiKeyEnvVar}=..., and retry.`,
    );
  }
  // SH_HEADLESS=1 forces headless (handy for fast debugging); default = watchable.
  const headless = process.env.SH_HEADLESS === "1" ? true : STAGEHAND.headless;
  const browser = await localBrowser.launch({ headless });
  // v4's create() spins up an in-browser service-worker (RPC) before returning.
  // Guard it with a timeout so a bad local init fails fast (with the v3 fallback
  // hint) instead of hanging ~2 minutes.
  const stagehand = await withTimeout(
    Stagehand.create({
      browser,
      model: { modelName: STAGEHAND.model as any, apiKey: process.env[STAGEHAND.apiKeyEnvVar] },
      cache: STAGEHAND.useCache,
      selfHeal: true,
      // Procol is a live SPA whose network never fully goes quiet — bound the
      // "wait for the DOM to settle" so observe/act can't wait forever.
      domSettleTimeoutMs: 8_000,
    }),
    60_000,
    `Stagehand v4 create() timed out initializing its local service-worker. ` +
      `If this persists, pin the simpler local build:  npm i @browserbasehq/stagehand@3.7.3  ` +
      `(v3 local mode is plain Playwright + direct LLM calls).`,
  ).catch(async (e) => {
    await browser.close().catch(() => {});
    throw e;
  });
  const ctx: any = stagehand.browser.context;
  const pages = ctx.pages();
  const page = pages[0] ?? (await ctx.newPage());
  const dispose = async () => {
    await stagehand.close().catch(() => {});
  };
  return { stagehand, page, dispose };
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

function saveShot(bytes: Uint8Array, name: string): string {
  if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });
  const file = `sh_${name}_${Date.now()}.png`;
  writeFileSync(join(SHOTS_DIR, file), Buffer.from(bytes));
  return `/shots/${file}`;
}

/**
 * PHASE-1 PROOF. Opens the real Procol login and exercises each Stagehand
 * primitive once, streaming what it does. This proves the whole self-healing
 * pipeline works end-to-end before we build the real journeys (Phase 2).
 */
export async function runStagehandProof(emit: UiEmit): Promise<UiCheckResult[]> {
  const step = (s: Omit<UiStepEvent, "agent">) => emit({ agent: "UI", ...s });
  const results: UiCheckResult[] = [];
  const t0 = Date.now();

  step({ status: "reasoning", title: `Launching local Chromium + Stagehand (${STAGEHAND.model})…` });
  const { stagehand, page, dispose } = await makeStagehand();
  try {
    step({ status: "reasoning", title: `Navigating to the Procol login (${LOGIN_URL})` });
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    step({ status: "shot", title: "Login page loaded", data: { screenshot: saveShot(await page.screenshot(), "login") } });

    // The AI primitives live on the Stagehand instance (they target the active page).
    // 1) observe() — plan an action WITHOUT doing it (preview + a stable selector)
    step({ status: "reasoning", title: "observe(): find the phone / mobile number input" });
    const observed: any = await withTimeout(
      stagehand.observe("the phone or mobile number input field"),
      45_000,
      "observe() timed out (45s)",
    );
    const found = Array.isArray(observed) ? observed.length : observed ? 1 : 0;
    results.push(mkResult("SH-OBSERVE-01", "observe() locates the phone input", found > 0, `${found} candidate(s)`));

    // 2) extract() — read structured data off the page against a schema
    step({ status: "reasoning", title: "extract(): read the page's primary heading / prompt" });
    const extracted: any = await withTimeout(
      stagehand.extract(
        "the main heading or the label prompting the user to log in",
        z.object({ heading: z.string() }) as any, // Stagehand bundles its own zod version
      ),
      45_000,
      "extract() timed out (45s)",
    );
    const heading = extracted?.heading ?? extracted?.data?.heading ?? "";
    results.push(mkResult("SH-EXTRACT-01", "extract() reads the login heading", !!heading, heading || "(empty)"));

    // 3) act() — perform one natural-language action (self-healing selector)
    step({ status: "reasoning", title: "act(): type a sample number into the phone field" });
    let acted = true, actMsg = "typed";
    try {
      await withTimeout(
        stagehand.act("type 9812345678 into the phone or mobile number field"),
        45_000,
        "act() timed out (45s)",
      );
    } catch (e: any) {
      acted = false;
      actMsg = e?.message ?? String(e);
    }
    step({ status: "shot", title: "After act()", data: { screenshot: saveShot(await page.screenshot(), "after-act") } });
    results.push(mkResult("SH-ACT-01", "act() types into the phone field", acted, actMsg));

    step({ status: "done", title: `Proof complete — ${results.filter((r) => r.pass).length}/${results.length} primitives worked`, data: { results } });
  } finally {
    await dispose();
  }

  function mkResult(id: string, scenario: string, pass: boolean, observed: string): UiCheckResult {
    step({ status: "check", title: `${pass ? "✓" : "✗"} ${scenario}`, data: { id, pass, observed } });
    return { id, scenario, expected: "accept", layer: "ui", pass, observed, durationMs: Date.now() - t0 };
  }

  return results;
}
