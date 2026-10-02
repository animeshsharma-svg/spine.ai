/**
 * WHAT LOOKED WRONG ON THE WAY THROUGH — kept, not swallowed.
 *
 * The form's dropdowns misbehave in ways that do not fail a run: one opens and
 * closes itself before anything can be picked, or a value is chosen, vanishes
 * from the field, and comes back a moment later. `selectFieldOption` already
 * coped with both — it retried, the value eventually stuck, the run went green
 * — so the flakiness was invisible to everyone except the person watching the
 * screen.
 *
 * That is the wrong place for it to live. A run that had to try three times to
 * set a Department is telling you something about the product, and it belongs
 * in the report next to the result, not in someone's memory.
 *
 * Each note is printed as it happens (so the platform's live step view shows
 * it) AND collected, so the run's report can list them afterwards.
 */

const notes = [];

/**
 * Record something that was survivable but not right.
 *
 * @param {string} kind    short machine-ish label, e.g. "value-vanished"
 * @param {string} detail  one sentence a reader can act on
 * @param {object} [extra] anything worth keeping (field name, attempt count)
 */
export function note(kind, detail, extra = {}) {
  const entry = { kind, detail, at: new Date().toISOString(), ...extra };
  notes.push(entry);
  // Tagged so the platform parses it into a step, and visible in the terminal.
  console.log(`[po-to-bill] ⚠ ${detail}`);
  return entry;
}

/** Everything noted so far. */
export function observations() {
  return notes.slice();
}

/** Start a fresh run's collection. */
export function resetObservations() {
  notes.length = 0;
}

/**
 * Say what is happening now, without calling it a problem.
 *
 * `note` is for things that went wrong quietly; this is plain progress. The
 * journey used to narrate six lines across three minutes, which left a
 * 105-second silence in the middle of the goods receipt — long enough that a
 * run doing exactly what it should looked frozen. Anything that takes tens of
 * seconds should say so while it does it.
 */
export function say(line) {
  console.log(`[po-to-bill] ${line}`);
}
