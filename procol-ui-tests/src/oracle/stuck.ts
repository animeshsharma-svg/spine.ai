import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
export const STUCK_DIR = join(here, "..", "..", "stuck");

/**
 * WHERE THE AUTOMATION GOT STUCK, with enough evidence to fix it.
 *
 * A run that dies on a locator is only useful if it says which step, on which
 * screen, having tried what — and shows what the page was actually offering at
 * that moment. Without the accessibility tree the next person reproduces the
 * whole journey by hand just to see the screen; with it, the fix is usually
 * obvious from the report alone.
 *
 * Each report is also the input to teaching: the dashboard's fix button reopens
 * that URL and asks the AI to find the element, then writes the answer into the
 * learned-locator store so the step becomes deterministic.
 */
export interface StuckReport {
  id: string;
  /** The step's label — the stable identity a learned locator is filed under. */
  label: string;
  step?: string;
  flowKey?: string;
  url: string;
  message: string;
  /** What the automation looked for, in order. */
  triedCandidates: string[];
  /** The page's accessibility tree, trimmed. This is what makes it fixable. */
  accessibilityTree: string;
  screenshot?: string;
  healerTried: boolean;
  healerSaid?: string;
  createdAt: string;
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

export async function recordStuck(
  page: Page,
  opts: {
    label: string;
    step?: string;
    flowKey?: string;
    message: string;
    triedCandidates?: string[];
    healerTried?: boolean;
    healerSaid?: string;
  },
): Promise<StuckReport | null> {
  try {
    mkdirSync(STUCK_DIR, { recursive: true });
    const id = `${slug(opts.flowKey ?? "run")}__${slug(opts.label)}__${Date.now().toString(36)}`;

    // The accessibility tree is the single most useful artefact here: it is
    // what the AI reads to heal, and what a human needs to see to write a
    // better locator.
    const tree = await page
      .locator("body")
      .ariaSnapshot()
      .then((t) => t.slice(0, 20_000))
      .catch(() => "(could not read the accessibility tree)");

    const shot = join(STUCK_DIR, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

    const report: StuckReport = {
      id,
      label: opts.label,
      step: opts.step,
      flowKey: opts.flowKey,
      url: page.url(),
      message: opts.message,
      triedCandidates: opts.triedCandidates ?? [],
      accessibilityTree: tree,
      screenshot: shot,
      healerTried: opts.healerTried ?? false,
      healerSaid: opts.healerSaid,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(STUCK_DIR, `${id}.json`), JSON.stringify(report, null, 2));
    console.log(`[stuck] recorded "${opts.label}" on ${report.url} → stuck/${id}.json`);
    return report;
  } catch (e) {
    // Never let diagnostics break a run.
    console.log(`[stuck] could not record the stuck point: ${(e as Error).message}`);
    return null;
  }
}
