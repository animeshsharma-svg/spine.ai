import { test } from "@playwright/test";

/**
 * JOURNEY STEPS — how a multi-call flow tells the report what it is doing, one
 * business step at a time.
 *
 * `declareCase()` (see `caseSpec.ts`) describes a whole case in one sentence.
 * That is right for a case that makes one request, and wrong for a journey:
 * "create a two-stage event and publish it" is four requests, and when it goes
 * red the only thing anyone wants to know is WHICH of the four broke — adding
 * the event, attaching the pricing round, or publishing it.
 *
 * So a journey wraps each of its stages in `step()`. Each one states, before it
 * runs, what it is about to do and what should come back; afterwards it carries
 * its own verdict and the calls it made. The report then renders the case as
 * the numbered sequence it really is:
 *
 *   4    Create a two-stage event (RFP → auction) and publish it       Fail
 *   4.1  Create the draft event                                        Pass
 *   4.2  Add the technical round (RFP)                                 Pass
 *   4.3  Add the auction round (price-based)                           Pass
 *   4.4  Publish the event                                             Fail  ← 500
 *
 * Two deliberate constraints:
 *
 *   - Steps are only recorded inside a test that called `startJourney()`. The
 *     same flow helpers are reused by fixtures in `beforeAll` hooks and by
 *     one-off scripts; without the opt-in, a fixture building an event would
 *     staple its steps onto whichever unrelated case Playwright attributes the
 *     hook to.
 *   - Steps never nest. A `step()` reached while another is running is treated
 *     as part of it, because a reader wants one flat sequence, not a tree.
 *
 * Transport is Playwright annotations, for the same reason `caseSpec.ts` uses
 * them: they cross the worker→reporter process boundary already attached to
 * the right test, and they keep the order they were pushed in.
 */

export type StepStatus = "passed" | "failed";

/** One business step of a journey, as it reaches the reporter. */
export interface StepRecord {
  /** unique within the run: joins a step to the calls it made */
  id: string;
  /** 1-based position within its case */
  index: number;
  /** what this step does, in plain English */
  name: string;
  /** what should come back, stated before the step runs */
  expected: string;
  status: StepStatus;
  /** what happened, where the flow can say it better than the traffic can */
  detail?: string;
  /** first line of the error, for a step that threw */
  errorMessage?: string;
  startedAt: string;
  durationMs: number;
}

/** The slice a recorded API call carries, so the report can group calls. */
export interface ActiveStep {
  id: string;
  index: number;
  name: string;
}

/** The annotation type `step` records are transported under. */
export const STEP_ANNOTATION = "step";

interface JourneyState {
  testId: string;
  taken: number;
  active?: ActiveStep;
}

/** Per-worker, and a worker runs one test at a time, so one slot is enough. */
let journey: JourneyState | undefined;

function currentTestId(): string | undefined {
  try {
    return test.info().testId;
  } catch {
    return undefined; // outside the runner — a script reusing a flow
  }
}

/**
 * Opts the current test into step-by-step reporting. Call it once, after
 * `declareCase()`, before the flow starts.
 */
export function startJourney(): void {
  const testId = currentTestId();
  if (!testId) return;
  journey = { testId, taken: 0 };
}

/** The step a call being recorded right now belongs to, if any. */
export function activeStep(): ActiveStep | undefined {
  if (!journey) return undefined;
  // A stale journey from the previous test in this worker must not capture
  // this test's calls.
  if (journey.testId !== currentTestId()) return undefined;
  return journey.active;
}

function pushRecord(record: StepRecord): void {
  try {
    test.info().annotations.push({
      type: STEP_ANNOTATION,
      description: JSON.stringify(record),
    });
  } catch {
    // Not inside the runner. The flow still ran; nothing to annotate.
  }
}

/**
 * Runs one business step of a journey and records it.
 *
 * `expected` is stated here, at the call site, before the body runs — the same
 * rule the whole report is built on: an expectation written after the answer
 * arrives is a transcript.
 *
 * Failure is re-thrown untouched, so the step is evidence about the run and
 * never changes it. The steps after a failed one simply never happen, and the
 * report says so rather than inventing verdicts for them.
 */
export async function step<T>(
  name: string,
  expected: string,
  body: () => Promise<T>,
): Promise<T> {
  const testId = currentTestId();
  const live = journey && journey.testId === testId;

  // Not a journey, or already inside a step: run the body plainly. Nesting a
  // step inside a step would split one sequence into a tree.
  if (!live || journey!.active) return body();

  const state = journey!;
  const index = ++state.taken;
  const id = `${state.testId}#${index}`;
  state.active = { id, index, name };

  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const result = await body();
    state.active = undefined;
    pushRecord({
      id,
      index,
      name,
      expected,
      status: "passed",
      detail: detailFor(id),
      startedAt,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    state.active = undefined;
    pushRecord({
      id,
      index,
      name,
      expected,
      status: "failed",
      detail: detailFor(id),
      errorMessage: firstLine(error),
      startedAt,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

const details = new Map<string, string>();

function detailFor(id: string): string | undefined {
  const detail = details.get(id);
  details.delete(id);
  return detail;
}

/**
 * Records what this step actually produced, in the flow's own words — the
 * event id it created, the status it came back as.
 *
 * Only for facts the HTTP traffic cannot state on its own. Everything else is
 * left to the report, which reads the real status code, message and timing off
 * the recorded calls; a sentence a flow writes about itself is only as honest
 * as the flow.
 */
export function stepResult(detail: string): void {
  const active = activeStep();
  if (active) details.set(active.id, detail);
}

function firstLine(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message
      .split("\n")
      .find((line) => line.trim())
      ?.trim()
      .replace(/^Error:\s*/, "") || undefined
  );
}

/** Reads `step` annotations back into records, in the order they were pushed. */
export function parseSteps(
  annotations: Array<{ type: string; description?: string }>,
): StepRecord[] {
  const steps: StepRecord[] = [];
  for (const annotation of annotations) {
    if (annotation.type !== STEP_ANNOTATION || !annotation.description) continue;
    try {
      steps.push(JSON.parse(annotation.description) as StepRecord);
    } catch {
      // A malformed record is not worth failing a report over.
    }
  }
  return steps.sort((a, b) => a.index - b.index);
}
