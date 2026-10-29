/**
 * SCREEN NOISE — pop-ups that are never the app's answer to what a test did.
 *
 * Procol (and the browser) raise prompts that have nothing to do with the step
 * under test: "Want to stay updated? Enable browser notifications", "Turn on
 * notifications", tours, "What's new", feedback / rating asks, cookie bars,
 * chat widgets. A senior manual QA closes them and carries on. The runner does
 * the same, always:
 *   • they are dismissed before every action (plan.spec.ts registers a
 *     Playwright locator handler on NOISE_CONTAINER);
 *   • their text is never recorded as a toast and never matched as the app's
 *     refusal or confirmation (messages.ts, evidence.ts use isNoiseMessage).
 * A pop-up that is NOT in this list is still reported, so a real message the
 * case cares about can never be swallowed — add a pattern here only for
 * prompts that are unrelated to every test.
 */
export const NOISE_TEXT: RegExp[] = [
  /want to stay updated/i,
  /enable (browser )?notifications?/i,
  /turn on notifications?/i,
  /allow notifications?/i,
  /stay updated on all things procol/i,
  /what'?s new/i,
  /take a (quick )?tour/i,
  /rate (us|your experience)|how (likely|was your experience)|share (your )?feedback/i,
  /we use (essential |some )?cookies|accept (all )?cookies|cookie policy/i,
  /new version (is )?available|refresh to update/i,
  /verification for your (e-?)?mail|verify your (e-?)?mail/i,
  // 29 Oct: the "Hello Procol, Help us make Procol better! … Give Feedback" card sat over the Participants rows'
  // Add Bid (EVAL0 timed out on it), and the "New! Keyboard Navigation" tip beside it.
  /help us make procol better/i,
  /keyboard navigation/i,
];

export function isNoiseMessage(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  return !!t && NOISE_TEXT.some((re) => re.test(t));
}

/** A container showing any noise text — used to trigger the auto-dismiss handler. */
export const NOISE_CONTAINER_TEXT = new RegExp(NOISE_TEXT.map((r) => r.source).join("|"), "i");
