/**
 * THE SURROGATE BID BODY — the buyer answering the round on a vendor's behalf.
 *
 * Ported from the collection (U.sbValueFor, U.buildSurrogateBody). Every
 * participant question on every form of the round gets an answer: the value
 * named in surrogate_field_values if there is one, else the question's own
 * description, else a default — the same thing the console fills in.
 */
import { cfgJson, cfgNum, cfgStr } from "./config.js";
import type { RunState, SbForm } from "./state.js";

type Header = SbForm["headers"][number];

export function sbValueFor(form: SbForm, h: Header, vendor: { uuid: string; name?: string }, n: number): { set: boolean; value?: unknown } {
  const ov = cfgJson<Record<string, unknown>>("surrogate_field_values") || {};
  const pick = [`${form.name}::${h.name}`, `${form.name}::${h.key}`, h.key, h.name].find((k) => Object.prototype.hasOwnProperty.call(ov, k));
  const tok = (v: unknown) =>
    typeof v === "string" ? v.replace(/\{vendor\}/g, vendor.name || vendor.uuid).replace(/\{n\}/g, String(n + 1)) : v;
  if (pick !== undefined) return { set: true, value: tok(ov[pick]) };
  const t = h.input_type;
  if (t === "multiline_text" || t === "text") {
    if (h.description !== null && h.description !== undefined && h.description !== "") return { set: true, value: h.description };
    return { set: true, value: h.required ? cfgStr("surrogate_default_text") : "" };
  }
  if (t === "number") return h.required ? { set: true, value: cfgNum("surrogate_default_number") } : { set: true, value: null };
  if (t === "dropdown") return { set: true, value: h.required && h.options?.length ? h.options[0].value : null };
  return { set: false }; // date / attachment: key only, as the console sends it
}

export function buildSurrogateBody(state: RunState, vendor: { uuid: string; name?: string }, n: number) {
  const forms = state.sbForms;
  if (!forms) throw new Error("the round's forms were not read — step 4.2 must run first");
  const pr: Record<string, Array<Record<string, unknown>>> = {};
  for (const f of forms) {
    pr[f.page_uuid] = f.headers.map((h) => {
      const v = sbValueFor(f, h, vendor, n);
      const o: Record<string, unknown> = { key_attribute: h.key };
      if (v.set) o.value = v.value;
      return o;
    });
  }
  return {
    item_type: "TradeRequest",
    item_uuid: state.sbTrade,
    company_uuid: vendor.uuid,
    page_responses: pr,
    page_uuids: forms.map((f) => f.page_uuid),
    surrogate_remarks: { remarks: cfgStr("surrogate_remarks"), attachments: [] },
  } as Record<string, any>;
}
