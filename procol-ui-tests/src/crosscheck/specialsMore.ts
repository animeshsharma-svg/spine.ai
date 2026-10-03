import type { SpecialSpec } from "./fieldMap.js";
import { get, getAll } from "./fieldMap.js";
import type { Segment } from "./screenText.js";
import type { ItemResult } from "./checks.js";
import { compareValue, spellApi } from "./checks.js";
import { datesIn as datesInText, findText, normText, numbersIn, toInstant, toNumber } from "./normalize.js";
import { anchorsFor, besideLabel, excerpt, headerAbove, labelSegments, lineOf, lineText, underHeader } from "./scopes.js";
import type { SpecialContext } from "./specials.js";

/**
 * More checks a flat field list cannot express, added with the second batch of
 * screens (proposal, technical responses, auction, participants). Every rule
 * names the dashboard code it mirrors, so a disagreement can be traced to what
 * the screen is SUPPOSED to do — not to a guess.
 */

type R = Omit<ItemResult, "case" | "screen">;
const mk = (ctx: SpecialContext, r: R): ItemResult => ({ case: ctx.caseId, screen: ctx.screen, ...r });
const textual = (s: Segment) => (s.kind === "text" || s.kind === "title") && !s.overlay;

// ── serial-numbers ─────────────────────────────────────────────────────────
/**
 * A table's "S No." column numbers the rows 1, 2, 3 … in the order the API
 * lists them. params: { source, rowsOf (path to each row's anchor text), header }.
 * The console computes it as (currentPage − 1) × 20 + index + 1
 * (views/projectDetails/components/participantsTable.jsx:153-155).
 */
function serialNumbers(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "audience")];
  const header = String(s.params?.header ?? "S No.");
  const base = { key: "table.serial", field: `"${header}" column`, code: s.code };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the API call behind this table was not seen", scope: "table" })];
  const names = getAll(src.chosen.body, String(s.params?.rowsOf ?? "vendors[].name")).map(String);
  const out: ItemResult[] = [];
  names.forEach((name, i) => {
    const want = i + 1;
    const anchors = anchorsFor(ctx.snap, name);
    const r0 = { ...base, item: name, api: `row ${want} of ${names.length}`, source: `${src.chosen!.method} ${src.chosen!.route} → ${s.params?.rowsOf}` };
    if (!anchors.length) {
      out.push(mk(ctx, { ...r0, verdict: "missing", shown: "(no row)", how: `no row for "${name}" on screen`, scope: "table" }));
      return;
    }
    // The row whose header is nearest above — the table may appear once.
    let best: { cell: Segment[]; header: Segment } | null = null;
    for (const a of anchors) {
      const h = headerAbove(ctx.snap, header, a.box.y);
      if (!h) continue;
      const cell = underHeader(lineOf(ctx.snap, a), h);
      if (!best || h.box.y > best.header.box.y) best = { cell, header: h };
    }
    if (!best) {
      out.push(mk(ctx, { ...r0, verdict: "skipped", shown: "(no such column)", how: `no "${header}" column above the row`, scope: "table", optional: true }));
      return;
    }
    const text = lineText(best.cell).trim();
    const nums = numbersIn(text);
    const ok = nums.length === 1 && nums[0] === want && /^\d+\.?$/.test(text);
    out.push(
      mk(ctx, {
        ...r0,
        verdict: ok ? "pass" : text ? "mismatch" : "missing",
        shown: text || "(blank)",
        how: ok ? "numbered as the API lists it" : `the "${header}" cell should read ${want}`,
        scope: `"${header}" column of the row for "${name}"`,
        raw: { api: want, screen: text },
      }),
    );
  });
  return out;
}

// ── approval-conditions ────────────────────────────────────────────────────
/** comma() with no precision: en-IN grouping, at most 2 decimals (utils/index.js:288-296). */
const comma = (n: unknown) =>
  n === null || n === undefined || n === "" ? "" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));

/** The sentence ApprovalConditions builds (views/projectProposal/projectProposal.jsx:127-183). */
export function approvalConditionsText(conditions: Array<Record<string, any>>): string {
  const parts: string[] = [];
  for (const c of conditions) {
    if (c.type === "selection") {
      parts.push(`(${c.name} is ${(c.values ?? []).map((v: any) => `${v?.label}`).join(" or ")})`);
    }
    if (c.type === "price_range" || c.type === "range") {
      const [a, b] = c.values ?? [];
      if (a && b) parts.push(`(${c.name} is more than ${comma(a)} and less than ${comma(b)})`);
      else if (a && !b) parts.push(`(${c.name} is more than ${comma(a)})`);
      else parts.push(`(${c.name} is less than ${comma(b)})`);
    }
  }
  const s = parts.join(" and ");
  if (conditions.length === 1) return s.slice(1, -1);
  if (conditions.length < 3) return s;
  const first = s.slice(0, s.indexOf("and")).trim();
  return `${first} + ${conditions.length - 1} more`;
}

function approvalConditions(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "proposal")];
  const label = String(s.params?.label ?? "Approval Workflow Conditions");
  const base = { key: "proposal.approval_conditions", field: "Approval workflow conditions", code: s.code };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the proposal was not read from the API on this screen", scope: "label" })];
  const conds = get(src.chosen.body, String(s.params?.path ?? "approval_conditions"));
  if (!Array.isArray(conds) || !conds.length) return [mk(ctx, { ...base, verdict: "skipped", api: "(no conditions)", shown: "—", how: "the proposal has no approval conditions", scope: "label" })];
  const want = approvalConditionsText(conds as Array<Record<string, any>>);
  const labels = labelSegments(ctx.snap, label);
  if (!labels.length) return [mk(ctx, { ...base, verdict: "missing", api: want, shown: "(no such label)", how: `no "${label}" on screen`, scope: "label", raw: { api: conds } })];
  const texts = labels.flatMap((l) => besideLabel(ctx.snap, l).map((x) => x.text));
  const m = findText(want, texts);
  return [
    mk(ctx, {
      ...base,
      verdict: m.ok ? "pass" : "mismatch",
      api: want,
      shown: excerpt(texts.join(" | ")),
      how: m.ok ? "the sentence matches the one the console builds from the API's conditions" : "the conditions sentence differs from the one the console should build",
      scope: `next to "${label}"`,
      source: `${src.chosen.method} ${src.chosen.route} → approval_conditions`,
      raw: { api: conds, screen: texts.join(" | ") },
    }),
  ];
}

// ── technical-answers ──────────────────────────────────────────────────────
/**
 * The technical (RFP) responses grid: one column per vendor, one row per
 * question, the question written "<name> - <description>"
 * (getRfiQuestion, redux/orders/selectors.js:1510-1515). Every answer the
 * vendor gave must be on that question's row, in that vendor's column.
 */
function technicalAnswers(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const schema = ctx.sources[String(s.params?.schema ?? "schema")]?.chosen?.body as Record<string, any> | undefined;
  const quotesSrc = ctx.sources[String(s.params?.quotes ?? "quotes")];
  if (!schema) return [mk(ctx, { key: "tech", field: "Technical responses", verdict: "unread", api: "—", shown: "—", how: "the stage schema was not seen", scope: "grid", code: s.code })];
  const forms = (schema.sheets?.forms ?? []) as Array<Record<string, any>>;
  const layers = ((schema.layers ?? []) as Array<Record<string, any>>).filter((l) => l.key !== "default");
  const out: ItemResult[] = [];
  const labelsMap = schema.trade_config?.evaluation_score_label_mapping as Record<string, any> | undefined;
  // Vendor columns, left to right.
  const heads = layers
    .map((l) => ({ key: String(l.key), label: String(l.label), seg: anchorsFor(ctx.snap, String(l.label)).sort((a, b) => a.box.y - b.box.y)[0] }))
    .filter((h) => h.seg)
    .sort((a, b) => a.seg!.box.x - b.seg!.box.x);
  const regionOf = (key: string): [number, number] => {
    const i = heads.findIndex((h) => h.key === key);
    if (i < 0) return [0, 1e6];
    return [heads[i].seg!.box.x - 30, i + 1 < heads.length ? heads[i + 1].seg!.box.x - 30 : 1e6];
  };
  const seenSheets = new Set<string>();
  for (const r of quotesSrc?.responses ?? []) {
    if (!r.ok || !r.body) continue;
    const body = r.body as Record<string, any>;
    if (!body.data || seenSheets.has(String(body.sheet_uuid))) continue;
    seenSheets.add(String(body.sheet_uuid));
    for (const [vendorKey, sections] of Object.entries(body.data as Record<string, Array<Record<string, any>>>)) {
      const vendorName = String(layers.find((l) => l.key === vendorKey)?.label ?? body.participants?.company?.name ?? vendorKey);
      const region = regionOf(vendorKey);
      for (const section of sections ?? []) {
        const form = forms.find((f) => f.uuid === section.form_uuid);
        if (!form) continue;
        const page = (form.page_uuids ?? [])[0];
        const answers = (section[page] ?? []) as Array<Record<string, any>>;
        for (const a of answers) {
          const hdr = ((form.page_response_headers ?? []) as Array<Record<string, any>>).find((h) => h.key_attribute === a.key_attribute);
          if (!hdr) continue;
          const isScore = a.key_attribute === "evaluation_score";
          let value: unknown = a.value;
          if (value && typeof value === "object" && "value" in (value as object)) value = (value as any).value;
          if (value === null || value === undefined || value === "" || Array.isArray(value)) continue;
          const question = hdr.name && hdr.description ? `${hdr.name} - ${hdr.description}` : String(hdr.name);
          // A score is shown by its label from the mapping when there is one.
          const mapped = isScore && labelsMap ? labelsMap[String(value)] : undefined;
          const want = isScore && mapped ? String(typeof mapped === "object" ? mapped.label ?? mapped.value ?? value : mapped) : String(value);
          const base = {
            key: isScore ? "tech.score" : "tech.answer",
            field: isScore ? "Evaluation score" : `Answer to "${question.trim()}"`,
            item: `${vendorName} · ${form.name}`,
            api: want,
            source: `${r.method} ${r.route} → data.${vendorKey}[].${page}[key_attribute=${a.key_attribute}].value`,
            code: s.code,
          };
          const labels = labelSegments(ctx.snap, question).sort((x, y) => x.box.y - y.box.y);
          const label = labels[Number(form.serial_number ?? 1) - 1] ?? labels[0];
          if (!label) {
            out.push(mk(ctx, { ...base, verdict: "missing", shown: "(question not on screen)", how: `no row "${question}"`, scope: "grid", raw: { api: a.value } }));
            continue;
          }
          let cells = lineOf(ctx.snap, label).filter((x) => x !== label && x.box.x + x.box.w / 2 >= region[0] && x.box.x + x.box.w / 2 < region[1]);
          if (!cells.length) cells = besideLabel(ctx.snap, label);
          const c = compareValue({ format: "text" }, want, undefined, { text: lineText(cells), segs: cells });
          const blank = cells.every((x) => /^[-–—]?$/.test(x.text.trim()));
          out.push(mk(ctx, { ...base, verdict: c.ok ? "pass" : blank ? "missing" : "mismatch", shown: blank ? "(blank)" : c.shown, how: c.how, scope: `row "${question.trim()}", ${vendorName}'s column`, raw: { api: a.value, screen: lineText(cells) } }));
        }
      }
    }
  }
  if (!out.length) out.push(mk(ctx, { key: "tech.none", field: "Technical answers", verdict: "skipped", api: "no answers in the API", shown: "—", how: "nothing to compare: no vendor answered a question", scope: "grid", code: s.code }));
  return out;
}

// ── auction-standings ──────────────────────────────────────────────────────
/**
 * Each bidder's rank on the auction's live view: the layer's rank, replaced by
 * event_indicators' global rank when the stage's auction identifiers include
 * "rank" (redux/orders/selectors.js:5681-5690); shown as a bare number by the
 * bidder's name only when !is_alternate_bidding_allowed && rank &&
 * (auction_closing_mode === "lot" || show_rank_on_lot)
 * (comparisonHeaderFormatter.jsx:592-595). The per-line "Rank" column reads the
 * quote's inline rank, replaced by event_indicators' inline rank
 * (selectors.js:5916-5941).
 */
function auctionStandings(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const schema = ctx.sources[String(s.params?.schema ?? "schema")]?.chosen?.body as Record<string, any> | undefined;
  const ind = ctx.sources[String(s.params?.indicators ?? "indicators")]?.chosen?.body as Record<string, any> | undefined;
  const quotesSrc = ctx.sources[String(s.params?.quotes ?? "quotes")];
  if (!schema) return [mk(ctx, { key: "auction", field: "Auction standings", verdict: "unread", api: "—", shown: "—", how: "the stage schema was not seen", scope: "grid", code: s.code })];
  const out: ItemResult[] = [];
  const tc = (schema.trade_config ?? {}) as Record<string, any>;
  const useInd = Array.isArray(ind?.auction_identifiers) && ind!.auction_identifiers.includes("rank");
  const layers = ((schema.layers ?? []) as Array<Record<string, any>>).filter((l) => l.key !== "default");
  const badgeShown = !tc.is_alternate_bidding_allowed && (tc.auction_closing_mode === "lot" || !!tc.show_rank_on_lot);
  const heads = layers
    .map((l) => ({ l, seg: anchorsFor(ctx.snap, String(l.label)).sort((a, b) => a.box.y - b.box.y)[0] }))
    .filter((h) => h.seg)
    .sort((a, b) => a.seg!.box.x - b.seg!.box.x);
  for (const l of layers) {
    const want = useInd ? ind?.auction_identifiers_data?.[l.key]?.global?.rank?.value ?? l.rank : l.rank;
    const base = { key: "auction.rank", field: "Bidder's rank", item: String(l.label), api: want === undefined || want === null ? "(no rank)" : String(want), code: s.code, source: useInd ? "event_indicators → auction_identifiers_data.<vendor>.global.rank.value" : "schema → layers[].rank" };
    if (want === undefined || want === null || want === "") {
      out.push(mk(ctx, { ...base, verdict: "skipped", shown: "—", how: "the API gives this bidder no rank, so there is nothing to show", scope: "bidder header" }));
      continue;
    }
    if (!badgeShown) {
      out.push(mk(ctx, { ...base, verdict: "skipped", shown: "—", how: `the console hides the rank badge here (auction closing mode "${tc.auction_closing_mode ?? "none"}", show_rank_on_lot ${!!tc.show_rank_on_lot})`, scope: "bidder header" }));
      continue;
    }
    const head = heads.find((h) => h.l === l)?.seg;
    if (!head) {
      out.push(mk(ctx, { ...base, verdict: "missing", shown: "(no column)", how: "the API lists this bidder but the grid has no column for it", scope: "bidder header" }));
      continue;
    }
    // The badge: a bare number just above or left of the bidder's name.
    const near = ctx.snap.segments.filter((x) => textual(x) && /^\s*#?\d+\s*$/.test(x.text) && Math.abs(x.box.x - head.box.x) < 80 && head.box.y - x.box.y < 60 && x.box.y - head.box.y < Math.max(6, head.box.h));
    const shown = near.map((x) => x.text.trim());
    const ok = shown.some((t) => Number(t.replace("#", "")) === Number(want));
    out.push(mk(ctx, { ...base, verdict: ok ? "pass" : shown.length ? "mismatch" : "missing", shown: shown.join(", ") || "(no rank badge)", how: ok ? "the rank badge matches" : `expected the badge ${want} by the bidder's name`, scope: "bidder header", raw: { api: want, screen: shown.join(", ") } }));
  }
  // Per-line inline rank, in the bidder's "Rank" column.
  const regions = new Map<string, [number, number]>();
  heads.forEach((h, i) => regions.set(String(h.l.key), [h.seg!.box.x - 30, i + 1 < heads.length ? heads[i + 1].seg!.box.x - 30 : 1e6]));
  for (const r of quotesSrc?.responses ?? []) {
    if (!r.ok || !r.body) continue;
    const body = r.body as Record<string, any>;
    const vendorKey = String(body.participants?.company?.uuid ?? Object.keys(body.inline_data ?? {})[0] ?? "");
    const vendorName = String(body.participants?.company?.name ?? vendorKey);
    for (const row of (body.inline_data?.[vendorKey] ?? []) as Array<Record<string, any>>) {
      const tp = String(row.product?.trade_product_uuid ?? row.trade_product_uuid ?? "");
      const apiRank = useInd ? ind?.auction_identifiers_data?.[vendorKey]?.inline?.[tp]?.rank?.value : row.rank?.value;
      if (apiRank === undefined || apiRank === null) continue;
      const product = String(row.product?.value ?? "");
      const base = { key: "auction.inline_rank", field: "Line rank", item: `${vendorName} · ${product}`, api: String(apiRank), code: s.code, source: `${r.method} ${r.route} → inline_data.${vendorKey}[].rank.value${useInd ? " (overridden by event_indicators inline rank)" : ""}` };
      const anchors = anchorsFor(ctx.snap, product);
      if (!anchors.length) {
        out.push(mk(ctx, { ...base, verdict: "missing", shown: "(no row)", how: `no row for "${product}"`, scope: "grid" }));
        continue;
      }
      const header = headerAbove(ctx.snap, "Rank", anchors[0].box.y, regions.get(vendorKey));
      if (!header) {
        out.push(mk(ctx, { ...base, verdict: "skipped", shown: "(no Rank column)", how: "no \"Rank\" column in this bidder's columns — it may be hidden", scope: "grid", optional: true }));
        continue;
      }
      const cell = underHeader(lineOf(ctx.snap, anchors[0]), header);
      const nums = numbersIn(lineText(cell));
      const ok = nums.includes(Number(apiRank));
      out.push(mk(ctx, { ...base, verdict: ok ? "pass" : nums.length ? "mismatch" : "missing", shown: lineText(cell) || "(blank)", how: ok ? "same rank" : `expected ${apiRank}`, scope: `"Rank" column of "${product}", ${vendorName}'s columns`, raw: { api: apiRank, screen: lineText(cell) } }));
    }
  }
  return out;
}

// ── stage-countdown ────────────────────────────────────────────────────────
/**
 * While a stage is live, the header timer counts down to ending_at; in its
 * buffer, to extra_closing_time (getOrderTimerRange, views/orderDetails/
 * helpers.js:720-756; timer.jsx:20-29). The timer text ("2m : 23s",
 * "1d : 2h : 3m : 04s") must equal the API's end minus the time the screen
 * was read, within `slackSeconds` (render + read delay; default 15).
 */
export function countdownSeconds(text: string): number | null {
  const m = text.match(/^\s*(?:(\d+)\s*d\s*:\s*)?(?:(\d+)\s*h\s*:\s*)?(?:(\d+)\s*m\s*:\s*)?(\d+)\s*s\s*$/i);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

function stageCountdown(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "schema")];
  const base = { key: "stage.countdown", field: "Time left", code: s.code };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the stage was not read from the API", scope: "header" })];
  const st = src.chosen.body as Record<string, any>;
  const now = Date.parse(ctx.snap.takenAt);
  const start = toInstant(st.starting_from);
  const end = toInstant(st.ending_at);
  const extra = toInstant(st.extra_closing_time);
  const target = st.status === "active" && start && end ? (now >= start && now < end ? end : extra && now >= end && now < extra ? extra : null) : null;
  if (!target) return [mk(ctx, { ...base, verdict: "skipped", api: "the stage is not live", shown: "—", how: "no countdown to compare: the stage is not in its bidding or buffer window", scope: "header" })];
  const skew = Number(ctx.vars.clockSkewMs ?? 0);
  const want = Math.round((target - now) / 1000);
  const timers = ctx.snap.segments.filter((x) => textual(x) && countdownSeconds(x.text) !== null && /\d\s*[ms]\b/i.test(x.text));
  const slack = Number(s.params?.slackSeconds ?? 15) + Math.abs(skew) / 1000;
  const shown = timers.map((x) => ({ t: x.text, sec: countdownSeconds(x.text)! }));
  const ok = shown.some((x) => Math.abs(x.sec - want) <= slack);
  return [
    mk(ctx, {
      ...base,
      item: String(st.title ?? ""),
      verdict: ok ? "pass" : shown.length ? "mismatch" : "missing",
      api: `${want} s left (ends ${spellApi({ format: "datetime" }, target)})`,
      shown: shown.map((x) => `${x.t} = ${x.sec} s`).join("; ") || "(no timer)",
      how: ok ? `the timer agrees within ${Math.round(slack)} s` : `expected about ${want} s (±${Math.round(slack)} s)`,
      scope: "stage header",
      source: `${src.chosen.method} ${src.chosen.route} → ending_at / extra_closing_time`,
      raw: { api: { ending_at: st.ending_at, extra_closing_time: st.extra_closing_time, readAt: ctx.snap.takenAt }, screen: shown.map((x) => x.t).join("; ") },
    }),
  ];
}


// ── price-trend-rows ───────────────────────────────────────────────────────
/**
 * Price Trends Details: one row per past deal, newest first
 * (redux/priceTrends/index.js:25-75, sorted by bid_closed_at desc); columns
 * Product, Variant, Quantity (raw), Price (display_closing_price, raw), Bid
 * Closed At (appFormatDate DATE_TIME of bid_closed_at), Location
 * (delivery_zone.display_name), Vendor (components/priceTrendsHistory/columns.jsx:12-58).
 * A row is found by its closing time (the one value unique per row); every
 * other value must be on that row's line.
 */
function priceTrendRows(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "trends")];
  const base = { key: "trends.row", field: "Past deal", code: s.code };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the price-trends request was not seen", scope: "table" })];
  const out: ItemResult[] = [];
  const groups = (get(src.chosen.body, "past_requests") ?? []) as Array<Record<string, any>>;
  const dateSegs = ctx.snap.segments.filter((x) => textual(x) && datesInText(x.text).length);
  // The table is every deal of every product, newest first, ten a page
  // (redux/priceTrends/index.js:75 sort; components/priceTrendsHistory/priceTrendsHistory.jsx:14-18).
  const rows = groups
    .flatMap((g) => ((g.data ?? []) as Array<Record<string, any>>).map((d) => ({ g, d })))
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => Number(b.d.bid_closed_at) - Number(a.d.bid_closed_at) || a.i - b.i);
  // The chart legend counts the deals per product and variant (views/priceTrends/priceTrendsGraph.jsx:120-135).
  const perGroup = new Map<string, { name: string; n: number }>();
  for (const { g, d } of rows) {
    const k = `${g.product_uuid}${d.product_variant_uuid}`;
    perGroup.set(k, { name: `${g.product_name} (${d.product_variant_name})`, n: (perGroup.get(k)?.n ?? 0) + 1 });
  }
  for (const { name, n } of perGroup.values()) {
    const seg = ctx.snap.segments.find((x) => textual(x) && new RegExp(`\\(\\s*(\\d+)\\s+deals?\\s*\\)`, "i").test(x.text) && findText(name.split(" (")[0], [lineText(lineOf(ctx.snap, x))]).ok);
    const shownN = seg ? Number(seg.text.match(/\(\s*(\d+)\s+deals?/i)![1]) : null;
    out.push(mk(ctx, { ...base, key: "trends.count", field: "Deals in the chart legend", item: name, verdict: shownN === null ? "missing" : shownN === n ? "pass" : "mismatch", api: `${n} deal(s)`, shown: seg?.text ?? "(no legend entry)", how: shownN === n ? "same count" : `expected "(${n} deals)"`, scope: "Price trends chart legend", source: `${src.chosen.method} ${src.chosen.route} → past_requests[].data (count per product + variant)`, code: "views/priceTrends/priceTrendsGraph.jsx:120-135", raw: { api: n, screen: seg?.text } }));
  }
  for (const [pos, { g, d }] of rows.entries()) {
    {
      const at = toInstant(d.bid_closed_at);
      if (at === null) continue;
      const item = `${g.product_name} · ${d.quantity} · ${spellApi({ format: "datetime" }, at)}`;
      if (pos >= 10) {
        out.push(mk(ctx, { ...base, item, verdict: "skipped", api: `deal ${pos + 1} of ${rows.length}`, shown: "(on a later page)", how: "the table shows ten deals a page, newest first; this one is on a later page", scope: "Price Trends Details" }));
        continue;
      }
      const hits = dateSegs.filter((x) => datesInText(x.text).some((t) => t.hasTime && Math.floor(t.at / 60_000) === Math.floor(at / 60_000)));
      if (!hits.length) {
        out.push(mk(ctx, { ...base, item, verdict: "missing", api: `closed ${spellApi({ format: "datetime" }, at)}`, shown: "(no row with that closing time)", how: "no row shows this deal's closing time in India time", scope: "Price Trends Details", source: `${src.chosen.method} ${src.chosen.route} → past_requests[].data[].bid_closed_at`, raw: { api: d.bid_closed_at } }));
        continue;
      }
      const want: Array<[string, unknown]> = [
        ["Price", d.display_closing_price],
        ["Quantity", d.quantity],
        ["Location", d.delivery_zone?.display_name],
        ["Vendor", d.vendor_name],
        ["Product", g.product_name],
      ];
      // Several rows can share a closing minute; pass when one of them carries everything.
      let best: { line: string; bad: string[] } | null = null;
      for (const h of hits) {
        const line = lineText(lineOf(ctx.snap, h));
        const bad = want.filter(([, v]) => v !== null && v !== undefined && v !== "" && !findText(String(v), [line]).ok).map(([k, v]) => `${k} "${v}"`);
        if (!best || bad.length < best.bad.length) best = { line, bad };
        if (!bad.length) break;
      }
      out.push(mk(ctx, { ...base, item, verdict: best!.bad.length ? "mismatch" : "pass", api: want.map(([k, v]) => `${k} ${v ?? "-"}`).join(" · "), shown: excerpt(best!.line), how: best!.bad.length ? `not on the row: ${best!.bad.join(", ")}` : "every value of the deal is on its row", scope: "Price Trends Details", source: `${src.chosen.method} ${src.chosen.route} → past_requests[].data[]`, raw: { api: d, screen: best!.line } }));
    }
  }
  if (!out.length) out.push(mk(ctx, { ...base, verdict: "skipped", api: "no past deals", shown: "—", how: "the API returned no past deals for this product", scope: "table" }));
  return out;
}

// ── bidding-summary ────────────────────────────────────────────────────────
/**
 * Overview → Bidding Summary, line-item wise: per product, the columns are the
 * ranks ("Best Market Price", "Rank 2 Market Price" …) and the rows are the
 * event_summary's line_data columns ("Vendor Name", "Price Quoted"); cell
 * (row, rank i) = line_data.data.inline_data[tp]["l"+i][rowKey], shown raw
 * (views/orderDetails/biddingSummary.jsx:23-84; redux/orders/selectors.js:7477-7575).
 * So rank i's vendor and price must sit in the i-th position of their rows.
 */
function biddingSummary(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const src = ctx.sources[String(s.params?.source ?? "summary")];
  const base = { key: "ov.ranks", field: "Bidding Summary by rank", code: s.code };
  if (!src?.chosen) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the event summary was not seen", scope: "Bidding Summary" })];
  const body = src.chosen.body as Record<string, any>;
  const cols = (body.line_data?.columns?.inline ?? {}) as Record<string, string>;
  const data = (body.line_data?.data?.inline_data ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const products = (body.trade_products ?? []) as Array<Record<string, any>>;
  const out: ItemResult[] = [];
  const tps = Object.keys(data);
  tps.forEach((tp, pIdx) => {
    const ranks = Object.keys(data[tp]).filter((k) => /^l\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const product = String(products.find((p) => p.uuid === tp || p.trade_product_uuid === tp)?.name ?? `line item ${pIdx + 1}`);
    for (const [colKey, colLabel] of Object.entries(cols)) {
      // "Vendor Name" is also a column of the Aggregate Lot Wise table above; the
      // line-item rows are the ones below the "Line Item Wise" heading (biddingSummary.jsx).
      const lineWise = labelSegments(ctx.snap, "Line Item Wise")[0];
      const labels = labelSegments(ctx.snap, colLabel).filter((x) => !lineWise || x.box.y > lineWise.box.y).sort((a, b) => a.box.y - b.box.y);
      const label = labels.length === tps.length ? labels[pIdx] : labels[0];
      const want = ranks.map((r) => data[tp][r]?.[colKey]).map((v) => (v === null || v === undefined ? "" : String(v)));
      const r0 = { ...base, item: `${product} · ${colLabel}`, api: want.map((v, i) => `${i + 1}: ${v || "-"}`).join(" | "), source: `${src.chosen!.method} ${src.chosen!.route} → line_data.data.inline_data.${tp}.l1..l${ranks.length}.${colKey}` };
      if (!label) {
        out.push(mk(ctx, { ...r0, verdict: "missing", shown: "(no such row)", how: `no "${colLabel}" row in the Bidding Summary`, scope: "Bidding Summary" }));
        continue;
      }
      // The values sit on the label's line (horizontal) or in the block just below it.
      // Right of the label, on its line or wrapped just below it (a long name with a "Surrogate" tag wraps).
      const L = label.box;
      let cells = ctx.snap.segments.filter((x) => x !== label && textual(x) && x.box.x > L.x + L.w - 4 && x.box.y + x.box.h >= L.y - 20 && x.box.y <= L.y + L.h + 20);
      if (!cells.length) cells = besideLabel(ctx.snap, label);
      // Rank columns run left to right; within a cell, top to bottom.
      const texts = cells.sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y).map((x) => x.text);
      // One segment may hold all values ("₹ 100/KG ₹ 110/KG ₹ 120/KG"): find each in order.
      const joined = texts.join(" | ");
      let pos = 0;
      const bad: string[] = [];
      want.forEach((w, i) => {
        if (!w) return;
        const wn = normText(w);
        const hay = normText(joined);
        let at = hay.indexOf(wn, pos);
        if (at < 0) {
          // a name the console truncated: "QA_Platform Vendor 1 1790..."
          const pre = wn.slice(0, 20);
          at = hay.indexOf(pre, pos);
        }
        if (at < 0) bad.push(`rank ${i + 1} "${w}" not found in order`);
        else pos = at + 1;
      });
      out.push(mk(ctx, { ...r0, verdict: bad.length ? "mismatch" : "pass", shown: excerpt(joined), how: bad.length ? bad.join("; ") : "every rank's value is in its place, best first", scope: `"${colLabel}" row of ${product}`, raw: { api: data[tp], screen: joined } }));
    }
  });
  if (!out.length) out.push(mk(ctx, { ...base, verdict: "skipped", api: "no ranked bids", shown: "—", how: "the event summary has no line-item ranks", scope: "Bidding Summary" }));
  return out;
}

// ── product-sheet ──────────────────────────────────────────────────────────
/**
 * Overview → Product Sheet: one row per order_details line, one column per
 * template widget (header = widget name); a buyer value is
 * comma(value, precision) with the cell's prefix/suffix
 * (redux/orders/selectors.js:5199-5233; components/sheet/sheet.jsx:953-957,1017-1027).
 * Checked: every creator (buyer-side) value the API sends for a line.
 */
function productSheet(ctx: SpecialContext, s: SpecialSpec): ItemResult[] {
  const schema = ctx.sources[String(s.params?.schema ?? "schema")]?.chosen?.body as Record<string, any> | undefined;
  const base = { key: "sheet.creator", field: "Product sheet", code: s.code };
  if (!schema) return [mk(ctx, { ...base, verdict: "unread", api: "—", shown: "—", how: "the stage schema was not seen", scope: "Product Sheet" })];
  if (["rfp", "rfi"].includes(String(schema.rfx_mode))) return [mk(ctx, { ...base, verdict: "skipped", api: "technical stage", shown: "—", how: "a technical stage has no product sheet (selectors.js:5207-5209)", scope: "Product Sheet" })];
  const widgets = (schema.sheets?.inline_components?.widgets ?? []) as Array<Record<string, any>>;
  const out: ItemResult[] = [];
  const panel = labelSegments(ctx.snap, "Product Sheet")[0];
  for (const row of (schema.order_details ?? []) as Array<Record<string, any>>) {
    const product = String(row.product?.value ?? "");
    const anchors = anchorsFor(ctx.snap, product).filter((a) => !panel || a.box.y > panel.box.y);
    for (const w of widgets) {
      const k = String(w.key_attribute);
      const cfg = (w.configuration ?? {}) as Record<string, any>;
      if (cfg.field_type !== "creator" || cfg.mode_type === "hidden" || ["action", "status", "serial_number", "product"].includes(k)) continue;
      const cell = row[k];
      const v = cell && typeof cell === "object" ? (cell as any).value : undefined;
      if (v === null || v === undefined || v === "" || typeof v === "object") continue;
      const numeric = ["number", "quantity", "price"].includes(String(w.input_type));
      const prefix = (cell as any).configuration?.prefix ?? cfg.prefix ?? "";
      const suffix = (cell as any).configuration?.suffix ?? cfg.suffix ?? "";
      const api = numeric ? spellApi({ format: "number" }, v, undefined, prefix, suffix) : String(v);
      const r0 = { ...base, key: `sheet.${k}`, field: String(w.name ?? k), item: product, api, source: `schema → order_details[].${k}.value` };
      if (!anchors.length) {
        out.push(mk(ctx, { ...r0, verdict: "missing", shown: "(no row)", how: `no "${product}" row under Product Sheet`, scope: "Product Sheet" }));
        continue;
      }
      const header = headerAbove(ctx.snap, String(w.name), anchors[0].box.y);
      if (!header || (panel && header.box.y < panel.box.y)) {
        out.push(mk(ctx, { ...r0, verdict: "skipped", shown: "(column not displayed)", how: `no "${w.name}" column in the Product Sheet`, scope: "Product Sheet", optional: true }));
        continue;
      }
      // Cells of one table row can sit at different heights (a product name with
      // its code on two lines), so the row is the DOM row, not the visual line.
      const rowSegs = anchors[0].row >= 0 ? ctx.snap.segments.filter((x) => x.row === anchors[0].row && textual(x)) : lineOf(ctx.snap, anchors[0]);
      const segs = underHeader(rowSegs, header);
      const text = lineText(segs);
      const c = numeric
        ? compareValue({ format: suffix ? "quantity" : "number" }, suffix && !String(v).match(/[a-z]/i) ? `${v} ${suffix.replace(/^\//, "")}` : v, undefined, { text, segs }, typeof cfg.precision === "number" ? cfg.precision : undefined)
        : compareValue({ format: "text" }, v, undefined, { text, segs });
      const blank = !text.trim() || /^[-–—]$/.test(text.trim());
      out.push(mk(ctx, { ...r0, verdict: c.ok ? "pass" : blank ? "missing" : "mismatch", shown: blank ? "(blank)" : c.shown, how: c.how, scope: `"${header.text}" column of "${product}"`, raw: { api: cell, screen: text } }));
    }
  }
  if (!out.length) out.push(mk(ctx, { ...base, verdict: "skipped", api: "no buyer values", shown: "—", how: "the API sent no buyer-side values for the product sheet", scope: "Product Sheet" }));
  return out;
}

export function runMoreSpecial(ctx: SpecialContext, s: SpecialSpec): ItemResult[] | null {
  switch (s.kind) {
    case "serial-numbers":
      return serialNumbers(ctx, s);
    case "approval-conditions":
      return approvalConditions(ctx, s);
    case "technical-answers":
      return technicalAnswers(ctx, s);
    case "auction-standings":
      return auctionStandings(ctx, s);
    case "stage-countdown":
      return stageCountdown(ctx, s);
    case "price-trend-rows":
      return priceTrendRows(ctx, s);
    case "bidding-summary":
      return biddingSummary(ctx, s);
    case "product-sheet":
      return productSheet(ctx, s);
    default:
      return null;
  }
}

void toNumber;

