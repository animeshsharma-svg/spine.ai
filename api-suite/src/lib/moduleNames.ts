/**
 * What to call a module, and how to recognise one someone typed.
 *
 * The platform's own `key_attribute` ("p2p_purchase_order") is precise and
 * unreadable; the sheet and every conversation say "PO". Both name the same
 * thing, so both must resolve to it — a scope of `MODULE=PO` and a scope of
 * `MODULE=p2p_purchase_order` select the same module.
 *
 * In `lib` rather than `report` because the scope filter uses it to decide
 * what RUNS, and the report uses it to decide what it SHOWS. One table, so the
 * two can never disagree about which module is which.
 */

/** Short names, as the team says them. */
const SHORT_NAME: Record<string, string> = {
  p2p_purchase_order: 'PO',
  p2p_po_line_item: 'PO line item',
  p2p_rent_purchase_order: 'Rent PO',
  p2p_gift_purchase_order: 'Gift PO',
  p2p_candex_purchase_order: 'Candex PO',
  p2p_grn: 'GRN',
  p2p_invoice: 'Invoice',
  p2p_bill: 'Bill',
  p2p_payment: 'Payment',
  p2p_credit_note: 'Credit note',
  p2p_accrual: 'Accrual',
  p2p_cost_center: 'Cost centre',
  p2p_nature_of_expense: 'Nature of expense',
  p2p_proforma_invoice: 'Proforma invoice',
  p2p_advance_shipment_note: 'Advance shipment note',
  p2p_contract: 'Contract',
};

export function moduleLabel(datasourceKey: string, displayName?: string): string {
  return SHORT_NAME[datasourceKey] ?? displayName ?? datasourceKey;
}

/** Lowercase, alphanumerics only — so "Cost centre", "cost_center" and
 * "COST-CENTER" all compare equal. */
export function normaliseModuleName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Every name one module answers to: its key_attribute, its short name, its
 * platform display name, and the key without the "p2p_" prefix — because
 * `MODULE=purchase_order` is what someone types half the time.
 */
export function moduleAliases(datasourceKey: string, displayName?: string): string[] {
  return [
    datasourceKey,
    datasourceKey.replace(/^p2p_/, ''),
    SHORT_NAME[datasourceKey],
    displayName,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normaliseModuleName);
}

/** Does `name` (as typed) refer to this module? */
export function moduleMatches(name: string, datasourceKey: string, displayName?: string): boolean {
  return moduleAliases(datasourceKey, displayName).includes(normaliseModuleName(name));
}
