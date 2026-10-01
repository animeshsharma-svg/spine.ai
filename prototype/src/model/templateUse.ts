/**
 * Which kind of event stage a template can build.
 *
 * Template types are strings "t-<type>" in templates.type_identifier
 * (template.rb:58-61 TEMPLATE_FOR_TYPES, :194-197 get_type_identifier_string).
 * GET /templates only accepts those types (templates_controller.rb:118-120 →
 * error 2 "Insufficient parameters" for anything else, e.g. "rfp"/"auction" —
 * seen live). A stage picks its template by its technical/commercial kind:
 *   technical round (RFP, rfx_mode "rfp")   → a "t-rfi" template
 *   commercial round (RFQ / auction)        → a "t-trade" template
 *        buy  = reverse (price goes down) · sell = forward auction (price goes up)
 *   BOQ event                                → a "t-trade" + "t-boq" template
 *   service line items                       → type "service" lists the trade
 *        templates with service templates first (templates_helper.rb:62-76)
 */
import type { EventUse } from "./types.js";

export const TEMPLATE_KIND_PLAIN: Record<EventUse, string> = {
  rfq: "RFQ (price quote)",
  auction: "reverse auction",
  forward_auction: "forward (sell) auction",
  rfp: "RFP (technical questions)",
  boq: "BOQ (bill of quantities)",
  service: "service RFQ",
};

/** The query-string type → which template uses answer it. */
export const EVENT_TYPE_TO_USES: Record<string, EventUse[]> = {
  rfq: ["rfq"],
  rfp: ["rfp"],
  auction: ["auction", "forward_auction"],
  reverse_auction: ["auction"],
  forward_auction: ["forward_auction"],
  boq: ["boq"],
  service: ["service"],
};

export function useForOf(t: { typeIdentifier: string[]; orderType?: string | null; listedUnder: string[] }): EventUse[] {
  const ids = new Set(t.typeIdentifier ?? []);
  const out = new Set<EventUse>();
  if (ids.has("t-rfi")) out.add("rfp");
  if (ids.has("t-trade")) {
    if (ids.has("t-boq")) {
      // BOQ-tagged templates are offered only inside a BOQ project, and there
      // the commercial stage asks for type "boq" (templateSelection.jsx:120-133, 444-446)
      out.add("boq");
    } else if (t.orderType === "sell") {
      // the screen lists sell templates with the rest; a sell order is a forward auction / sale
      out.add("forward_auction");
      out.add("rfq");
    } else {
      out.add("rfq");
      out.add("auction");
    }
  }
  if (ids.has("t-service") || (t.listedUnder.includes("service") && ids.has("t-service"))) out.add("service");
  return [...out];
}
