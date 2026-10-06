import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE LABELS THE AUTOMATION KNOWS EXIST.
 *
 * Two sources, both facts rather than guesses:
 *   - knownLabels.json — strings read out of the product's source
 *     (procol-client-dashboard, read-only), by screen;
 *   - labels.seen.json — labels a generic step actually FOUND on a live
 *     screen, with the strategy that found them. Every run that finds a label
 *     makes it known for the next compile.
 *
 * The compiler is handed both. A generic step whose label is in neither is a
 * guess, and a plan built on a guess is reported as partial coverage, never
 * full — and an ABSENCE check on a guessed label proves nothing at all (a
 * misspelt name is always absent).
 */

const here = dirname(fileURLToPath(import.meta.url));
const KNOWN = join(here, "knownLabels.json");
const SEEN = join(here, "labels.seen.json");

export interface KnownLabel {
  screen: string;
  kind: string;
  text: string;
  source: string;
  /** Where/when it shows — e.g. which disabled control a tooltip belongs to. */
  hint?: string;
}

export interface SeenLabel {
  screen: string;
  text: string;
  strategy: string;
  firstSeen: string;
  lastSeen: string;
  hits: number;
}

function read<T>(file: string, pick: (j: any) => T, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return pick(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return fallback;
  }
}

export function knownLabels(): KnownLabel[] {
  return read(KNOWN, (j) => (Array.isArray(j?.labels) ? (j.labels as KnownLabel[]) : []), []);
}

export function seenLabels(): SeenLabel[] {
  return read(SEEN, (j) => (Array.isArray(j) ? (j as SeenLabel[]) : []), []);
}

/** Which screen a URL is, in the labels file's names. */
export function screenOf(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "unknown";
  }
  const p = u.pathname + u.search;
  if (/^\/orders\/?(\?|$)/.test(p)) return "events_list";
  if (/singleStage=true/i.test(p) && !/\/project\//.test(p)) return "single_stage";
  if (/quick-create|projectCreation=true/i.test(p)) return "create_erfx";
  if (/\/project\//.test(p)) {
    if (/tab=audience/i.test(p)) return "participants";
    if (/tab=compare/i.test(p)) return "responses";
    return "stage_page";
  }
  return u.pathname.split("/")[1] || "home";
}

const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Is this text a label the product is known to render? (substring either way, ≥3 chars) */
export function isKnownLabel(text: string): boolean {
  const t = n(text);
  if (t.length < 2) return false;
  const all = [...knownLabels().map((l) => l.text), ...seenLabels().map((l) => l.text)].map(n).filter(Boolean);
  return all.some((k) => k === t || (t.length >= 3 && k.includes(t)) || (k.length >= 4 && t.includes(k)));
}

/** Remember a label a step found on a live screen (best-effort; never fails a run). */
export function noteSeen(text: string, url: string, strategy: string): void {
  try {
    // Only real product screens teach labels — never a local test page.
    if (!/^https?:\/\//.test(url) || process.env.UI_LABELS_NO_LEARN === "1") return;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || clean.length > 120) return;
    const list = seenLabels();
    const screen = screenOf(url);
    const now = new Date().toISOString();
    const hit = list.find((l) => l.screen === screen && n(l.text) === n(clean));
    if (hit) {
      hit.hits++;
      hit.lastSeen = now;
      hit.strategy = strategy;
    } else {
      list.push({ screen, text: clean, strategy, firstSeen: now, lastSeen: now, hits: 1 });
    }
    writeFileSync(SEEN, JSON.stringify(list, null, 2));
  } catch {
    /* a cache, not a source of truth */
  }
}

/** Compact by-screen listing for the compiler's prompt. */
export function labelsForPrompt(): Record<string, string[]> {
  const by: Record<string, Set<string>> = {};
  for (const l of knownLabels()) {
    const text = l.kind === "button" || l.kind === "tab" || l.kind === "menuitem" ? `${l.kind}:${l.text}` : l.text;
    (by[l.screen] ??= new Set()).add(l.hint ? `${text} [${l.hint}]` : text);
  }
  for (const l of seenLabels()) (by[l.screen] ??= new Set()).add(l.text);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v]]));
}

/**
 * Is this label known ON THIS SCREEN? null when the screen has not been crawled enough to say
 * (fewer than 15 labels). Used to stop vacuous "absent" passes: "Counter Offer is not shown on
 * the proposal page" proves nothing when Counter Offer has never been seen on that page.
 * A screen also counts the panels that open on it (Settings menu, drawers, the stage page).
 */
const RELATED: Record<string, string[]> = {
  summary: ["summary", "event_settings", "event_settings_upcoming", "stage_page", "reschedule_modal"],
  responses: ["responses", "stage_page"],
  overview: ["overview", "stage_page"],
  participants: ["participants", "stage_page"],
  master_qcs: ["master_qcs", "stage_page"],
  proposal: ["proposal"],
  create: ["create_erfx", "create_erfx_sheet", "line_items_drawer", "schedule_drawer", "savings_drawer", "single_stage", "create_single", "create_single_auction"],
  draft: ["create_erfx", "create_erfx_sheet", "line_items_drawer", "schedule_drawer", "savings_drawer"],
  events_list: ["events_list"],
};
export function knownOnScreen(text: string, screen: string): boolean | null {
  const screens = RELATED[screen] ?? [screen];
  const here = [...knownLabels(), ...seenLabels()].filter((l) => screens.includes(l.screen)).map((l) => n(l.text)).filter(Boolean);
  if (here.length < 15) return null;
  const t = n(text);
  return here.some((k) => k === t || (t.length >= 3 && k.includes(t)) || (k.length >= 4 && t.includes(k)));
}
