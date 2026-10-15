import type { DefectGroup } from "../agents/oracle.js";
import { JOURNEY_PHASES, labelWords, type JourneyStep } from "../ui/journeySteps.js";
import { listTrails, readTrail, type JourneyTrailRecord } from "../ui/trailStore.js";
import { loadAllUiResults } from "./uiReport.js";
import { redactSecrets } from "../checks/engine.js";

/**
 * WHAT THE BROWSER PUT UP WITH, ON THE BUG SHEET.
 *
 * A journey files a finding when it stops. A journey that finishes files
 * nothing — so a run where the create screen needed five attempts to show the
 * right tab, where saving a schedule took thirty-four seconds and inviting five
 * vendors took fifteen, produced a bug sheet reading zero. Every one of those
 * is a person waiting in front of the same screen, and the only reason none of
 * it was reported is that a retry loop and a wait absorbed it.
 *
 * This reads the kept trails and turns four kinds of friction into rows:
 *
 *   waits     a step that takes long enough that a person notices
 *   retries   a screen that had to be asked more than once
 *   heals     a locator that stopped matching, or a journey that got stuck
 *   traffic   a request the app made in the background that came back 4xx/5xx
 *
 * None of it is a proven defect and none of it is presented as one: the sheet
 * gets `low` and `medium`, never `critical`, and the rationale says plainly
 * that the run passed. The point is that it happened repeatedly, in front of
 * the automation, and nobody was told.
 *
 * Grouping is by the STEP, across runs, so "the bidding window save is slow" is
 * one row seen on five runs rather than five rows — the same rule the Oracle's
 * own findings follow.
 */

/**
 * Long enough that a person notices they are waiting.
 *
 * Twelve seconds is not a number from a standard; it is where these journeys
 * stop reading as "the page loaded" and start reading as "nothing is
 * happening". It is deliberately well above the 1–3s a fast screen takes, so
 * this reports the handful of places worth looking at rather than every step.
 */
const SLOW_STEP_MS = 12_000;

/** A wait people would call bad rather than slow. */
const VERY_SLOW_MS = 30_000;

/** Phases that are the runner's own overhead, not Procol's screens. */
// The robot's own lines, not Procol's screens: its verdict ("[oracle] …"), its
// API read-back of what it built ("[verify] …") and what it learned. A gap that
// ends at one of these is the automation's time, never a wait a person sees.
const NOT_THE_PRODUCT = new Set(["playwright", "queue", "oracle", "verify", "learned"]);

/** "Set the bidding window and saved it — Procol needs this…" → the first clause. */
function shortStep(text: string): string {
  return text.split(" — ")[0].replace(/\s*\(\d+[^)]*\)\s*$/, "").trim();
}

/** The same step across runs, whatever numbers it happened to mention. */
function stepKey(step: JourneyStep): string {
  return `${step.phase}:${shortStep(step.text).toLowerCase().replace(/\d+/g, "n")}`;
}

const phaseLabel = (phase: string): string =>
  (JOURNEY_PHASES[phase] ?? { label: phase }).label.toLowerCase();

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface Seen {
  group: DefectGroup;
  /** Every measurement behind the row, used to state a median rather than a max. */
  samples: number[];
}

function bump(
  map: Map<string, Seen>,
  key: string,
  make: () => DefectGroup,
  trail: JourneyTrailRecord,
  sample: number,
  evidence: string,
): void {
  const when = trail.startedAt ?? new Date().toISOString();
  const seen = map.get(key);
  if (!seen) {
    const group = make();
    group.firstSeen = when;
    group.lastSeen = when;
    map.set(key, { group, samples: [sample] });
    return;
  }
  seen.samples.push(sample);
  seen.group.occurrences += 1;
  if (!seen.group.flows.includes(trail.flowKey)) seen.group.flows.push(trail.flowKey);
  if (!seen.group.runs.includes(trail.runId)) seen.group.runs.push(trail.runId);
  if (seen.group.evidence.length < 8) seen.group.evidence.push(evidence);
  if (when < seen.group.firstSeen) seen.group.firstSeen = when;
  if (when > seen.group.lastSeen) seen.group.lastSeen = when;
}

/** How to see it again — the journey, and the step to watch. */
const howToSee = (trail: JourneyTrailRecord, step: string): string[] => [
  `Dashboard → UI automation → tick "${trail.flowKey}" → Run.`,
  `Watch the step: ${step}`,
];

/**
 * Friction rows from the kept trails.
 *
 * `runId` scopes it to one journey's run, for the sheet opened straight after
 * a run; without it, every trail on disk is read, which is what the all-time
 * sheet wants.
 */
export function frictionDefects(runId?: string): DefectGroup[] {
  const trails = runId ? ([readTrail(runId)].filter(Boolean) as JourneyTrailRecord[]) : listTrails();
  const waits = new Map<string, Seen>();
  const retries = new Map<string, Seen>();
  const heals = new Map<string, Seen>();

  for (const trail of trails) {
    const steps = trail.steps.filter((s) => s.at != null);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const previous = steps[i - 1];

      // ── a wait ────────────────────────────────────────────────────────
      // Attributed to the step it ends at: the gap IS the work of getting
      // there. Only steps on Procol's own screens, so Playwright's start-up
      // and our own browser queue never look like product latency.
      // A gap that ends at a stuck point or a heal is the automation searching
      // for a control before giving up, not the screen making someone wait.
      const searching = step.phase === "stuck" || step.phase === "healer";
      if (previous && !searching && !NOT_THE_PRODUCT.has(step.phase) && !NOT_THE_PRODUCT.has(previous.phase)) {
        const ms = (step.at ?? 0) - (previous.at ?? 0);
        if (ms >= SLOW_STEP_MS) {
          const short = shortStep(step.text);
          bump(
            waits,
            `ui-wait:${stepKey(step)}`,
            () => ({
              defectFingerprint: `ui-wait:${stepKey(step)}`,
              kind: "product_defect",
              severity: ms >= VERY_SLOW_MS ? "medium" : "low",
              title: `"${short}" keeps the user waiting ${secs(ms)}`,
              rationale:
                `Measured in a real browser, on ${phaseLabel(step.phase)}. The journey passed — ` +
                `this is not a failure, it is how long someone sits in front of this screen before ` +
                `anything happens.`,
              flows: [trail.flowKey],
              runs: [trail.runId],
              occurrences: 1,
              firstSeen: trail.startedAt,
              lastSeen: trail.startedAt,
              evidence: [`${trail.flowKey} · ${secs(ms)} · run ${trail.runId}`],
              reproduction: howToSee(trail, step.text),
              actionable: true,
            }),
            trail,
            ms,
            `${trail.flowKey} · ${secs(ms)} · run ${trail.runId}`,
          );
        }
      }

      // ── a retry ───────────────────────────────────────────────────────
      // The automation asked the same screen for the same thing more than
      // once and got a different answer each time. That is the screen
      // disagreeing with itself, not a flaky test.
      if (step.repeats && step.repeats > 1 && !NOT_THE_PRODUCT.has(step.phase)) {
        const short = shortStep(step.text);
        bump(
          retries,
          `ui-retry:${stepKey(step)}`,
          () => ({
            defectFingerprint: `ui-retry:${stepKey(step)}`,
            kind: "product_defect",
            severity: "medium",
            title: `"${short}" only settles after ${step.repeats} attempts`,
            rationale:
              `The screen did not start in the state it reports, so the automation asked again ` +
              `${step.repeats} times until it matched. A person does this by clicking until it ` +
              `looks right. The run passed, so no pass/fail count anywhere shows this.`,
            flows: [trail.flowKey],
            runs: [trail.runId],
            occurrences: 1,
            firstSeen: trail.startedAt,
            lastSeen: trail.startedAt,
            evidence: [`${trail.flowKey} · ${step.repeats} attempts · run ${trail.runId}`, step.raw],
            reproduction: howToSee(trail, step.text),
            actionable: true,
          }),
          trail,
          step.repeats,
          `${trail.flowKey} · ${step.repeats} attempts · run ${trail.runId}`,
        );
      }

      // ── a heal, or a journey that got stuck ───────────────────────────
      // Filed as OUR defect: a locator that stopped matching is maintenance
      // on this suite. It is on the sheet because the cause is often a screen
      // that moved, and because a suite leaning on the healer is one release
      // away from red.
      // A stuck point during sign-in that the run then fell back from: the
      // control was there (a greyed-out Login button, usually because no code
      // was typed), so "the locator stopped matching" would be untrue. And one
      // later in the journey with the browser still on /login means the
      // sign-in had not really worked, not that the step's screen moved.
      const next = steps[i + 1];
      const atSignIn = step.phase === "stuck" && next?.phase === "login" && /falling back/i.test(next.raw);
      const onLoginPage = step.phase === "stuck" && !atSignIn && /^\[stuck\] recorded ".+?" on \S*\/login\b/i.test(step.raw);
      if (atSignIn || onLoginPage) {
        bump(
          heals,
          atSignIn ? "ui-signin:login-screen" : `ui-signin:lost:${stepKey(step)}`,
          () => ({
            defectFingerprint: atSignIn ? "ui-signin:login-screen" : `ui-signin:lost:${stepKey(step)}`,
            kind: "automation_defect",
            severity: atSignIn ? "low" : "medium",
            title: atSignIn
              ? "Couldn't sign in on the login screen, so the run used a saved session"
              : `Not signed in: the journey was still on the login page at ${labelWords(step.raw.match(/recorded "(.+?)"/)?.[1] ?? "a step")}`,
            rationale: atSignIn
              ? `The automation reached the code box and could not finish signing in. The run carried on ` +
                `with a saved session, so the login screen itself went untested. A greyed-out Login button ` +
                `usually means no one-time code is saved for the account, not that the screen changed.`
              : `The browser was still on the login page, so the sign-in before this step had not really ` +
                `worked and this step's own screen was never reached.`,
            flows: [trail.flowKey],
            runs: [trail.runId],
            occurrences: 1,
            firstSeen: trail.startedAt,
            lastSeen: trail.startedAt,
            evidence: [`${trail.flowKey} · run ${trail.runId}`, (atSignIn ? next.text : step.text)],
            reproduction: howToSee(trail, atSignIn ? next.text : step.text),
            actionable: true,
          }),
          trail,
          1,
          `${trail.flowKey} · run ${trail.runId}`,
        );
      } else if (step.phase === "healer" || step.phase === "stuck") {
        bump(
          heals,
          `ui-heal:${stepKey(step)}`,
          () => ({
            defectFingerprint: `ui-heal:${stepKey(step)}`,
            kind: "automation_defect",
            severity: step.phase === "stuck" ? "medium" : "low",
            title:
              step.phase === "stuck"
                ? `The journey got stuck: ${shortStep(step.text)}`
                : `A step needed the AI healer: ${shortStep(step.text)}`,
            rationale:
              `The written locator no longer matched what was on screen. The run survived it, ` +
              `but the suite is carrying a step it can no longer perform on its own — and the ` +
              `usual reason a locator stops matching is that the screen changed.`,
            flows: [trail.flowKey],
            runs: [trail.runId],
            occurrences: 1,
            firstSeen: trail.startedAt,
            lastSeen: trail.startedAt,
            evidence: [`${trail.flowKey} · run ${trail.runId}`, step.raw],
            reproduction: howToSee(trail, step.text),
            actionable: true,
          }),
          trail,
          1,
          `${trail.flowKey} · run ${trail.runId}`,
        );
      }
    }
  }

  // Once every run is in, a wait is described by its MEDIAN rather than by
  // whichever run happened to create the row — one slow afternoon should not
  // define the number a reader quotes.
  for (const { group, samples } of waits.values()) {
    const mid = median(samples);
    const worst = Math.max(...samples);
    group.severity = mid >= VERY_SLOW_MS ? "medium" : "low";
    group.title = `${group.title.split('" keeps')[0]}" keeps the user waiting ${secs(mid)}`;
    if (samples.length > 1) {
      group.rationale +=
        ` Seen on ${samples.length} runs: typically ${secs(mid)}, worst ${secs(worst)}.`;
    }
  }
  for (const { group, samples } of retries.values()) {
    if (samples.length > 1) {
      group.rationale += ` Seen on ${samples.length} runs, up to ${Math.max(...samples)} attempts.`;
    }
  }

  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...retries.values(), ...heals.values(), ...waits.values()]
    .map((s) => s.group)
    .sort(
      (a, b) =>
        order.indexOf(a.severity) - order.indexOf(b.severity) ||
        b.occurrences - a.occurrences ||
        a.title.localeCompare(b.title),
    );
}

/**
 * Requests the app itself made that came back 4xx or 5xx, on runs that passed.
 *
 * The journey drives the screens; the screens call the API. When one of those
 * calls fails the page usually carries on — a widget renders empty, a list
 * loads short — and the journey, which is looking at the thing it asked for,
 * never notices. The run goes green with a 500 in its own network log.
 *
 * A 5xx here is the same defect the API suite would file, found from the other
 * side, and it is filed at the same weight: a server error is always a defect.
 * A 4xx is not — plenty are the app asking a question it is allowed to be told
 * no to — so those are reported low and described as what they are.
 */
export function trafficDefects(runId?: string): DefectGroup[] {
  const results = loadAllUiResults().filter((r) => !runId || r.runId === runId);
  const byRoute = new Map<string, DefectGroup>();

  for (const result of results) {
    for (const raw of result.failedRequests ?? []) {
      // Redacted here as well as at capture: a result file written before the
      // capture-side redaction existed still holds a token in its path.
      const call = { ...raw, path: redactSecrets(raw.path) ?? raw.path };
      const key = `ui-http:${call.method}:${call.path}:${call.status}`;
      const when = call.at ?? result.startedAt ?? new Date().toISOString();
      const line = `${result.flowKey} · ${call.method} ${call.path} → ${call.status} · run ${result.runId}`;
      const existing = byRoute.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.flows.includes(result.flowKey)) existing.flows.push(result.flowKey);
        if (!existing.runs.includes(result.runId)) existing.runs.push(result.runId);
        if (existing.evidence.length < 8) existing.evidence.push(line);
        if (when < existing.firstSeen) existing.firstSeen = when;
        if (when > existing.lastSeen) existing.lastSeen = when;
        continue;
      }
      const server = call.status >= 500;
      byRoute.set(key, {
        defectFingerprint: key,
        kind: "product_defect",
        severity: server ? "high" : "low",
        title: `${call.method} ${call.path} answered ${call.status} behind the screen`,
        rationale: server
          ? `A screen in the ${result.flowKey} journey made this call and the server broke on it. ` +
            `The journey ${result.status === "passed" ? "still passed" : "stopped"}, because the page ` +
            `carried on without whatever this call was for — which is how a 500 reaches a user as a ` +
            `blank panel rather than as an error.`
          : `A screen in the ${result.flowKey} journey made this call and was refused. Not every 4xx ` +
            `is a defect — some are the app asking something it is allowed to be told no to — but the ` +
            `page asked for it while a person was looking at it.`,
        flows: [result.flowKey],
        runs: [result.runId],
        occurrences: 1,
        firstSeen: when,
        lastSeen: when,
        evidence: [line],
        reproduction: [
          `Dashboard → UI automation → tick "${result.flowKey}" → Run.`,
          `Watch the network log for ${call.method} ${call.path}.`,
        ],
        actionable: true,
      });
    }
  }

  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...byRoute.values()].sort(
    (a, b) =>
      order.indexOf(a.severity) - order.indexOf(b.severity) || b.occurrences - a.occurrences,
  );
}

/**
 * An event that is not what the journey built.
 *
 * The read-back (`verifyEvent.ts` in the UI suite) fails the journey when a
 * check it could read disagrees, so these normally arrive with a red run. They
 * are filed separately anyway, because the interesting row is not "the journey
 * broke" — it is WHICH promise the product did not keep: the title it accepted
 * and then changed, the second round that did not survive publishing, the
 * vendors that were invited and cannot see it.
 */
export function verificationDefects(runId?: string): DefectGroup[] {
  const results = loadAllUiResults().filter((r) => !runId || r.runId === runId);
  const byCheck = new Map<string, DefectGroup>();

  for (const result of results) {
    for (const c of result.verified?.checks ?? []) {
      if (c.ok || c.unread) continue;
      const key = `ui-verify:${result.flowKey}:${c.what.toLowerCase().replace(/\d+/g, "n")}`;
      const when = result.startedAt ?? new Date().toISOString();
      const line = `${result.flowKey} · wanted ${c.expected}, found ${c.actual} · run ${result.runId}`;
      const existing = byCheck.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.runs.includes(result.runId)) existing.runs.push(result.runId);
        if (existing.evidence.length < 8) existing.evidence.push(line);
        if (when > existing.lastSeen) existing.lastSeen = when;
        continue;
      }
      byCheck.set(key, {
        defectFingerprint: key,
        kind: "product_defect",
        severity: "high",
        title: `${c.what} — wanted ${c.expected}, got ${c.actual}`,
        rationale:
          `The browser journey built this event through the screens and then read it back through ` +
          `${c.via === "db" ? "the database" : "the API"}. What came back is not what was asked for. ` +
          `Every screen along the way behaved: this is only visible because the run checks the ` +
          `record afterwards instead of trusting the last page it saw.`,
        flows: [result.flowKey],
        runs: [result.runId],
        occurrences: 1,
        firstSeen: when,
        lastSeen: when,
        evidence: [line],
        reproduction: [
          `Dashboard → UI automation → tick "${result.flowKey}" → Run.`,
          `Open the event it creates and compare: ${c.what}.`,
        ],
        actionable: true,
      });
    }
  }
  return [...byCheck.values()];
}

/** Everything a browser run should put on the sheet, passing or not. */
export function uiRunDefects(runId?: string): DefectGroup[] {
  return [...verificationDefects(runId), ...trafficDefects(runId), ...frictionDefects(runId)];
}
