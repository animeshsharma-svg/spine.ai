/**
 * THE AGENT REPAIRS ITS OWN AUTOMATION — so a case that cannot run today is not left for a person to fix.
 *
 * After a sheet case ends without a verdict about the product, the runner tries, once, to build what was missing:
 *   • "Not run — no step for X": find the screen the case is about in the screen library (its exact control names
 *     and headings) and compile the case again grounded on that screen, so the generic steps (click, fill, check)
 *     can do what no domain step could. The new plan runs.
 *   • "Couldn't tell — could not do step N": if the browser recorded where it got stuck, ask the AI to find that
 *     control on the stuck screen and save the locator it learnt (teach.spec.ts); otherwise compile again grounded
 *     on the screen it was on. The case runs once more.
 * Whatever still cannot run goes on the automation backlog (data/automation-backlog.json) with what is missing —
 * a missing step, a control it cannot find, or a starting event the API cannot build — so the gap is visible.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getScreen, listScreens } from "../agents/screenModel.js";
import { readLearned, runTeach } from "../ui/uiFlowRunner.js";
import type { SheetCase } from "./sheetCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const BACKLOG = join(here, "..", "..", "data", "automation-backlog.json");
const STUCK = join(here, "..", "..", "..", "procol-ui-tests", "stuck");

export interface ScreenGround { label: string; path: string; controls: string[]; headings: string[]; id: string }

const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const pathKey = (p: string) => p.replace(/\?.*$/, "").split("/").map((s) => (/^\d+$|^[0-9a-f-]{20,}$/i.test(s) || (/\d/.test(s) && /[a-z]/i.test(s) && s.length >= 6 && !/-/.test(s)) ? ":id" : s)).join("/");

/** The photographed screen a case is about (or the one at `url`), with its exact control names. */
export function screenFor(c: SheetCase, url?: string): ScreenGround | null {
  const all = listScreens();
  let best: { id: string; score: number } | null = null;
  // Several screens share a path (/orders/quick-create is the single stage, eRFX and BOQ create screens):
  // the page it was on narrows the choice, the case's words pick among them.
  let pool = all;
  if (url) {
    try {
      const want = pathKey(new URL(url).pathname);
      const same = all.filter((s) => pathKey(s.path) === want);
      if (same.length) pool = same;
    } catch {
      /* not a url */
    }
  }
  const single = /single stage|single-stage/i.test(`${c.title} ${c.module} ${c.steps.join(" ")}`);
  const erfx = /erfx|project/i.test(`${c.title} ${c.module}`);
  if (single) {
    const ss = (url ? pool : all).filter((s) => /single-stage/.test(s.id));
    pool = ss.length ? ss : pool.filter((s) => !/boq|erfx/.test(s.id)).length ? pool.filter((s) => !/boq|erfx/.test(s.id)) : pool;
  }
  else if (erfx) pool = pool.filter((s) => !/boq|single-stage/.test(s.id)).length ? pool.filter((s) => !/boq|single-stage/.test(s.id)) : pool;
  {
    const cw = words(`${c.title} ${c.steps.slice(1).join(" ")} ${c.expected}`);
    for (const s of pool) {
      const r = getScreen(s.id);
      if (!r) continue;
      const sw = words(`${r.label} ${r.headings.join(" ")} ${r.controls.map((x) => x.name).join(" ")}`);
      let both = 0;
      for (const w of cw) if (sw.has(w)) both++;
      const score = both / Math.max(6, cw.size);
      if (!best || score > best.score) best = { id: s.id, score };
    }
    if (!best || (pool === all && best.score < 0.25)) return null;
  }
  const r = getScreen(best.id);
  if (!r) return null;
  return {
    id: r.id, label: r.label, path: r.path,
    controls: r.controls.filter((x) => x.name && x.name.length >= 2).map((x) => `${x.kind} "${x.name}"${x.disabled ? " (disabled)" : ""}`),
    headings: [...(r.headings ?? []), ...(r.messages ?? [])].filter((t) => t && t.length >= 2).slice(0, 60),
  };
}

/** The stuck record the browser wrote while this case ran (procol-ui-tests/stuck/*.json), newest first. */
export function stuckSince(t0: number): { id: string; label: string; url: string } | null {
  if (!existsSync(STUCK)) return null;
  const files = readdirSync(STUCK).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: statSync(join(STUCK, f)).mtimeMs })).filter((x) => x.t >= t0).sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    try {
      const r = JSON.parse(readFileSync(join(STUCK, f), "utf8"));
      if (r?.id && !/^capture:/.test(String(r.label ?? ""))) return { id: String(r.id), label: String(r.label ?? ""), url: String(r.url ?? "") };
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Ask the AI to find the control the run got stuck on and save the locator. True when it learnt one. */
export async function teachStuck(stuckId: string, onLine: (l: string) => void, setStop: (s: () => void) => void): Promise<boolean> {
  if (!process.env.GOOGLE_API_KEY) {
    onLine("cannot teach the locator: no AI key for the healer (GOOGLE_API_KEY)");
    return false;
  }
  const before = Object.keys(readLearned()).length;
  await new Promise<void>((resolve) => {
    const h = runTeach({ stuckId, headed: false }, (e: any) => {
      if (e.type === "log" && /learn|found|saved|locator/i.test(String(e.line ?? ""))) onLine(String(e.line).slice(0, 200));
      if (e.type === "done" || e.type === "run-error") resolve();
    });
    setStop(() => {
      h.stop();
      resolve();
    });
  });
  return Object.keys(readLearned()).length > before;
}

// ── the automation backlog ───────────────────────────────────────────────────────────────
export interface BacklogItem {
  caseId: string;
  title: string;
  module: string;
  kind: "missing step" | "control not found" | "starting event not built" | "plan built wrong";
  what: string;
  firstSeen: string;
  lastSeen: string;
  attempts: number;
  tried: string[];
}
function readBacklog(): BacklogItem[] {
  try {
    return existsSync(BACKLOG) ? (JSON.parse(readFileSync(BACKLOG, "utf8")) as BacklogItem[]) : [];
  } catch {
    return [];
  }
}
export function backlog(): BacklogItem[] {
  return readBacklog();
}
export function addToBacklog(c: SheetCase, kind: BacklogItem["kind"], what: string, tried: string[]): void {
  const all = readBacklog();
  const now = new Date().toISOString();
  const old = all.find((b) => b.caseId === c.id);
  if (old) Object.assign(old, { kind, what, lastSeen: now, attempts: old.attempts + 1, tried: [...new Set([...old.tried, ...tried])] });
  else all.push({ caseId: c.id, title: c.title, module: c.module, kind, what, firstSeen: now, lastSeen: now, attempts: 1, tried });
  mkdirSync(dirname(BACKLOG), { recursive: true });
  writeFileSync(BACKLOG, JSON.stringify(all, null, 1));
}
export function clearFromBacklog(caseId: string): void {
  const all = readBacklog();
  const left = all.filter((b) => b.caseId !== caseId);
  if (left.length !== all.length) writeFileSync(BACKLOG, JSON.stringify(left, null, 1));
}
