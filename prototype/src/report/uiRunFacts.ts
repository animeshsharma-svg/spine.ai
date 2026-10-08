import { plainReason, type JourneyStep } from "../ui/journeySteps.js";
import type { JourneyTrailRecord } from "../ui/trailStore.js";
import { listTrails } from "../ui/trailStore.js";

/**
 * WHAT ELSE THE TRAIL ALREADY KNOWS.
 *
 * A journey narrates far more than the report used to print. Every line it
 * writes carries a fact ("template applied: BuyBuy Template (of 38 offered)"),
 * a cost (the timestamp) or a struggle (five attempts at the same tab), and all
 * three were being rendered as one flat list of ticks — true, complete, and
 * silent about the three questions a reader actually has after a green run:
 *
 *   what did it leave behind, so I can go and look at it?
 *   where did two minutes go?
 *   did the app make it work for that pass?
 *
 * Nothing here is new capture. It is the same trail, read four ways. Every
 * extractor is anchored on the raw line the test printed rather than on the
 * humanised text, because the raw line is a format the journey controls and
 * the humanised one is prose that may be rewritten for readability.
 */

export interface Fact {
  label: string;
  value: string;
  /** Rendered as a link when the value is somewhere you can go. */
  href?: string;
}

const rawOf = (steps: JourneyStep[], re: RegExp): RegExpMatchArray | null => {
  for (const step of steps) {
    const hit = step.raw.match(re);
    if (hit) return hit;
  }
  return null;
};

const allRaw = (steps: JourneyStep[], re: RegExp): RegExpMatchArray[] =>
  steps.map((s) => s.raw.match(re)).filter((m): m is RegExpMatchArray => !!m);

/** "rfp, rfq" → "a technical round (RFP) then a pricing round (RFQ)" */
function stagesInWords(list: string): string {
  const names: Record<string, string> = {
    rfp: "a technical round (RFP)",
    rfq: "a pricing round (RFQ)",
    auction: "a live auction",
  };
  const parts = list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => names[s] ?? s);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} then ${parts[parts.length - 1]}`;
}

/**
 * The record this run created, as something a reader can go and open.
 *
 * A green tick says the journey finished; it does not say what now exists in
 * Procol because of it. These are the choices the automation made on the way —
 * the type it built, the template it picked, who it invited — which is both the
 * proof it did the real thing and the checklist for anyone verifying by hand.
 */
export function whatItLeft(
  trail: JourneyTrailRecord | null,
  result: { url?: string; companyId?: number | null } | undefined,
): Fact[] {
  const steps = trail?.steps ?? [];
  const facts: Fact[] = [];

  // How it got in. A run that used the login screen tested the login screen;
  // one that injected a session did not, and the reader should know which.
  const onScreen = rawOf(steps, /\[login\] signed in — the app opened/i);
  const phone = rawOf(steps, /\[login\] .*phone ending (\d+)/i);
  const fellBack = rawOf(steps, /\[login\] falling back to the saved web-console session[^—]*— (.+)$/i);
  const skipped = rawOf(steps, /\[login\] skipped the login screen — (.+?)(?: yet)?, so it/i);
  // A run from before the fallback checked itself said "signed in" and then
  // got stuck with the browser still on /login: it never got in either.
  const fellBackAt = steps.findIndex((s) => /^\[login\] falling back/i.test(s.raw));
  const lostAfter =
    fellBackAt >= 0 && steps.slice(fellBackAt + 1).some((s) => /^\[stuck\] recorded ".+?" on \S*\/login\b/i.test(s.raw));
  const lockedOut = rawOf(steps, /\[login\] the saved session did not get in either/i) || lostAfter;
  if (lockedOut)
    facts.push({ label: "Signed in", value: "no — the login screen failed and the saved session was sent back to the login page" });
  else if (skipped)
    facts.push({ label: "Signed in", value: `with a saved session — the login screen was skipped because ${skipped[1]}` });
  else if (fellBack)
    facts.push({ label: "Signed in", value: `with a saved session — couldn't sign in on the login screen (${plainReason(fellBack[1])})` });
  else if (onScreen) facts.push({ label: "Signed in", value: `on the login screen${phone ? `, phone ending ${phone[1]}` : ""}` });

  const stages = rawOf(steps, /stages composed: \[([^\]]*)\]/i);
  if (stages) facts.push({ label: "Event built as", value: stagesInWords(stages[1]) });

  const items = rawOf(steps, /building (\d+) line item\(s\)/i);
  if (items) facts.push({ label: "Line items", value: items[1] });

  // A two-stage journey applies the technical template first and the pricing
  // one last; a single-stage journey applies one. Labelling by position rather
  // than by name keeps that true without the report having to know either.
  const templates = allRaw(steps, /template applied: (.+?)(?: \(of (\d+) offered\))?$/i);
  if (templates.length === 1) {
    facts.push({
      label: "Template",
      value: `${templates[0][1]}${templates[0][2] ? ` (of ${templates[0][2]} offered)` : ""}`,
    });
  } else if (templates.length > 1) {
    facts.push({ label: "Technical template", value: templates[0][1] });
    facts.push({
      label: "Pricing template",
      value: `${templates[templates.length - 1][1]}${
        templates[templates.length - 1][2] ? ` (of ${templates[templates.length - 1][2]} offered)` : ""
      }`,
    });
  }

  const rfi = rawOf(steps, /RFI sections: (\d+) · templates applied: (\d+) · questions typed: (\d+)/i);
  if (rfi)
    facts.push({
      label: "Technical form",
      value: `${rfi[1]} section(s), ${rfi[2]} template(s) applied, ${rfi[3]} question(s) typed`,
    });

  const evaluator = rawOf(steps, /evaluator selected: (.+)$/i);
  if (evaluator) facts.push({ label: "Evaluator", value: evaluator[1] });

  const window = rawOf(steps, /schedule duration set to (\d+) min/i);
  if (window) facts.push({ label: "Bidding window", value: `${window[1]} minutes` });

  const invited = rawOf(steps, /(\d+) participant\(s\) invited/i);
  if (invited) facts.push({ label: "Vendors invited", value: invited[1] });

  if (result?.url) {
    const id = result.url.match(/\/project\/([^/?#]+)/)?.[1];
    facts.push({ label: "Where it lives", value: id ? `Project ${id}` : result.url, href: result.url });
  }
  if (result?.companyId) facts.push({ label: "In account", value: String(result.companyId) });

  return facts;
}

export interface TimeSlice {
  /** The step the time was spent reaching. */
  label: string;
  ms: number;
  /** Share of the whole run, 0–100. */
  share: number;
}

/**
 * Where the run's minutes went.
 *
 * The gap between two narrated steps is the work done to get from one to the
 * other, so it is attributed to the step it ends at. This is the only place
 * the platform measures Procol's own screens under a real browser, and a
 * thirty-second wait on one save is a fact about the product that no API
 * timing will ever show.
 */
export function whereTimeWent(trail: JourneyTrailRecord | null, top = 4): TimeSlice[] {
  const steps = (trail?.steps ?? []).filter((s) => s.at != null);
  if (steps.length < 2) return [];
  const total = trail?.durationMs || steps[steps.length - 1].at! || 1;
  const slices: TimeSlice[] = [];
  for (let i = 1; i < steps.length; i++) {
    const ms = (steps[i].at ?? 0) - (steps[i - 1].at ?? 0);
    if (ms <= 0) continue;
    slices.push({ label: steps[i].text, ms, share: Math.round((ms / total) * 100) });
  }
  return slices.sort((a, b) => b.ms - a.ms).slice(0, top);
}

export interface Friction {
  what: string;
  detail: string;
}

/**
 * Where the app made the automation work for it.
 *
 * None of this failed the run — which is exactly why it is worth writing down.
 * Five attempts at the same set of tabs is not a flaky test, it is a screen
 * that does not open in the state it says it is in, and the only reason it
 * looks like nothing is that the automation absorbed it.
 */
export function frictionOf(
  trail: JourneyTrailRecord | null,
  observations: Array<{ kind: string; detail: string }> = [],
): Friction[] {
  const out: Friction[] = [];
  for (const step of trail?.steps ?? []) {
    if (step.repeats && step.repeats > 1)
      out.push({
        what: `${step.repeats} attempts`,
        detail: step.text,
      });
    else if (step.kind === "warn")
      out.push({ what: "Had to work around it", detail: step.text });
    if (step.phase === "healer")
      out.push({ what: "The AI healer stepped in", detail: step.text });
    if (step.phase === "stuck") out.push({ what: "Stuck", detail: step.text });
  }
  for (const o of observations) out.push({ what: o.kind, detail: o.detail });
  return out;
}

export interface Comparison {
  /** One sentence per thing that changed since this journey last ran. */
  lines: string[];
  /** e.g. "passed the last 4 of 5 runs" */
  streak?: string;
}

const secs = (ms: number): string =>
  ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`;

/**
 * What is different about this run.
 *
 * A suite that runs the same journey every day produces the same page every
 * day, and a reader stops looking at it. The trails are already kept, so the
 * report can answer the one question a repeat run raises: has anything changed
 * since the last time — is it slower, did it fight harder, is this a streak or
 * a first pass?
 */
export function comparedWithLast(trail: JourneyTrailRecord | null): Comparison {
  if (!trail) return { lines: [] };
  const history = listTrails()
    .filter((t) => t.flowKey === trail.flowKey)
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  const previous = history.find((t) => t.runId !== trail.runId && (t.startedAt ?? "") < (trail.startedAt ?? ""));

  const runs = history.slice(0, 5);
  const passed = runs.filter((t) => t.exitCode === 0).length;
  const streak =
    runs.length > 1
      ? `This journey has passed ${passed} of its last ${runs.length} runs.`
      : undefined;

  if (!previous) {
    return { lines: ["This is the first run of this journey the platform has kept."], streak };
  }

  const lines: string[] = [];
  const delta = (trail.durationMs ?? 0) - (previous.durationMs ?? 0);
  if (Math.abs(delta) >= 5_000) {
    lines.push(
      `${secs(Math.abs(delta))} ${delta > 0 ? "slower" : "faster"} than last time — ` +
        `${secs(trail.durationMs ?? 0)} against ${secs(previous.durationMs ?? 0)}.`,
    );
  } else {
    lines.push(`About the same length as last time — ${secs(trail.durationMs ?? 0)}.`);
  }

  if (previous.exitCode !== trail.exitCode) {
    lines.push(
      trail.exitCode === 0
        ? "It broke last time and worked this time."
        : "It worked last time and broke this time.",
    );
  }

  // Retries are the signal that moves when the product changes underneath us.
  const attempts = (t: JourneyTrailRecord) =>
    t.steps.reduce((n, s) => n + (s.repeats && s.repeats > 1 ? s.repeats : 0), 0);
  const now = attempts(trail);
  const before = attempts(previous);
  if (now !== before) {
    lines.push(
      now > before
        ? `The automation retried more than last time — ${now} attempts against ${before}.`
        : `The automation retried less than last time — ${now} attempts against ${before}.`,
    );
  }

  /**
   * A step that appears or disappears is the journey itself changing shape.
   *
   * Playwright's own lines are excluded and durations are stripped before
   * comparing: "authenticate (6.2s)" against "authenticate (5.5s)" differs on
   * every single run, and reporting the runner's stopwatch as a change in the
   * journey is noise that would bury the one line that matters.
   */
  const names = (t: JourneyTrailRecord) =>
    new Set(
      t.steps
        .filter((s) => s.kind === "ok" && s.phase !== "playwright")
        .map((s) => s.text.replace(/\s*\((?:[\d.]+(?:ms|s|m)|\d+m\s*[\d.]+s)\)\s*$/i, "").trim()),
    );
  const nowNames = names(trail);
  const beforeNames = names(previous);
  const added = [...nowNames].filter((n) => !beforeNames.has(n));
  const gone = [...beforeNames].filter((n) => !nowNames.has(n));
  if (added.length) lines.push(`New this run: ${added.slice(0, 2).join("; ")}.`);
  if (gone.length) lines.push(`Did not happen this run: ${gone.slice(0, 2).join("; ")}.`);

  return { lines, streak };
}
