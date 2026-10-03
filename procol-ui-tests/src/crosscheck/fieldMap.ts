import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapturedResponse } from "./capture.js";

/**
 * THE REVIEWED FIELD MAP — which API fields must be visible, and where.
 *
 * One JSON file per screen in `src/crosscheck/maps/`. Each file names the API
 * responses the screen is built from (`sources`) and, per test case, the
 * fields a person should be able to read on that screen. A map is written from
 * a discovery run (`maps/discovered/*.json` lists every payload value that was
 * found on screen and where) and then REVIEWED by a person — the map is the
 * deterministic contract, discovery is only the evidence it was written from.
 *
 * A field is located by SCOPE, because "57 appears somewhere on the page"
 * proves little:
 *   page   anywhere on the screen (only for values that are unique enough);
 *   label  next to (right of, or just below) a visible label, e.g. "Created at";
 *   line   on the same visual line as an anchor value (a row across frozen and
 *          scrolling grid panes, which DOM rows cannot express);
 *   cell   on the anchor's line AND under a column header, e.g. "Bidding Ends At";
 *   row    inside the DOM row that contains the anchor.
 *
 * Paths are a small, strict language — no expressions, no code:
 *   a.b.c            a property
 *   a[]              every element (the field is checked once per element)
 *   a[0]             one element
 *   a[key={var}]     the element whose key equals a run variable or a literal
 *   $source:path     read from another source; `{field}` fills from the item
 */

export type Format =
  | "text"
  | "number"
  | "money"
  | "quantity"
  | "count"
  | "date"
  | "datetime"
  | "ratio"
  | "enum"
  | "duration";

export type Scope = "page" | "label" | "line" | "cell" | "row";

export interface FieldSpec {
  /** Stable key, used in findings and the discovered-vs-reviewed diff. */
  key: string;
  /** What a person calls this field. */
  label: string;
  /** Source name (see ScreenMap.sources). */
  source: string;
  /** Iterate: the field is checked once per element of this array path. */
  each?: string;
  /** The value, relative to the item when `each` is set, else absolute. */
  value: string;
  /** For ratio: the denominator path. For duration: the path subtracted from value. */
  other?: string;
  format: Format;
  scope: Scope;
  /** Path (relative to the item) whose value locates the line/row. */
  anchor?: string;
  /** Visible label text for scope=label, or column header for scope=cell. */
  screenLabel?: string;
  /** Decimals the API declares for this value (overrides the default of 2). */
  precision?: number;
  /** Path (relative to the item) to read the precision from, e.g. configuration.precision. */
  precisionPath?: string;
  /** enum: API value → the words the screen may use for it. */
  display?: Record<string, string[]>;
  /** Only check items where this path (relative to the item) is truthy. */
  when?: string;
  /** Present-but-absent is a note, not a failure (e.g. a column the user can hide). */
  optional?: boolean;
  /** Why this field is mapped the way it is — shown in Details. */
  note?: string;
  /**
   * How the API value is turned into what the screen renders before comparing:
   * "lexical-text" — a rich-text (Lexical JSON) message → its plain text, as the
   * console's read-only RichTextEditor renders it.
   */
  transform?: "lexical-text";
  /**
   * A stage time: the console adds localStorage.timeDiff (browser clock minus
   * the server's) before formatting (adjustForClient, utils/index.js:756-762),
   * so the shifted instant is accepted too. The run measures the difference.
   */
  stageTime?: boolean;
  /** Where in the dashboard's code this mapping comes from (file:line), shown in Details. */
  code?: string;
}

export interface CountSpec {
  key: string;
  label: string;
  source: string;
  /** Path to the API count (a number) or to an array (its length is the count). */
  value: string;
  /** The visible label the count is printed next to, e.g. "Line Items". */
  screenLabel?: string;
  /**
   * Count ROWS on screen: the path (in the same source) to each item's anchor
   * text; every anchor found on its own line counts as one visible row.
   */
  rowsOf?: string;
  note?: string;
}

export type SpecialKind =
  | "list-search"
  | "stage-status"
  | "sheet-widgets"
  | "qcs-cells"
  | "api-vs-screen-errors"
  | "serial-numbers"
  | "approval-conditions"
  | "technical-answers"
  | "auction-standings"
  | "stage-countdown"
  | "price-trend-rows"
  | "bidding-summary"
  | "product-sheet";

export interface SpecialSpec {
  kind: SpecialKind;
  label: string;
  /** Where in the dashboard's code the rule comes from (file:line). */
  code?: string;
  /** Free-form parameters the special check documents itself. */
  params?: Record<string, unknown>;
}

export interface CheckGroup {
  /** The catalog case this group IS: UI-XCHK-NNN or UI-XCHK-<SCREEN>-NNN. */
  case: string;
  title: string;
  /** Where in the dashboard's code the screen's behaviour for this case is defined (file:line). */
  code?: string[];
  fields?: FieldSpec[];
  counts?: CountSpec[];
  special?: SpecialSpec[];
}

export interface SourceSpec {
  method?: string;
  /** Regex (as a string) on the captured path; `{var}` placeholders are filled first. */
  path: string;
  /** Which of several matching responses to use. Default "last". */
  pick?: "first" | "last" | "all";
  /** Whether a missing source may fall back to the same call made on an earlier screen. */
  fromEarlierScreen?: boolean;
}

export interface ScreenMap {
  screen: string;
  title: string;
  /** How the screen is reached, in words — for the case's steps. */
  howToOpen: string;
  reviewed: { by: string; at: string; fromDiscovery?: string; note?: string };
  sources: Record<string, SourceSpec>;
  groups: CheckGroup[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const MAPS_DIR = join(here, "maps");

export function loadMaps(): ScreenMap[] {
  if (!existsSync(MAPS_DIR)) return [];
  return readdirSync(MAPS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(MAPS_DIR, f), "utf8")) as ScreenMap);
}

// ── run variables ───────────────────────────────────────────────────────────
export type Vars = Record<string, string | number | undefined>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Fill `{var}` placeholders; with `forRegex`, the filled values are regex-escaped (ids carry + / =). */
export function fill(template: string, vars: Vars, item?: unknown, forRegex = false): string {
  return template.replace(/\{([A-Za-z0-9_.]+)\}/g, (_, k: string) => {
    let v: unknown;
    if (k in vars && vars[k] !== undefined) v = vars[k];
    else if (item !== undefined) v = get(item, k);
    if (v === undefined || v === null) return `{${k}}`;
    return forRegex ? escapeRe(String(v)) : String(v);
  });
}

// ── path resolution ─────────────────────────────────────────────────────────
type Step = { prop: string } | { all: true } | { index: number } | { where: [string, string] };

function parse(path: string): Step[] {
  const steps: Step[] = [];
  const re = /([^.[\]]+)|\[(\]|-?\d+\]|[^=\]]+=[^\]]*\])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) {
    if (m[1] !== undefined) steps.push({ prop: m[1] });
    else if (m[2] === "]") steps.push({ all: true });
    else if (/^-?\d+\]$/.test(m[2])) steps.push({ index: Number(m[2].slice(0, -1)) });
    else {
      const [k, v] = m[2].slice(0, -1).split("=");
      steps.push({ where: [k, v] });
    }
  }
  return steps;
}

/** Every value a path reaches (wildcards fan out). */
export function getAll(root: unknown, path: string): unknown[] {
  let cur: unknown[] = [root];
  for (const st of parse(path)) {
    const next: unknown[] = [];
    for (const c of cur) {
      if (c === null || c === undefined) continue;
      if ("prop" in st) {
        if (typeof c === "object") next.push((c as Record<string, unknown>)[st.prop]);
      } else if ("all" in st) {
        if (Array.isArray(c)) next.push(...c);
        else if (typeof c === "object") next.push(...Object.values(c as object));
      } else if ("index" in st) {
        if (Array.isArray(c)) next.push(st.index < 0 ? c[c.length + st.index] : c[st.index]);
      } else {
        const [k, v] = st.where;
        if (Array.isArray(c)) next.push(...c.filter((e) => String(get(e, k)) === v));
      }
    }
    cur = next;
  }
  return cur.filter((v) => v !== undefined);
}

export function get(root: unknown, path: string): unknown {
  return getAll(root, path)[0];
}

// ── sources ─────────────────────────────────────────────────────────────────
export interface ResolvedSource {
  name: string;
  responses: CapturedResponse[];
  /** The response whose body the checks read. */
  chosen?: CapturedResponse;
  /** True when it came from an earlier screen (the call was not repeated here). */
  borrowed?: boolean;
  /** pick "all": fields iterate over every successful response, not only the chosen one. */
  all?: boolean;
}

export function resolveSources(
  map: ScreenMap,
  screen: string,
  all: CapturedResponse[],
  vars: Vars,
): Record<string, ResolvedSource> {
  const out: Record<string, ResolvedSource> = {};
  for (const [name, spec] of Object.entries(map.sources)) {
    const re = new RegExp(fill(spec.path, vars, undefined, true));
    const match = (r: CapturedResponse) => (!spec.method || r.method === spec.method) && re.test(r.path);
    let rs = all.filter((r) => r.screen === screen && match(r));
    let borrowed = false;
    if (!rs.length && spec.fromEarlierScreen) {
      rs = all.filter(match);
      borrowed = rs.length > 0;
    }
    const ok = rs.filter((r) => r.ok && r.body !== null);
    const chosen = spec.pick === "first" ? ok[0] : ok[ok.length - 1];
    out[name] = { name, responses: rs, chosen, borrowed, all: spec.pick === "all" };
  }
  return out;
}
