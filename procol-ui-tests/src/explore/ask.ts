import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * ASKING THE TESTER, MID-RUN.
 *
 * A question goes out as one stdout line, "[ask] {json}", on the same pipe the
 * step log and the live frames already use (launch() in uiFlowRunner.ts turns
 * it into an "ask" event in the session chat). The answer comes back as a file
 * the server writes when the tester clicks an option or types a reply
 * (POST /api/explore/answer): .plans/<run>-answer-<n>.json. A file, not a
 * socket, so nothing has to stay connected while a person thinks; the browser
 * keeps streaming frames meanwhile.
 *
 * Every question offers its options AND lets the tester type anything else,
 * the way a chat assistant asks. An option has an id the explorer acts on
 * ("stop", "yes", "always"...) and a label the tester reads.
 */

export interface Option {
  id: string;
  label: string;
}

export interface Question {
  /** question: the explorer needs a choice · stuck: it cannot go on · confirm: before a step with effects · budget: many steps already */
  kind: "question" | "stuck" | "confirm" | "budget" | "done";
  question: string;
  options: Option[];
  /** a line under the question: what it is about to do, or why it stopped */
  detail?: string;
  /** a screenshot of the screen as it is asked (file under evidence/<run>/) */
  shot?: string;
}

export interface Answer {
  /** the option picked, or null when the tester typed their own reply */
  option: string | null;
  text: string;
}

let asked = 0;

/** Ask and wait. Null when there is nobody to ask (not started from the dashboard) or no answer came in time. */
export async function askTester(q: Question, timeoutMs = Number(process.env.UI_EXPLORE_ASK_MS) || 15 * 60_000): Promise<Answer | null> {
  const dir = process.env.UI_EXPLORE_DIR;
  const runId = process.env.QA_RUN_ID;
  if (!dir || !runId) return null;
  const n = ++asked;
  const file = join(dir, `${runId}-answer-${n}.json`);
  rmSync(file, { force: true });
  console.log(`[ask] ${JSON.stringify({ runId, n, ...q })}`);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (existsSync(file)) {
      try {
        const a = JSON.parse(readFileSync(file, "utf8"));
        const text = String(a?.text ?? "").trim();
        const option = a?.option ? String(a.option) : null;
        if (text || option) {
          console.log(`[ask-answered] ${JSON.stringify({ n, option, text: text.slice(0, 300) })}`);
          return { option, text: text || q.options.find((o) => o.id === option)?.label || "" };
        }
      } catch {
        /* half-written: read it again next tick */
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log(`[ask-answered] ${JSON.stringify({ n, option: null, text: "", timedOut: true })}`);
  return null;
}

/** Options the model offered, as ids the tester's pick comes back with. */
export function offered(labels: string[] | undefined): Option[] {
  return (labels ?? []).filter(Boolean).slice(0, 4).map((label, i) => ({ id: `opt${i + 1}`, label }));
}

/**
 * A typed reply that means "stop", and only that. The whole reply must be the
 * stop: "Stop clicking New, the rows are there already" is an instruction,
 * and reading its first word as "stop the run" ended a live run that had
 * just been told how to carry on.
 */
export const SAYS_STOP =
  /^\s*(?:no[,.!]?\s*)?(?:(?:please\s+)?(?:stop|cancel|abort|quit|end)(?:\s+(?:it|here|now|the run|this|please|there))*|leave it|mark (?:it )?(?:as )?failed)[\s.!]*$/i;
