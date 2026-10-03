import type { ScreenSnapshot, Segment } from "./screenText.js";
import type { CountSpec, FieldSpec, ResolvedSource, Vars } from "./fieldMap.js";
import { fill, get, getAll } from "./fieldMap.js";
import {
  durationIn,
  findDate,
  findNumber,
  findText,
  formatIst,
  numbersIn,
  spellDuration,
  spellNumber,
  toInstant,
  toNumber,
  normText,
  humanise,
} from "./normalize.js";
import { anchorsFor, besideLabel, excerpt, headerAbove, labelSegments, lineOf, lineText, underHeader } from "./scopes.js";

/**
 * THE CHECKS — deterministic, one verdict per (field × item).
 *
 *   pass      the API value is where the map says it should be (after normalisation)
 *   mismatch  the place exists on screen but shows something else
 *   missing   the place itself is not on screen (no label / no row / not anywhere)
 *   skipped   the API has nothing to show (null, blank, "-") or the column is
 *             not displayed — recorded, never counted as a pass
 *   unread    the API response the field comes from was not captured
 *
 * No model is consulted. Every verdict carries the API value, what the screen
 * showed, and the rule that decided it.
 */

export type ItemVerdict = "pass" | "mismatch" | "missing" | "skipped" | "unread";

export interface ItemResult {
  case: string;
  screen: string;
  key: string;
  /** What a person calls the field. */
  field: string;
  /** Which row/element this is about ("AAC BLOCKS", "RFQ-18577"). */
  item?: string;
  verdict: ItemVerdict;
  /** The API value as a person reads it. */
  api: string;
  /** What the screen showed in that place. */
  shown: string;
  /** How it was decided, in words. */
  how: string;
  /** Where it was looked for. */
  scope: string;
  /** Technical detail: source route + JSON path. */
  source?: string;
  optional?: boolean;
  /** The dashboard code (file:line) that says the screen shows this field this way. */
  code?: string;
  /** The raw API value and the raw screen text, before normalisation — the evidence. */
  raw?: { api?: unknown; screen?: string };
}

/** A Lexical rich-text JSON message → the plain text its read-only editor renders. */
export function lexicalText(v: unknown): unknown {
  if (typeof v !== "string") return v;
  let doc: unknown;
  try {
    doc = JSON.parse(v);
  } catch {
    return v;
  }
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.children)) {
      n.children.forEach(walk);
      if (n.type === "paragraph") out.push(" ");
    }
    if (n.root) walk(n.root);
  };
  walk(doc);
  return out.join("").replace(/\s+/g, " ").trim();
}

const EMPTY = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && /^\s*(-|–|—|null|n\/?a)?\s*$/i.test(v));

interface Scoped {
  /** Did the place exist on screen? */
  located: boolean;
  segs: Segment[];
  text: string;
  where: string;
}

function scopeFor(snap: ScreenSnapshot, f0: FieldSpec, anchor: string | undefined, screenLabel?: string): Scoped[] {
  const f = screenLabel ? { ...f0, screenLabel } : f0;
  const page: Scoped = { located: true, segs: snap.segments, text: snap.text, where: "anywhere on the screen" };
  if (f.scope === "page") return [page];
  if (f.scope === "label") {
    const labels = labelSegments(snap, f.screenLabel ?? f.label);
    if (!labels.length) return [{ located: false, segs: [], text: "", where: `next to the label "${f.screenLabel ?? f.label}"` }];
    // The value sits below the label (stacked) or right of it on its line; both are tried.
    return labels.flatMap((l) => {
      const segs = besideLabel(snap, l);
      const right = lineOf(snap, l).filter((s) => s !== l && s.box.x >= l.box.x + l.box.w - 4 && s.box.x - (l.box.x + l.box.w) < 360).sort((a, b) => a.box.x - b.box.x).slice(0, 4);
      const out = [{ located: true, segs, text: segs.map((s) => s.text).join(" "), where: `next to the label "${l.text}"` }];
      if (right.length && right.some((r) => !segs.includes(r))) out.push({ located: true, segs: right, text: right.map((s) => s.text).join(" "), where: `right of the label "${l.text}"` });
      return out;
    });
  }
  if (!anchor) return [{ located: false, segs: [], text: "", where: "(no anchor value in the API)" }];
  const anchors = anchorsFor(snap, anchor);
  if (!anchors.length) return [{ located: false, segs: [], text: "", where: `on the row for "${anchor}"` }];
  if (f.scope === "row") {
    return anchors.map((a) => {
      const row = a.row >= 0 ? snap.rows[a.row] ?? "" : "";
      return { located: !!row, segs: [], text: row, where: `in the row for "${anchor}"` };
    });
  }
  const lines = anchors.map((a) => ({ a, line: lineOf(snap, a) }));
  if (f.scope === "line") {
    return lines.map(({ line }) => ({ located: true, segs: line, text: lineText(line), where: `on the line for "${anchor}"` }));
  }
  // cell: the line, narrowed to the column under the header.
  return lines.map(({ a, line }) => {
    const header = headerAbove(snap, f.screenLabel ?? f.label, a.box.y);
    if (!header) return { located: false, segs: line, text: lineText(line), where: `in the "${f.screenLabel ?? f.label}" column (no such column header on screen)` };
    const cell = underHeader(line, header);
    return { located: true, segs: cell, text: lineText(cell), where: `in the "${header.text}" column of the row for "${anchor}"` };
  });
}

interface Compared {
  ok: boolean;
  how: string;
  shown: string;
}

/** Compare one API value with one scope, by the field's format. */
export function compareValue(
  f: Pick<FieldSpec, "format" | "display" | "precision">,
  apiValue: unknown,
  other: unknown,
  scope: { text: string; segs: Segment[] },
  precision?: number,
): Compared {
  const texts = scope.segs.length ? scope.segs.map((s) => s.text) : [scope.text];
  switch (f.format) {
    case "text": {
      const m = findText(String(apiValue), [...texts, scope.text]);
      return { ok: m.ok, how: m.ok ? `text matched (${m.how})` : "text not found", shown: excerpt(scope.text) };
    }
    case "enum": {
      const raw = String(apiValue);
      const words = f.display?.[raw] ?? [humanise(raw)];
      for (const w of words) {
        const m = findText(w, [...texts, scope.text]);
        if (m.ok) return { ok: true, how: `"${raw}" is shown as "${m.seen}"`, shown: excerpt(scope.text) };
      }
      return { ok: false, how: `expected one of: ${words.map((w) => `"${w}"`).join(", ")}`, shown: excerpt(scope.text) };
    }
    case "number":
    case "money":
    case "count":
    case "quantity": {
      const n = toNumber(apiValue);
      if (n === null) return { ok: false, how: "the API value is not a number", shown: excerpt(scope.text) };
      const m = findNumber(n, scope.text, f.format === "count" ? 0 : precision ?? f.precision);
      let ok = m.ok;
      let how = ok ? "same number after removing formatting" : `numbers shown here: ${m.seen.slice(0, 8).join(", ") || "none"}`;
      if (ok && f.format === "quantity" && typeof apiValue === "string") {
        const unit = apiValue.replace(/[-\d.,\s]+/g, " ").trim();
        if (unit && !normText(scope.text).includes(normText(unit))) {
          ok = false;
          how = `the number matches but the unit "${unit}" is not shown`;
        }
      }
      return { ok, how, shown: excerpt(scope.text) };
    }
    case "date":
    case "datetime": {
      const t = toInstant(apiValue);
      if (t === null) return { ok: false, how: "the API value is not a time", shown: excerpt(scope.text) };
      const m = findDate(t, scope.text);
      return {
        ok: m.ok,
        how: m.ok ? `same ${m.how} in India time` : `times shown here: ${m.seen.map((s) => s.text).join("; ") || "none"}`,
        shown: excerpt(scope.text),
      };
    }
    case "ratio": {
      const a = toNumber(apiValue);
      const b = toNumber(other);
      const pairs = [...scope.text.matchAll(/(\d+)\s*\/\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      const ok = pairs.some(([x, y]) => x === a && y === b);
      return { ok, how: ok ? "same pair" : `pairs shown here: ${pairs.map((p) => p.join("/")).join(", ") || "none"}`, shown: excerpt(scope.text) };
    }
    case "duration": {
      const a = toInstant(apiValue);
      const b = toInstant(other);
      if (a === null || b === null) return { ok: false, how: "the API times are missing", shown: excerpt(scope.text) };
      const want = (a - b) / 1000;
      const d = durationIn(scope.text);
      if (!d) return { ok: false, how: "no duration written here", shown: excerpt(scope.text) };
      // A display in minutes may round; one in seconds must be exact to the second.
      const tol = Math.max(1, d.unitSeconds);
      const ok = Math.abs(d.seconds - want) < tol;
      return { ok, how: ok ? `same duration (${d.text})` : `shows ${d.text} = ${spellDuration(d.seconds)}`, shown: excerpt(scope.text) };
    }
  }
}

/** The API value as a person would read it, for the "API says" column. */
export function spellApi(f: Pick<FieldSpec, "format">, v: unknown, other?: unknown, prefix = "", suffix = ""): string {
  switch (f.format) {
    case "money":
    case "number":
    case "count":
    case "quantity": {
      if (typeof v === "string" && /[a-z]/i.test(v)) return v.trim();
      const n = toNumber(v);
      return n === null ? String(v) : spellNumber(n, prefix, suffix);
    }
    case "date":
    case "datetime": {
      const t = toInstant(v);
      return t === null ? String(v) : formatIst(t);
    }
    case "ratio":
      return `${v}/${other}`;
    case "duration": {
      const a = toInstant(v);
      const b = toInstant(other);
      return a !== null && b !== null ? spellDuration((a - b) / 1000) : "—";
    }
    default:
      return String(v);
  }
}

function readItemValue(path: string, item: unknown, sources: Record<string, ResolvedSource>, vars: Vars): unknown {
  // "a || b": the first that has a value — the console's own `a ?? b`.
  if (path.includes("||")) {
    for (const p of path.split("||").map((x) => x.trim())) {
      const v = readItemValue(p, item, sources, vars);
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  }
  const ext = path.match(/^\$([a-zA-Z0-9_]+):(.*)$/);
  if (ext) {
    const body = sources[ext[1]]?.chosen?.body;
    return get(body, fill(ext[2], vars, item));
  }
  return get(item, fill(path, vars, item));
}

export function checkField(
  caseId: string,
  screen: string,
  f: FieldSpec,
  snap: ScreenSnapshot,
  sources: Record<string, ResolvedSource>,
  vars: Vars,
): ItemResult[] {
  const src = sources[f.source];
  const where = src?.chosen ? `${src.chosen.method} ${src.chosen.route}` : f.source;
  const base = { case: caseId, screen, key: f.key, field: f.label, optional: f.optional, code: f.code };
  if (!src?.chosen) {
    const failed = src?.responses.find((r) => !r.ok);
    return [
      {
        ...base,
        verdict: "unread",
        api: "—",
        shown: "—",
        how: failed ? `the API call behind it failed (HTTP ${failed.status})` : "the API call behind this field was not seen on this screen",
        scope: f.scope,
        source: f.source,
      },
    ];
  }
  const bodies = src.all ? src.responses.filter((r) => r.ok && r.body !== null).map((r) => r.body) : [src.chosen.body];
  const items: unknown[] = bodies.flatMap((body) => (f.each ? getAll(body, fill(f.each, vars)) : [body]));
  const out: ItemResult[] = [];
  for (const item of items) {
    if (f.when) {
      // "path" = only when truthy; "path=value" = only when it equals value.
      // "path!=value" = only when it differs from value.
      const neg = f.when.includes("!=");
      const [wp, wv] = f.when.split(neg ? "!=" : "=");
      const got = readItemValue(wp, item, sources, vars);
      if (wv === undefined ? !got : neg ? String(got) === wv : String(got) !== wv) continue;
    }
    const rawValue = readItemValue(f.value, item, sources, vars);
    const value = f.transform === "lexical-text" ? lexicalText(rawValue) : rawValue;
    const other = f.other ? readItemValue(f.other, item, sources, vars) : undefined;
    const anchor = f.anchor ? readItemValue(f.anchor, item, sources, vars) : undefined;
    const itemName = anchor !== undefined && anchor !== null ? String(anchor) : undefined;
    const precision = f.precisionPath ? toNumber(readItemValue(f.precisionPath, item, sources, vars)) ?? undefined : f.precision;
    const api = EMPTY(value)
      ? "(empty)"
      : f.format === "enum" && f.display?.[String(value)]
        ? `"${value}", which the product labels "${f.display[String(value)][0]}"`
        : spellApi(f, value, other);
    const res = (verdict: ItemVerdict, shown: string, how: string, scope: string): ItemResult => ({
      ...base,
      item: itemName,
      verdict,
      api,
      shown,
      how,
      scope,
      source: `${where} → ${f.each ? f.each + " → " : ""}${f.value}`,
      raw: { api: rawValue, screen: shown },
    });
    if (EMPTY(value) || (f.format === "ratio" && EMPTY(other))) {
      out.push(res("skipped", "—", "the API has no value to show", f.scope));
      continue;
    }
    const label = f.screenLabel ? fill(f.screenLabel, vars, item) : undefined;
    const scopes = scopeFor(snap, f, itemName, label);
    const located = scopes.filter((s) => s.located);
    if (!located.length) {
      out.push(res(f.optional ? "skipped" : "missing", "(not on screen)", `could not find the place: ${scopes[0]?.where}`, scopes[0]?.where ?? f.scope));
      continue;
    }
    let first: Compared | null = null;
    let hit: { c: Compared; s: (typeof located)[number] } | null = null;
    const skew = Number(vars.clockSkewMs ?? 0);
    const shifted = f.stageTime && skew && toInstant(value) !== null ? toInstant(value)! + skew : null;
    for (const s of located) {
      let c = compareValue(f, value, other, s, precision);
      if (!c.ok && shifted !== null) {
        const c2 = compareValue(f, shifted, other, s, precision);
        if (c2.ok) c = { ...c2, how: `${c2.how}, after the console's clock adjustment of ${Math.round(skew / 1000)} s` };
      }
      first ??= c;
      if (c.ok) {
        hit = { c, s };
        break;
      }
    }
    if (hit) out.push(res("pass", hit.c.shown, hit.c.how, hit.s.where));
    else {
      // Empty place: the screen shows a dash where the API has a value — that
      // is a value missing from the screen, said as such.
      const shown = first!.shown;
      const blank = located[0].text.trim() === "" || /^[-–—]$/.test(located[0].text.trim());
      out.push(res(f.optional ? "skipped" : blank ? "missing" : "mismatch", blank ? "(blank)" : shown, first!.how, located[0].where));
    }
  }
  return out;
}

export function checkCount(
  caseId: string,
  screen: string,
  c: CountSpec,
  snap: ScreenSnapshot,
  sources: Record<string, ResolvedSource>,
  vars: Vars,
): ItemResult[] {
  const src = sources[c.source];
  const base = { case: caseId, screen, key: c.key, field: c.label };
  if (!src?.chosen) return [{ ...base, verdict: "unread", api: "—", shown: "—", how: "the API call behind this count was not seen", scope: "count" }];
  const raw = get(src.chosen.body, fill(c.value, vars));
  const n = Array.isArray(raw) ? raw.length : toNumber(raw);
  if (n === null) return [{ ...base, verdict: "unread", api: String(raw), shown: "—", how: "the API count is not a number", scope: "count" }];
  const out: ItemResult[] = [];
  const route = `${src.chosen.method} ${src.chosen.route} → ${c.value}`;
  if (c.screenLabel) {
    const labels = labelSegments(snap, c.screenLabel);
    if (!labels.length) {
      out.push({ ...base, verdict: "missing", api: String(n), shown: "(no such label)", how: `no "${c.screenLabel}" heading on screen`, scope: "label", source: route });
    } else {
      const shownNums = labels.flatMap((l) => {
        // A count printed in the heading itself ("Quotation Templates (2)") or beside it.
        const own = numbersIn(l.text);
        return own.length ? own : numbersIn(besideLabel(snap, l).slice(0, 2).map((s) => s.text).join(" "));
      });
      const ok = shownNums.includes(n);
      out.push({
        ...base,
        verdict: ok ? "pass" : shownNums.length ? "mismatch" : "missing",
        api: String(n),
        shown: shownNums.length ? shownNums.join(", ") : "(no number)",
        how: ok ? `the "${c.screenLabel}" count matches` : `the count next to "${c.screenLabel}" is not ${n}`,
        scope: `next to "${c.screenLabel}"`,
        source: route,
      });
    }
  }
  if (c.rowsOf) {
    const anchors = getAll(src.chosen.body, fill(c.rowsOf, vars)).map(String);
    const seen = new Set<number>();
    const missing: string[] = [];
    for (const a of anchors) {
      const segs = anchorsFor(snap, a).filter((s) => !seen.has(s.box.y));
      if (segs.length) seen.add(segs[0].box.y);
      else missing.push(a);
    }
    const shownRows = anchors.length - missing.length;
    out.push({
      ...base,
      key: `${c.key}.rows`,
      field: `${c.label} — rows on screen`,
      verdict: missing.length ? (shownRows ? "mismatch" : "missing") : "pass",
      api: `${anchors.length} listed`,
      shown: `${shownRows} on screen`,
      how: missing.length ? `not on screen: ${missing.slice(0, 6).map((m) => `"${m}"`).join(", ")}` : "every item the API listed has a row",
      scope: "rows",
      source: `${src.chosen.method} ${src.chosen.route} → ${c.rowsOf}`,
    });
  }
  return out;
}

