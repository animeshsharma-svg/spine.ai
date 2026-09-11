/**
 * FEATURE → API MODULE.
 *
 * The feature tree is written in the language of Procol's product docs
 * ("Delivery & receiving", "Finance"); the API automation suite next door is
 * keyed on the platform's own datasources ("p2p_grn", "p2p_invoice"). This is
 * the one place the two vocabularies meet.
 *
 * It exists so a module is chosen ONCE, in the UI, by ticking a feature — and
 * the API report that opens is already narrowed to that module. Nobody types
 * `MODULE=p2p_purchase_order` on a command line to get there.
 *
 * A feature with no API module (Intake, Negotiation) maps to nothing, and that
 * is honest: the suite has no datasource for it, so scoping a report to it
 * would show an empty page rather than "not covered".
 */

/** Feature or group id → the module label the API report uses. */
const FEATURE_TO_MODULE: Record<string, string> = {
  // Purchase orders
  po: "PO",
  "po.generate": "PO",
  "po.contents": "PO",
  "po.release": "PO",
  "po.vendor_accept": "PO",

  // Delivery & receiving
  "p2p.proforma": "Proforma invoice",
  "p2p.asn": "Advance shipment note",
  "p2p.invoice": "Invoice",
  "p2p.grn": "GRN",

  // Finance
  "finance.bill": "Bill",
  "finance.payment": "Payment",
  "finance.cn_dn": "Credit note",

  // Master data the P2P documents point at
  "masterdata.cost_center": "Cost centre",
};

/**
 * The modules a selection covers, in the order the tree lists them.
 *
 * Matches the exact feature id first, then its group — ticking the whole
 * "Purchase orders" group and ticking one PO feature both mean "the PO
 * module".
 */
export function apiModulesFor(featureIds: readonly string[]): string[] {
  const modules: string[] = [];
  for (const id of featureIds) {
    const module = FEATURE_TO_MODULE[id] ?? FEATURE_TO_MODULE[id.split(".")[0]];
    if (module && !modules.includes(module)) modules.push(module);
  }
  return modules;
}

/**
 * The one module a report should open scoped to, or undefined.
 *
 * Undefined when a selection spans several modules — a report claiming to be
 * "the GRN report" while showing PO cases too would be worse than an unscoped
 * one, so in that case the reader gets everything and picks in the report.
 */
export function singleApiModule(featureIds: readonly string[]): string | undefined {
  const modules = apiModulesFor(featureIds);
  return modules.length === 1 ? modules[0] : undefined;
}
