/**
 * A BROWSER JOURNEY, READ AS A JOURNEY.
 *
 * The UI tests narrate themselves to stdout — `[create-event] stages round 2:
 * on screen [rfp], want [rfq]` — which is the right information in the wrong
 * register. This turns each line into a step: a phase, a verdict and plain
 * words, with the original line kept for when something breaks.
 *
 * It lives on the server because two readers need exactly the same steps: the
 * page watching a run live, and the report written afterwards. Parsing it in
 * both places would let the two drift, and then "where it stopped" would mean
 * one thing on screen and another in the report.
 */

export interface JourneyStep {
  /** Which part of the journey this line belongs to. */
  phase: string;
  /** How it went: a fact, a success, a worry, a failure. */
  kind: "info" | "ok" | "warn" | "bad";
  /** The line in plain words. */
  text: string;
  /** Exactly what the test printed. */
  raw: string;
  /** Set on lines that repeat while the journey retries, so they fold into one. */
  collapseKey?: string;
  /** How many times a folded line repeated. */
  repeats?: number;
  /** Milliseconds since the run started, when known. */
  at?: number;
}

export const JOURNEY_PHASES: Record<string, { label: string; icon: string }> = {
  login: { label: "Signing in", icon: "🔑" },
  erfx: { label: "Preparing the line items", icon: "📋" },
  "create-event": { label: "Creating the event", icon: "🧾" },
  "event-detail": { label: "On the event", icon: "🔎" },
  award: { label: "Awarding", icon: "🏆" },
  bid: { label: "The vendors bid", icon: "💬" },
  control: { label: "You had the browser", icon: "🖐" },
  /** A step the tester did in the browser after a journey asked: not tested by the run. */
  "by-hand": { label: "Done by you, not tested", icon: "🖐" },
  /** The Decathlon suite (procol-qa-platform/decath): each case's steps and its verdict. */
  decath: { label: "Decathlon checks", icon: "🛍" },
  plan: { label: "Running the plan", icon: "🗺" },
  pick: { label: "Choosing an event", icon: "🎯" },
  healer: { label: "Healing a broken step", icon: "🤖" },
  learned: { label: "Learned a locator", icon: "🧠" },
  stuck: { label: "Stuck", icon: "🚧" },
  oracle: { label: "Verdict", icon: "⚖️" },
  verify: { label: "Checking what it built", icon: "🔍" },
  "po-to-bill": { label: "Purchase order to bill", icon: "🧾" },
  queue: { label: "Waiting for the browser", icon: "⏳" },
  playwright: { label: "Playwright", icon: "▶" },
};

/** What a locator label means on screen, for the ones the sign-in uses. */
const LABEL_WORDS: Record<string, string> = {
  "login-submit": "the Login button",
  "send-otp": "the Send OTP button",
  "otp-field": "the one-time code box",
  phone: "the phone number box",
  "create-event-trigger": "the Create Event button",
};
export const labelWords = (label: string): string => LABEL_WORDS[label] ?? `"${label.replace(/[-_]+/g, " ")}"`;
const seconds = (ms: string): string => `${Math.round(Number(ms) / 1000)} seconds`;

/**
 * A locator's failure in plain words. The raw message names the helper and
 * its candidates ("clickFirst [login-submit]: no candidate was clickable
 * within 10000ms. Last error: n/a"), which is for whoever fixes the locator;
 * the step says what a person would have seen. A fill's message also carries
 * the value it typed, which can be a phone or a code, so it is dropped here.
 */
export function plainReason(reason: string): string {
  let hit = reason.match(/^clickFirst(?: \[(.+?)\])?: no candidate was clickable within (\d+)ms/);
  if (hit) return `${hit[1] ? labelWords(hit[1]) : "the control"} could not be pressed within ${seconds(hit[2])}`;
  hit = reason.match(/^expectFirst(?: \[(.+?)\])?: none of \d+ candidate locator\(s\) became (?:visible|actionable) within (\d+)ms/);
  if (hit) return `${hit[1] ? labelWords(hit[1]) : "the expected control"} never appeared within ${seconds(hit[2])}`;
  hit = reason.match(/^fillFirst(?: \[(.+?)\])?: could not fill .* within (\d+)ms/);
  if (hit) return `could not type into ${hit[1] ? labelWords(hit[1]) : "the field"} within ${seconds(hit[2])}`;
  hit = reason.match(/^Login did not complete \(still on \/login\)\. (?:Reason: (.+)|No error surfaced\.)$/);
  if (hit) return `the app did not let us in${hit[1] ? ` (it said: ${hit[1].replace(/\.\s*$/, "")})` : ""}`;
  return reason.replace(/\.\s*$/, "");
}

/**
 * Wording that reads as a sentence rather than a log line.
 *
 * A few of these carry one clause of plain-English "why", not just "what" —
 * added where the raw line uses automation jargon (a "drawer", a "pick") that
 * means nothing to someone who has never read this code, and where the real
 * explanation is short enough to say once without turning the report into an
 * essay. Everything else stays a plain restatement of the fact.
 */
function humanise(rest: string): string {
  const m = (re: RegExp, fn: (h: RegExpMatchArray) => string): string | null => {
    const hit = rest.match(re);
    return hit ? fn(hit) : null;
  };
  return (
    // "[pick] ✗ “Event” — why": the mark is the step's kind; the words say the rest.
    m(/^✓ (.+)$/, (h) => `Using ${h[1]}`) ||
    m(/^✗ (.+)$/, (h) => `Passed over ${h[1]}`) ||
    m(/^· (.+)$/, (h) => h[1].charAt(0).toUpperCase() + h[1].slice(1)) ||
    // "[login] …" — the sign-in, narrated by the login page as a person sees it.
    m(/^showing the login screen — signing in as (.+?) \(phone ending (\d+)\)(?: with (.+))?$/i, (h) =>
      `Opening the login screen to sign in as ${h[1]}, phone ending ${h[2]}${h[3] ? `, with ${h[3]}` : ""}`) ||
    m(/^opened the sign-in page$/i, () => "The sign-in page is open") ||
    m(/^typed the phone number ending (\d+) and asked for a one-time code$/i, (h) =>
      `Typed the phone number ending ${h[1]} and asked for a one-time code`) ||
    m(/^the one-time code field appeared$/i, () => "The code field appeared — the app sent the one-time code") ||
    m(/^typed the code and pressed Login$/i, () => "Typed the code and pressed Login") ||
    m(/^signed in — the app opened (.+)$/i, (h) => `Signed in — the app opened ${h[1]}`) ||
    m(/^the login screen did not let us in(?: — the app said: (.+))?$/i, (h) =>
      `The login screen did not let us in${h[1] ? ` — the app said: ${h[1]}` : ""}`) ||
    m(/^falling back to the saved web-console session so the journey can still run — (.+)$/i, (h) =>
      `Couldn't sign in on the login screen — ${plainReason(h[1])}. Trying the saved session instead`) ||
    // Not a failure: with no login code for the account the login screen
    // cannot be finished, so the saved session is used — said as what
    // happened, in grey (kindOf below), not as an orange warning (15 Oct).
    // It used to say the operator's code "only comes by SMS"; it doesn't — UAT
    // takes the client's code for it, which runs now use (dbLogin.ts).
    m(/^skipped the login screen — (.+?)\. Falling back to the saved session$/i, (h) => {
      const op = h[1].match(/^(.+?) is signed into through an operator's account \(phone ending (\d+)\), and that account has no UAT login code/i);
      return op
        ? `Signed in with the saved session, not the login screen — ${op[1]} is used through Procol's operator account (phone ending ${op[2]}), and the run had no login code for that account`
        : `Signed in with the saved session, not the login screen — ${h[1]}`;
    }) ||
    m(/^this company's signed-in user has no phone on record.*$/i, () =>
      "This company's signed-in user has no phone on record, so the configured buyer's phone was used") ||
    // An optional confirm pop-up that never came (the vendor bid's
    // "submit-confirm" before 15 Oct): not stuck — there was nothing to confirm.
    m(/^recorded "((?:technical-)?submit-confirm)" on \S+ → stuck\/\S+$/i, () =>
      "No confirm pop-up appeared after Submit, so there was nothing to confirm") ||
    // "[stuck] recorded "login-submit" on https://… → stuck/run__….json"
    m(/^recorded "(.+?)" on \S+ → stuck\/\S+$/i, (h) =>
      `Got stuck at ${labelWords(h[1])} — saved a screenshot of the page so the step can be fixed`) ||
    m(/^stages round \d+: on screen \[([^\]]*)\], want \[([^\]]*)\]$/i, (h) =>
      `Setting up the event type — Procol's create screen doesn't start on the right one, so it adds ` +
      `and removes tabs until it matches. Wanted: ${h[2] || "none"} · showing: ${h[1] || "none"}`) ||
    m(/^stages composed: \[([^\]]*)\]$/i, (h) => `The event is now set up as: ${h[1]}`) ||
    // "[verify] It is live: wanted active, found active — matches"
    m(/^(.+?): wanted (.+?), found (.+?) — matches$/i, (h) => `${h[1]} — ${h[3]}, as asked`) ||
    m(/^(.+?): wanted (.+?), found (.+?) — DOES NOT MATCH$/i, (h) =>
      `${h[1]} — asked for ${h[2]}, found ${h[3]}`) ||
    m(/^(.+?): wanted (.+?), found .+? — could not check — (.+)$/i, (h) =>
      `${h[1]} — could not be checked: ${h[3]}`) ||
    m(/^template applied: (.+?)(?: \(of (\d+) offered\))?$/i, (h) =>
      `Picked the pricing template "${h[1]}" — this decides what columns the pricing sheet has next` +
      `${h[2] ? ` (chosen from ${h[2]} available)` : ""}`) ||
    m(/^template "(.+?)" not offered \(have: (.+?)\).*$/i, (h) =>
      `The template "${h[1]}" wasn't on offer, so the automation took the first one instead: ${h[2]}`) ||
    m(/^sheet filled for (\d+) line item\(s\)$/i, (h) => `Filled in the pricing sheet for ${h[1]} item(s)`) ||
    m(/^sheet shows (\d+) line-item row\(s\), asked for (\d+).*$/i, (h) =>
      `The sheet only had room for ${h[1]} row(s) though ${h[2]} were asked for — filling all ${h[1]}`) ||
    m(/^building (\d+) line item\(s\).*$/i, (h) => `Preparing ${h[1]} product line item(s) to add`) ||
    m(/^schedule saved$/i, () => "Set the bidding window and saved it — Procol needs this before the event can go live") ||
    m(/^schedule duration set to (\d+) min$/i, (h) => `Set the bidding window to ${h[1]} minutes`) ||
    m(/^(\d+) participant\(s\) already on the event$/i, (h) => `${h[1]} vendor(s) were already invited`) ||
    m(/^(\d+) participant\(s\) invited in [\d.]+s$/i, (h) => `Invited ${h[1]} vendor${h[1] === "1" ? "" : "s"} to bid`) ||
    m(/^invited by name: (.+)$/i, (h) => `Invited by name: ${h[1]}`) ||
    m(/^no vendor matched "(.+?)"$/i, (h) => `Couldn't find a vendor named "${h[1]}" to invite`) ||
    m(/^could not click a line-item option for "(.+?)".*$/i, (h) =>
      `Tried to add "${h[1]}" to the line items three times and the screen never responded — this one may need adding by hand`) ||
    m(/^could not confirm the pick for "(.+?)".*$/i, (h) =>
      `Added "${h[1]}" to the line items — the screen didn't clearly confirm it right away, but that's normal ` +
      `here; it gets double-checked once the pricing sheet is saved`) ||
    m(/^allocated (\d+)\/(\d+) line item\(s\) to (\d+)\/(\d+) vendor\(s\)$/i, (h) =>
      `Split the line items across vendors: ${h[1]} of ${h[2]} items covered, ${h[3]} of ${h[4]} vendors used`) ||
    m(/^AI completed: "(.+?)"$/i, (h) => `The AI stepped in and did it: ${h[1]}`) ||
    m(/^AI could not do it: (.+)$/i, (h) => `The AI tried to step in but couldn't — ${h[1]}`) ||
    m(/^deterministic step failed . asking AI: "(.+?)"$/i, (h) =>
      `The usual way of doing this didn't work, so the AI is being asked to try: ${h[1]}`) ||
    m(/^(\d+)\/(\d+) (.+?) ([✓✗])\s*(.*)$/, (h) =>
      `Step ${h[1]} of ${h[2]}: ${h[3]}${h[5] ? ` — ${h[5]}` : ""}`) ||
    rest.charAt(0).toUpperCase() + rest.slice(1)
  );
}

/** Warnings read as warnings; a step that failed reads as failed. */
function kindOf(tag: string, rest: string): JourneyStep["kind"] {
  if (tag === "plan") return /✗/.test(rest) ? "bad" : /✓/.test(rest) ? "ok" : "info";
  // A read-back check states its own verdict at the end of the line.
  if (tag === "verify") {
    if (/DOES NOT MATCH/.test(rest)) return "bad";
    if (/could not check/i.test(rest)) return "warn";
    return "ok";
  }
  if (tag === "stuck") return /recorded "(?:technical-)?submit-confirm"/i.test(rest) ? "info" : "bad";
  // "[pick] ✓|✗|· …" (runPlan's open_event): passing an event over is a note, not a failure.
  if (tag === "pick") return /^✓/.test(rest) ? "ok" : /^✗/.test(rest) ? "warn" : "info";
  if (tag === "healer") {
    // The AI fixer is an extra: its key being refused is a note, not a failure.
    if (/AI help is off/i.test(rest)) return "info";
    if (/could not/i.test(rest)) return "bad";
    // Asking for help means a step broke — green would hide that.
    if (/asking AI/i.test(rest)) return "warn";
    return "ok";
  }
  if (tag === "learned") return "ok";
  // The tester's own clicks and typing while they held the browser (liveControl.ts).
  if (tag === "control") return /could not/i.test(rest) ? "warn" : "info";
  if (tag === "by-hand") return "warn";
  if (tag === "decath") return /✓ PASS/.test(rest) ? "ok" : /✗ FAIL/.test(rest) ? "bad" : /⊘ NOT TESTED/.test(rest) ? "warn" : "info";
  // The vendors' bids on the event the journey published (vendorBids.ts).
  if (tag === "bid") {
    if (/none of them|could not/i.test(rest)) return "bad";
    if (/is submitted|is signed in|opened the event|filled/i.test(rest)) return "ok";
    return "info";
  }
  // The sign-in says how it went in its own words.
  if (tag === "login") {
    if (/did not get in either/i.test(rest)) return "bad";
    if (/did not let us in|falling back/i.test(rest)) return "warn";
    // Skipped on purpose (no code to type for this account): information, not a warning.
    if (/skipped the login screen/i.test(rest)) return "info";
    if (/^signed in/i.test(rest)) return "ok";
    return "info";
  }
  if (/(failed|could not|never appeared|not offered|no vendor matched|is disabled|not in the|would not open|no selectable)/i.test(rest))
    return "warn";
  if (/(composed|applied|filled|saved|submitted|invited|allocated|completed)/i.test(rest)) return "ok";
  return "info";
}

/**
 * One log line to one step, or nothing.
 *
 * Lines with no phase tag are Playwright's own; only its start and its verdict
 * are worth a row, and the rest stays in the raw output.
 */
export function parseJourneyLine(line: string): JourneyStep | null {
  // Strip ANSI colour codes — Playwright writes them even when piped. It
  // matches the escape byte, not a bare bracket: "[rfq]" is content.
  const clean = String(line).replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
  if (!clean.trim()) return null;

  const tagged = clean.match(/^\s*\[([a-z-]+)\]\s*(.+)$/i);
  if (tagged) {
    const tag = tagged[1].toLowerCase();
    const rest = tagged[2];
    if (!JOURNEY_PHASES[tag]) return null;
    return {
      phase: tag,
      kind: kindOf(tag, rest),
      text: humanise(rest),
      raw: clean,
      // Stage composition retries noisily; one row that counts the rounds says
      // the same thing without scrolling the real steps off the screen.
      collapseKey: /^stages round/i.test(rest) ? "stages-round" : undefined,
    };
  }

  const header = clean.match(/^UI run . client "(.+?)" \(COMPANY_ID=(\d+)\)\s*.\s*(.+)$/);
  if (header)
    return {
      phase: "playwright",
      kind: "info",
      text: `Client ${header[1]} (${header[2]}) · ${header[3]}`,
      raw: clean,
    };

  const running = clean.match(/^Running (\d+) tests? using (\d+) worker/i);
  if (running)
    return { phase: "playwright", kind: "info", text: `Playwright starting — ${running[1]} test(s)`, raw: clean };

  const verdict = clean.match(/^\s*(\d+ (?:passed|failed|skipped)[^)]*\))\s*$/i);
  if (verdict)
    return {
      phase: "playwright",
      kind: /failed/i.test(verdict[1]) ? "bad" : "ok",
      text: verdict[1],
      raw: clean,
    };

  const test = clean.match(/^\s*([✓✘✗-])\s+\d+\s+(.+?)\s*(\(\d+(?:\.\d+)?m?s\))?\s*$/);
  if (test) {
    // "tests/ui-master.spec.ts:88:5 › events.rfq_only" — the name is the last
    // chevron segment; the path in front of it is for the terminal, not here.
    const title = test[2].split("›").pop()!.trim();
    // The suite's own setup sign-in. A dashboard run skips it, because the
    // journey signs in by itself; the bare test name reads like a step.
    if (title === "authenticate")
      return {
        phase: "playwright",
        kind: test[1] === "✓" ? "ok" : test[1] === "-" ? "info" : "bad",
        text:
          test[1] === "-" ? "Separate sign-in step skipped — the journey signs in by itself"
          : test[1] === "✓" ? "Refreshed the saved sign-in"
          : "The separate sign-in step failed",
        raw: clean,
      };
    return {
      phase: "playwright",
      kind: test[1] === "✓" ? "ok" : test[1] === "-" ? "info" : "bad",
      text: `${title}${test[3] ? ` ${test[3]}` : ""}`,
      raw: clean,
    };
  }
  return null;
}

/**
 * Collects a run's steps as its lines arrive.
 *
 * Folding repeats here rather than in the renderer means the trail that is
 * persisted is the trail that was shown — the report cannot disagree with the
 * screen about how many times something was retried.
 */
export class JourneyTrail {
  private steps: JourneyStep[] = [];
  private startedAt = Date.now();

  add(line: string): JourneyStep | null {
    const step = parseJourneyLine(line);
    if (!step) return null;
    step.at = Date.now() - this.startedAt;
    const last = this.steps[this.steps.length - 1];
    if (step.collapseKey && last?.collapseKey === step.collapseKey) {
      last.repeats = (last.repeats ?? 1) + 1;
      last.text = step.text;
      last.raw = step.raw;
      last.at = step.at;
      return last;
    }
    this.steps.push(step);
    return step;
  }

  /** Everything recorded so far. */
  all(): JourneyStep[] {
    return this.steps;
  }

  /**
   * The step the journey got to — what "where it stopped" means.
   *
   * A failure's last useful step is the last thing that actually happened, not
   * Playwright's summary lines, so those are skipped when looking back.
   */
  lastMeaningful(): JourneyStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].phase !== "playwright") return this.steps[i];
    }
    return this.steps[this.steps.length - 1];
  }
}
