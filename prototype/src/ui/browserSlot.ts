/**
 * ONE BROWSER AT A TIME.
 *
 * Every browser run in this platform is a Playwright child process, and every
 * Playwright child opens its own Chromium. Two routes serving two clicks a
 * second apart therefore opened two windows, three with a retry — and the
 * user's screen filled with browsers fighting over the same sandbox account.
 *
 * This is a single slot. A run asks for it before spawning; if someone else
 * holds it, the run WAITS in a queue and says so, and starts the moment the
 * slot frees. Nothing about "who called" matters: the slot lives in the
 * process, so a case run, an AI instruction, a compiled plan and a teach all
 * line up behind each other.
 */
export interface SlotHolder {
  label: string;
  since: number;
  /** The run's own last progress line ("step 3/9 — fill the pricing sheet"), so a
   *  headless run is as visible on the dashboard as a headed one in a window. */
  progress?: string;
  headed?: boolean;
  /**
   * ANSWERABLE FROM ANY TAB: the question the run is waiting on. A run started in another tab (or a tab
   * since reloaded) asked into a stream nobody was reading, and the sidebar said "waiting for your
   * answer" with no way to see or answer it (Aanya, 27 Oct). Sessions shows it from here.
   */
  ask?: { runId: string; n: number; question: string; kind?: string; options?: Array<{ id: string; label: string }> };
}

/** Update what the current holder is doing right now. */
export function setSlotProgress(progress: string): void {
  if (holder) holder.progress = progress;
}
export function setSlotHeaded(headed: boolean): void {
  if (holder) holder.headed = headed;
}
/** The question the running run waits on (undefined once answered). */
export function setSlotAsk(ask: SlotHolder["ask"]): void {
  if (holder) holder.ask = ask;
}
/** An answer reached this run's question: it no longer waits. */
export function clearSlotAsk(runId: string, n: number): void {
  if (holder?.ask && holder.ask.runId === runId && holder.ask.n === n) holder.ask = undefined;
}

interface Waiter {
  label: string;
  resolve: (release: () => void) => void;
  cancelled: boolean;
}

let holder: SlotHolder | null = null;
const waiting: Waiter[] = [];

/** What is running and what is queued — for the dashboard's "now running" strip. */
export function slotState(): { running: SlotHolder | null; waiting: string[] } {
  return { running: holder, waiting: waiting.filter((w) => !w.cancelled).map((w) => w.label) };
}

function grant(w: Waiter) {
  holder = { label: w.label, since: Date.now() };
  let released = false;
  w.resolve(() => {
    if (released) return;
    released = true;
    holder = null;
    next();
  });
}

function next() {
  while (waiting.length) {
    const w = waiting.shift()!;
    if (w.cancelled) continue;
    grant(w);
    return;
  }
}

/**
 * Wait for the browser slot. Resolves with a `release` function that MUST be
 * called when the run ends (however it ends). `onQueued` fires once, with the
 * queue position, if the slot was not immediately free. The returned `cancel`
 * withdraws a still-waiting request, e.g. when the client disconnects.
 */
export function acquireBrowser(
  label: string,
  onQueued?: (position: number, running: SlotHolder | null) => void,
): { ready: Promise<() => void>; cancel: () => void } {
  const w: Waiter = { label, resolve: () => {}, cancelled: false };
  const ready = new Promise<() => void>((resolve) => {
    w.resolve = resolve;
    if (!holder) {
      grant(w);
    } else {
      waiting.push(w);
      onQueued?.(waiting.length, holder);
    }
  });
  return {
    ready,
    cancel: () => {
      w.cancelled = true;
    },
  };
}
