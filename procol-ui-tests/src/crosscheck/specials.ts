import type { CapturedResponse } from "./capture.js";
import type { ResolvedSource, SpecialSpec, Vars } from "./fieldMap.js";
import { get, getAll } from "./fieldMap.js";
import type { ScreenSnapshot, Segment } from "./screenText.js";
import type { ItemResult } from "./checks.js";
import { compareValue, spellApi } from "./checks.js";
import { normText, toInstant } from "./normalize.js";
import { runMoreSpecial } from "./specialsMore.js";
import { anchorsFor, excerpt, headerAbove, labelSegments, lineOf, lineText, underHeader } from "./scopes.js";

/**
 * The checks a flat field list cannot express: a list that must equal a
 * search, a status derived from times, a sheet whose columns are defined by
 * the template, and "did the API fail while the screen looked fine".
 */

export interface SpecialContext {
  caseId: string;
  screen: string;
  snap: ScreenSnapshot;
  sources: Record<string, ResolvedSource>;
  vars: Vars;
  /** Every response captured on this screen. */
  responses: CapturedResponse[];
  /** Toasts the app raised while on this screen. */
  toasts: Array<{ severity: string; text: string }>;
}

type R = Omit<ItemResult, "case" | "screen">;
const mk = (ctx: SpecialContext, r: R): ItemResult => ({ case: ctx.caseId, screen: ctx.screen, ...r });

// ── list-search ────────────────────────────────────────────────────────────
/**
 * The events list, searched by title, must show exactly what the API returned
 * for that search. Event refs (RFX-NNNN) identify rows; a ref on screen that
 * the search did not return means the list is showing something else — e.g.
 * an unfiltered answer that arrived after the filtered one.
 */
function listSearch(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "search")];
  const all = ctx.sources[String(s.params?.unfiltered ?? "unfiltered")];
  const base = { key: "list.search", field: "Events shown for the search" };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the search request was not seen", scope: "list" })];
  const want = getAll(src.chosen.body, "event_groups[].ref_uuid").map(String);
  const shownRefs = [...new Set(ctx.snap.segments.map((x) => x.text.match(/\bRFX-\d+\b/)?.[0]).filter((x): x is string => !!x))];
  const foreign = shownRefs.filter((r) => !want.includes(r));
  const absent = want.filter((r) => !shownRefs.includes(r));
  const searchBox = ctx.snap.segments.find((x) => x.kind === "value" && normText(x.text) === normText(String(ctx.vars.title ?? "")));
  // The race, stated with times: an unfiltered request SENT before the search
  // but ANSWERED after it. If the screen then shows that answer, the list
  // rendered a stale response over the one the user asked for.
  const sentAt = (r: CapturedResponse) => r.requestedAt ?? r.at;
  const later = (all?.responses ?? []).filter((r) => r.ok && r.at > src.chosen!.at && sentAt(r) <= sentAt(src.chosen!));
  const raceNote = later.length
    ? `; an unfiltered list request sent at ${sentAt(later[0]).slice(11, 23)} (before the search at ${sentAt(src.chosen).slice(11, 23)}) was answered at ${later[0].at.slice(11, 23)}, after the search's answer at ${src.chosen.at.slice(11, 23)}, and the screen shows that stale answer`
    : "";
  const out: ItemResult[] = [];
  out.push(
    mk(ctx, {
      ...base,
      item: String(ctx.vars.title ?? ""),
      verdict: foreign.length ? "mismatch" : absent.length ? "missing" : "pass",
      api: `${want.length} event(s): ${want.join(", ") || "none"}`,
      shown: `${shownRefs.length} event(s): ${excerpt(shownRefs.join(", "), 120)}`,
      how: foreign.length
        ? `the list shows ${foreign.length} event(s) the search did not return` +
          (searchBox ? ` while the search box still reads "${searchBox.text}"` : "") +
          raceNote
        : absent.length
          ? `the search returned ${absent.join(", ")} but no row shows it`
          : "the rows are exactly the events the search returned",
      scope: "events list",
      source: `${src.chosen.method} ${src.chosen.route} (title filter) → event_groups[].ref_uuid`,
    }),
  );
  return out;
}

// ── stage-status ───────────────────────────────────────────────────────────
/** The console's own rule (getOrderStatus in the client dashboard), applied to the API's times. */
export function expectedStageStatus(st: Record<string, unknown>, nowMs: number): string {
  const status = String(st.status ?? "");
  const start = toInstant(st.starting_from);
  const end = toInstant(st.ending_at);
  const extra = toInstant(st.extra_closing_time);
  if (status === "active" && start && end) {
    if (nowMs < start) return "upcoming";
    if (nowMs < end) return "live";
    if (extra && nowMs < extra) return "evaluation time";
    return "expired";
  }
  if (["in_active", "withdrawn"].includes(status)) return "withdrawn";
  if (status === "closed") return "closed";
  if (status === "requested") return "requested";
  if (status === "draft") return "draft";
  return status || "unknown";
}

const STATUS_WORDS: Record<string, string[]> = {
  upcoming: ["upcoming", "scheduled"],
  live: ["live", "in progress", "submission time"],
  "evaluation time": ["evaluation time", "evaluation", "buffer"],
  expired: ["expired"],
  withdrawn: ["withdrawn"],
  closed: ["closed", "completed", "awarded"],
  requested: ["requested", "approval pending", "pending approval"],
  draft: ["draft"],
};

function stageStatus(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "schema")];
  const base = { key: "stage.status", field: "Stage status" };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the stage was not read from the API on this screen", scope: "header" })];
  const st = src.chosen.body as Record<string, unknown>;
  const now = Date.parse(ctx.snap.takenAt);
  const want = expectedStageStatus(st, now);
  const words = STATUS_WORDS[want] ?? [want];
  // A status is a chip: a segment that IS the word, not a sentence containing it.
  const chip = (w: string) => ctx.snap.segments.find((x) => (x.kind === "text" || x.kind === "title") && normText(x.text) === w);
  const hit = words.map(chip).find(Boolean);
  const others = Object.entries(STATUS_WORDS)
    .filter(([k]) => k !== want)
    .flatMap(([k, ws]) => ws.map((w) => [k, chip(w)] as const))
    .filter(([, seg]) => !!seg);
  const api = `${want} (status "${st.status}", window ${spellApi({ format: "datetime" }, st.starting_from)} → ${spellApi({ format: "datetime" }, st.ending_at)})`;
  if (hit) return [mk(ctx, { ...base, item: String(st.title ?? ""), verdict: "pass", api, shown: hit.text, how: "the chip matches the API's status and times", scope: "stage header" })];
  if (others.length)
    return [mk(ctx, { ...base, item: String(st.title ?? ""), verdict: "mismatch", api, shown: others.map(([, x]) => x!.text).join(", "), how: `the screen shows another status than the API's times imply (${want})`, scope: "stage header" })];
  return [mk(ctx, { ...base, item: String(st.title ?? ""), verdict: "missing", api, shown: "(no status chip)", how: `no "${words.join('"/"')}" chip on screen`, scope: "stage header" })];
}

// ── template-driven sheets ─────────────────────────────────────────────────
interface Widget {
  key: string;
  name: string;
  mode?: string;
  fieldType?: string;
  inputType?: string;
  precision?: number;
  prefix?: string;
  suffix?: string;
}

function widgetsOf(schemaBody: unknown): Map<string, Widget> {
  const out = new Map<string, Widget>();
  for (const w of getAll(schemaBody, "sheets.inline_components.widgets[]") as Array<Record<string, any>>) {
    if (!w?.key_attribute) continue;
    out.set(String(w.key_attribute), {
      key: String(w.key_attribute),
      name: String(w.name ?? w.key_attribute),
      mode: w.configuration?.mode_type,
      fieldType: w.configuration?.field_type,
      inputType: w.input_type,
      precision: typeof w.configuration?.precision === "number" ? w.configuration.precision : undefined,
      prefix: w.configuration?.prefix,
      suffix: w.configuration?.suffix,
    });
  }
  return out;
}

/**
 * The grid hides a zero: getFormattedValue returns nothing for 0 unless the
 * cell has a previous value or is the buyer's requested quantity, and the cell
 * then renders "–" (client-dashboard components/dataGrid/formatters/
 * cellValueFormatter.jsx:59-65, 139, 477-484). By the console's own rule that
 * is the right display, so it is not a disagreement.
 */
const ZERO_CODE = "components/dataGrid/formatters/cellValueFormatter.jsx:59-65,139,477-484";
const ZERO_RULE = "the API value is zero and the console shows zero as \"–\" in grid cells (its own rule)";
const hiddenZero = (value: unknown, key: string) => key !== "creator_quantity" && Number(String(value).replace(/[^\d.-]/g, "")) === 0 && /\d/.test(String(value));

const SKIP_KEYS = new Set(["action", "status", "serial_number", "product", "variant", "meta_data", "savings_with_strategy", "rank", "rfp_status", "service_name"]);

function formatFor(w: Widget): "number" | "money" | "quantity" | "text" {
  if (w.inputType === "quantity") return "number";
  if (w.inputType === "number" || w.inputType === "price") return w.prefix ? "money" : "number";
  return "text";
}

/** Vendor column regions on a comparison grid: [x of this vendor's header, x of the next). */
function vendorRegions(snap: ScreenSnapshot, labels: Array<{ key: string; label: string }>, minY = -1e9): Map<string, [number, number]> {
  const found = labels
    .map((l) => ({ ...l, seg: anchorsFor(snap, l.label).filter((a) => a.box.y > minY).sort((a, b) => a.box.y - b.box.y)[0] }))
    .filter((l): l is typeof l & { seg: Segment } => !!l.seg)
    .sort((a, b) => a.seg.box.x - b.seg.box.x);
  const out = new Map<string, [number, number]>();
  found.forEach((l, i) => out.set(l.key, [l.seg.box.x - 30, i + 1 < found.length ? found[i + 1].seg.box.x - 30 : 1e6]));
  return out;
}

/**
 * The Responses grid: every bidder the schema lists has a column group, and
 * every value in each bidder's quote is shown on that product's line, under
 * the template's own column name, inside that bidder's column group.
 */
function sheetWidgets(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const schema = ctx.sources[String(s.params?.schema ?? "schema")]?.chosen?.body as Record<string, any> | undefined;
  const quotesSrc = ctx.sources[String(s.params?.quotes ?? "quotes")];
  const out: ItemResult[] = [];
  if (!schema) return [mk(ctx, { key: "sheet", field: "Quote sheet", verdict: "unread", api: "—", shown: "—", how: "the stage schema was not seen", scope: "sheet" })];
  // A stage with no bids carries one placeholder layer keyed "default" — the
  // console itself treats it as "no bidders" (savingsStrip.jsx), so do we.
  const layers = ((schema.layers ?? []) as Array<Record<string, any>>).filter((l) => l.key !== "default");
  for (const l of layers) {
    const seen = anchorsFor(ctx.snap, String(l.label)).length > 0;
    out.push(mk(ctx, { key: "sheet.bidder", field: "Bidder column", item: String(l.label), verdict: seen ? "pass" : "missing", api: `${l.label} bid ${l.display_amount ?? ""}`.trim(), shown: seen ? String(l.label) : "(no column)", how: seen ? "the bidder has a column" : "the API lists this bidder but the grid has no column for it", scope: "grid header", source: "schema → layers[].label" }));
  }
  const widgets = widgetsOf(schema);
  const regions = vendorRegions(ctx.snap, layers.map((l) => ({ key: String(l.key), label: String(l.label) })));
  // One quote per sheet; the latest response wins.
  const bySheet = new Map<string, CapturedResponse>();
  for (const r of quotesSrc?.responses ?? []) if (r.ok && r.body) bySheet.set(String((r.body as any).sheet_uuid ?? r.path), r);
  for (const r of bySheet.values()) {
    const body = r.body as Record<string, any>;
    const vendorKey = String(body.participants?.company?.uuid ?? Object.keys(body.inline_data ?? {})[0] ?? "");
    const vendorName = String(body.participants?.company?.name ?? vendorKey);
    const region = regions.get(vendorKey);
    const rows = (body.inline_data?.[vendorKey] ?? []) as Array<Record<string, any>>;
    for (const row of rows) {
      const product = String(row.product?.value ?? "");
      const anchors = anchorsFor(ctx.snap, product);
      for (const [k, cell] of Object.entries(row)) {
        if (SKIP_KEYS.has(k) || !cell || typeof cell !== "object") continue;
        const w = widgets.get(k);
        if (!w || w.mode === "hidden") continue;
        const value = (cell as any).value;
        if (value === null || value === undefined || value === "") continue;
        const fmt = formatFor(w);
        const prefix = (cell as any).configuration?.prefix ?? w.prefix ?? "";
        const suffix = (cell as any).configuration?.suffix ?? w.suffix ?? "";
        const api = fmt === "text" ? String(value) : spellApi({ format: fmt }, value, undefined, prefix, suffix);
        const base = { key: `sheet.${k}`, field: w.name, item: `${vendorName} · ${product}`, api, source: `${r.method} ${r.route} → inline_data.${vendorKey}[].${k}.value` };
        if (!anchors.length) {
          out.push(mk(ctx, { ...base, verdict: "missing", shown: "(no row)", how: `no row for "${product}" on screen`, scope: "sheet" }));
          continue;
        }
        const line = lineOf(ctx.snap, anchors[0]);
        const xr = w.fieldType === "participant" ? region : undefined;
        const header = headerAbove(ctx.snap, w.name, anchors[0].box.y, xr);
        if (!header) {
          out.push(mk(ctx, { ...base, verdict: "skipped", shown: "(column not displayed)", how: `no "${w.name}" column is on screen — it may be hidden with "Hide fields"`, scope: "sheet", optional: true }));
          continue;
        }
        const cellSegs = underHeader(line, header);
        const c = compareValue({ format: fmt }, value, undefined, { text: lineText(cellSegs), segs: cellSegs }, w.precision);
        const blank = cellSegs.every((x) => /^[-–—]?$/.test(x.text.trim()));
        if (!c.ok && blank && hiddenZero(value, k)) {
          out.push(mk(ctx, { ...base, verdict: "pass", shown: "–", how: ZERO_RULE, scope: `"${header.text}" column of the "${product}" row`, code: ZERO_CODE }));
          continue;
        }
        out.push(mk(ctx, { ...base, verdict: c.ok ? "pass" : blank ? "missing" : "mismatch", shown: blank ? "(blank)" : c.shown, how: c.how, scope: `"${header.text}" column of the "${product}" row${xr ? `, ${vendorName}'s columns` : ""}`, raw: { api: value, screen: lineText(cellSegs) } }));
      }
    }
  }
  return out;
}

/**
 * Master QCS: one column per bidder, rows labelled by the template's own field
 * names, grouped per line item. Every non-empty value the API sends for a
 * bidder must be on the row with that name, in that bidder's column.
 */
function qcsCells(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const schema = ctx.sources[String(s.params?.schema ?? "qschema")]?.chosen?.body as Record<string, any> | undefined;
  const details = ctx.sources[String(s.params?.details ?? "qdetails")]?.chosen;
  const bidders = ((schema?.layers ?? []) as Array<Record<string, any>>).filter((l) => l.key !== "default");
  const says = ctx.snap.segments.find((x) => /no bids/i.test(x.text));
  if (!details && (says || (schema && !bidders.length))) {
    return [mk(ctx, { key: "qcs.nobids", field: "Master QCS", verdict: "skipped", api: "no bidders in the QCS schema", shown: says?.text ?? "(no bid columns)", how: "nothing to compare: no bids have been placed", scope: "qcs" })];
  }
  if (!schema || !details) return [mk(ctx, { key: "qcs", field: "Master QCS", verdict: "unread", api: "—", shown: "—", how: "the QCS schema or details were not seen", scope: "qcs" })];
  const out: ItemResult[] = [];
  const layers = ((schema.layers ?? []) as Array<Record<string, any>>).filter((l) => l.key !== "default");
  for (const l of layers) {
    const seen = anchorsFor(ctx.snap, String(l.label)).length > 0;
    out.push(mk(ctx, { key: "qcs.bidder", field: "Bidder column", item: String(l.label), verdict: seen ? "pass" : "missing", api: String(l.label), shown: seen ? String(l.label) : "(no column)", how: seen ? "the bidder has a column" : "the API lists this bidder but QCS has no column for it", scope: "QCS header", source: "sheets/schema → layers[].label" }));
  }
  const widgets = widgetsOf(schema);
  // On a page that shows the vendors' names in other tables too (the proposal
  // page), the grid is the part below its own panel heading.
  const belowSeg = s.params?.below ? labelSegments(ctx.snap, String(s.params.below)).sort((a, b) => a.box.y - b.box.y)[0] : undefined;
  const minY = belowSeg ? belowSeg.box.y : -1e9;
  const regions = vendorRegions(ctx.snap, layers.map((l) => ({ key: String(l.key), label: String(l.label) })), minY);
  const body = details.body as Record<string, any>;
  for (const [vendorKey, rows] of Object.entries((body.inline_data ?? {}) as Record<string, Array<Record<string, any>>>)) {
    const vendorName = String(layers.find((l) => l.key === vendorKey)?.label ?? vendorKey);
    const region = regions.get(vendorKey) ?? [0, 1e6];
    rows.forEach((row, productIndex) => {
      const product = String(row.product?.value ?? `line item ${productIndex + 1}`);
      for (const [k, cell] of Object.entries(row)) {
        if (SKIP_KEYS.has(k) || !cell || typeof cell !== "object") continue;
        const w = widgets.get(k);
        const name = String((cell as any).name ?? w?.name ?? "");
        const mode = (cell as any).configuration?.mode_type ?? w?.mode;
        if (!name || mode === "hidden") continue;
        const value = (cell as any).value;
        if (value === null || value === undefined || value === "") continue;
        const conf = { ...(w ?? {}), ...((cell as any).configuration ?? {}) } as Record<string, any>;
        const it = (cell as any).input_type ?? w?.inputType;
        const fmt = typeof value === "number" || it === "number" || it === "quantity" ? (conf.prefix ? "money" : "number") : "text";
        const api = fmt === "text" ? String(value) : spellApi({ format: fmt }, value, undefined, conf.prefix ?? "", conf.suffix ?? "");
        const base = { key: `qcs.${k}`, field: name, item: `${vendorName} · ${product}`, api, source: `${details.method} ${details.route} → inline_data.${vendorKey}[${productIndex}].${k}.value` };
        // The row label repeats once per line item group; take this product's occurrence.
        const labels = labelSegments(ctx.snap, name).filter((x) => x.box.y > minY).sort((a, b) => a.box.y - b.box.y);
        const label = labels.length === rows.length ? labels[productIndex] : labels[0];
        if (!label) {
          out.push(mk(ctx, { ...base, verdict: "skipped", shown: "(row not displayed)", how: `no "${name}" row on screen — it may be hidden with "Hide fields"`, scope: "qcs", optional: true }));
          continue;
        }
        const cells = lineOf(ctx.snap, label).filter((x) => x !== label && x.box.x + x.box.w / 2 >= region[0] && x.box.x + x.box.w / 2 < region[1]);
        const c = compareValue({ format: fmt }, value, undefined, { text: lineText(cells), segs: cells }, typeof conf.precision === "number" ? conf.precision : undefined);
        const blank = cells.every((x) => /^[-–—]?$/.test(x.text.trim()));
        if (!c.ok && blank && hiddenZero(value, k)) {
          out.push(mk(ctx, { ...base, verdict: "pass", shown: "–", how: ZERO_RULE, scope: `"${name}" row, ${vendorName}'s column`, code: ZERO_CODE }));
          continue;
        }
        out.push(mk(ctx, { ...base, verdict: c.ok ? "pass" : blank ? "missing" : "mismatch", shown: blank ? "(blank)" : c.shown, how: c.how, scope: `"${name}" row, ${vendorName}'s column`, raw: { api: value, screen: lineText(cells) } }));
      }
    });
  }
  // The per-bidder totals.
  for (const [vendorKey, g] of Object.entries((body.global_data ?? {}) as Record<string, any>)) {
    const total = g?.rfq_final?.gross_total ?? g?.latest_bid_data?.gross_total;
    if (!total || total.value === null || total.value === undefined) continue;
    const vendorName = String(layers.find((l) => l.key === vendorKey)?.label ?? vendorKey);
    const region = regions.get(vendorKey) ?? [0, 1e6];
    const labels = labelSegments(ctx.snap, String(total.name ?? "Sum Total")).filter((x) => x.box.y > minY);
    const cells = labels.flatMap((l) => lineOf(ctx.snap, l).filter((x) => x !== l && x.box.x + x.box.w / 2 >= region[0] && x.box.x + x.box.w / 2 < region[1]));
    const c = compareValue({ format: "money" }, total.value, undefined, { text: lineText(cells), segs: cells }, 2);
    out.push(mk(ctx, { key: "qcs.gross_total", field: String(total.name ?? "Sum Total"), item: vendorName, verdict: !labels.length ? "missing" : c.ok ? "pass" : "mismatch", api: spellApi({ format: "money" }, total.value, undefined, total.configuration?.prefix ?? "₹"), shown: labels.length ? c.shown : "(no Sum Total row)", how: c.how, scope: `"Sum Total" row, ${vendorName}'s column`, source: `${details.method} ${details.route} → global_data.${vendorKey}.rfq_final.gross_total.value` }));
  }
  return out;
}

// ── api-vs-screen-errors ───────────────────────────────────────────────────
const SCREEN_ERROR = /something went wrong|unable to (load|fetch)|failed to (load|fetch)|internal server error|an error occurred|oops/i;
/** Calls whose failure is background noise the user never depends on. */
const BENIGN = /server_current_time|user_preferences|event_tracking|chats\/|notification|pending_tasks|lightspeed/;

function apiVsScreen(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const mapped = new Set(Object.values(ctx.sources).flatMap((x) => x.responses.map((r) => r.seq)));
  const failed = ctx.responses.filter((r) => !r.ok);
  const errToasts = ctx.toasts.filter((t) => t.severity === "error").map((t) => t.text);
  const okToasts = ctx.toasts.filter((t) => t.severity === "success").map((t) => t.text);
  const errText = ctx.snap.segments.filter((x) => x.kind === "text" && SCREEN_ERROR.test(x.text)).map((x) => x.text);
  const uiSaysError = [...errToasts, ...errText];
  const out: ItemResult[] = [];
  for (const f of failed) {
    const important = mapped.has(f.seq) || f.status >= 500 || !BENIGN.test(f.path);
    if (!important) continue;
    const told = uiSaysError.length > 0;
    out.push(
      mk(ctx, {
        key: "errors.api-failed",
        field: "A request behind this screen failed",
        item: `${f.method} ${f.route}`,
        verdict: okToasts.length || !told ? "mismatch" : "pass",
        api: `HTTP ${f.status}`,
        shown: okToasts.length ? `success message: "${okToasts[0]}"` : told ? `error shown: "${excerpt(uiSaysError[0], 100)}"` : "the screen showed no error",
        how: okToasts.length
          ? "the API refused but the screen said it worked"
          : told
            ? "the screen told the user something went wrong"
            : `the API answered HTTP ${f.status} but the screen gave no sign of it${mapped.has(f.seq) ? " — and this call feeds fields on this screen" : ""}`,
        scope: "whole screen",
        source: `${f.method} ${f.path}`,
      }),
    );
  }
  if (!failed.length && uiSaysError.length) {
    out.push(
      mk(ctx, {
        key: "errors.ui-error",
        field: "The screen reported an error",
        verdict: "mismatch",
        api: `${ctx.responses.length} request(s), all succeeded`,
        shown: excerpt(uiSaysError.join(" | "), 160),
        how: "the screen said something failed but every API call behind it succeeded",
        scope: "whole screen",
      }),
    );
  }
  if (!out.length)
    out.push(mk(ctx, { key: "errors.none", field: "Errors agree", verdict: "pass", api: `${ctx.responses.length} request(s), ${failed.length} failed`, shown: uiSaysError.length ? excerpt(uiSaysError[0]) : "no error shown", how: "the API and the screen agree that nothing failed", scope: "whole screen" }));
  void s;
  return out;
}

export function runSpecial(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  switch (s.kind) {
    case "list-search":
      return listSearch(ctx, s);
    case "stage-status":
      return stageStatus(ctx, s);
    case "sheet-widgets":
      return sheetWidgets(ctx, s);
    case "qcs-cells":
      return qcsCells(ctx, s);
    case "api-vs-screen-errors":
      return apiVsScreen(ctx, s);
    default:
      return runMoreSpecial(ctx, s) ?? [];
  }
}

