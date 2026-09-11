import * as fs from 'fs';
import * as path from 'path';
import { ClientFieldEntry, FieldDataType } from '../types';
import { FieldRole, classifyField } from './policy';

export type ValueStrategy =
  | { kind: 'skip' }
  | { kind: 'literal'; value: unknown }
  | { kind: 'text'; maxLength?: number }
  | { kind: 'template'; template: string }
  | { kind: 'number'; min?: number; max?: number; decimals?: number }
  | { kind: 'date'; offsetDays?: number }
  | { kind: 'option'; prefer?: string[] }
  | { kind: 'lookup' };

export type Assertion =
  | { op: 'product'; operands: string[] }
  | { op: 'sumOfLineItems'; field: string }
  | { op: 'presentAndPositive' }
  | { op: 'autofilled' };

export interface MasterFieldSpec {
  note?: string;
  strategy?: ValueStrategy;
  assert?: Assertion;
  unique?: boolean;
}

export interface DocumentSpec {
  headerKeyAttributes: string[];
  lineItemKeyAttributes: string[];
  /** how many line items to create when `lineItems` does not say */
  lineItemsPerDocument: number;
  /**
   * Explicit values per line, e.g. `[{ quantity: 5, unit_price: 100 }, …]`.
   * One entry per line item; its length decides how many are created, so it
   * overrides `lineItemsPerDocument`. Each entry's keys are field names, and
   * they are passed through as plan overrides — so anything on the line-item
   * datasource can be pinned, not just quantity and price. Omit it to keep
   * generating values from each field's strategy.
   */
  lineItems?: Array<Record<string, unknown>>;
}

export interface MasterPo {
  documents: Record<string, DocumentSpec>;
  typePolicy: Record<string, { role: FieldRole; strategy: ValueStrategy }>;
  fields: Record<string, MasterFieldSpec>;
  skipFields: { names: string[] };
}

const MASTER_PO_PATH = path.resolve(__dirname, '..', '..', 'config', 'master-po.json');

let cached: MasterPo | undefined;

export function loadMasterPo(): MasterPo {
  if (!cached) cached = JSON.parse(fs.readFileSync(MASTER_PO_PATH, 'utf-8')) as MasterPo;
  return cached;
}

/** The document spec a datasource belongs to, and whether it is the header or
 * the line item. Decathlon runs four PO variants, each with its own line-item
 * datasource, so this is a lookup rather than a hardcoded pair. */
export function documentRoleOf(
  master: MasterPo,
  keyAttribute: string
): { document: string; side: 'header' | 'lineItem' } | undefined {
  for (const [document, spec] of Object.entries(master.documents)) {
    if (spec.headerKeyAttributes.includes(keyAttribute)) return { document, side: 'header' };
    if (spec.lineItemKeyAttributes.includes(keyAttribute)) return { document, side: 'lineItem' };
  }
  return undefined;
}

/** Pairs a header datasource with its line-item datasource by position within
 * the document spec, so p2p_gift_purchase_order maps to p2p_gift_po_line_item. */
/**
 * The per-line overrides to apply, one entry per line item to create.
 * Falls back to `lineItemsPerDocument` empty entries when no explicit list is
 * configured, so callers can always just iterate the result.
 */
export function lineItemOverridesFor(document: DocumentSpec): Array<Record<string, unknown>> {
  if (document.lineItems && document.lineItems.length > 0) return document.lineItems;
  return Array.from({ length: document.lineItemsPerDocument }, () => ({}));
}

export function lineItemKeyFor(master: MasterPo, headerKeyAttribute: string): string | undefined {
  for (const spec of Object.values(master.documents)) {
    const index = spec.headerKeyAttributes.indexOf(headerKeyAttribute);
    if (index >= 0) return spec.lineItemKeyAttributes[index];
  }
  return undefined;
}

export interface ResolvedSpec {
  role: FieldRole;
  strategy: ValueStrategy;
  assert?: Assertion;
  unique: boolean;
  /** true when no master entry existed and the type policy supplied everything */
  fromTypePolicy: boolean;
}

/**
 * Every field the platform fills in for us is worth checking, even one no
 * master entry names. A derived field must have been autofilled; a computed
 * one must have produced a number. Naming it in master-po.json upgrades the
 * check to a real arithmetic assertion (e.g. sumOfLineItems).
 */
function defaultAssertion(role: FieldRole): Assertion | undefined {
  if (role === 'derived') return { op: 'autofilled' };
  if (role === 'computed') return { op: 'presentAndPositive' };
  return undefined;
}

/**
 * Resolves how to treat one field for one client, in precedence order:
 *   1. the field's actual role, derived from its schema (never overridable —
 *      a formula stays a formula no matter what master-po.json says)
 *   2. an explicit per-field entry in master-po.json
 *   3. the type policy for its data_type
 *
 * A field with no master entry is still fully handled, which is what keeps
 * onboarding a 41-field client from needing 41 decisions.
 */
export function resolveSpec(
  master: MasterPo,
  fieldName: string,
  entry: ClientFieldEntry
): ResolvedSpec {
  const role = classifyField(entry);
  const override = master.fields[fieldName];
  const typePolicy = entry.dataType ? master.typePolicy[entry.dataType as FieldDataType] : undefined;

  const skipped = master.skipFields.names.includes(fieldName);
  const nonWritable = role === 'system' || role === 'derived' || role === 'computed' || role === 'children';

  let strategy: ValueStrategy;
  if (skipped || nonWritable) strategy = { kind: 'skip' };
  else strategy = override?.strategy ?? typePolicy?.strategy ?? { kind: 'text' };

  return {
    role,
    strategy,
    assert: override?.assert ?? defaultAssertion(role),
    unique: override?.unique === true,
    fromTypePolicy: !override,
  };
}
