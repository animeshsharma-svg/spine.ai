import { ClientFieldEntry, FieldDataType } from '../types';

/**
 * What we do with a field when building a document.
 *
 *   system     no uuid or read-only — never appears in a payload
 *   writable   we generate a value and send it
 *   relation   we look up a real record and send its reference
 *   derived    the platform autofills it from a relation — assert, never send
 *   computed   formula/rollup — the platform calculates it, assert, never send
 *   children   inverse_relation — child records, created in their own step
 */
export type FieldRole = 'system' | 'writable' | 'relation' | 'derived' | 'computed' | 'children';

const ROLE_BY_TYPE: Record<FieldDataType, FieldRole> = {
  string: 'writable',
  text: 'writable',
  number: 'writable',
  date: 'writable',
  dropdown_select: 'writable',
  attachment: 'writable',
  boolean: 'writable',
  relational: 'relation',
  external_relation: 'relation',
  reference: 'derived',
  formula: 'computed',
  rollup: 'computed',
  inverse_relation: 'children',
};

/**
 * Classifies a field from its schema alone, so onboarding a client with 40
 * unfamiliar fields needs no per-field configuration — only genuine
 * exceptions go in master-po.json.
 *
 * Two cases override the type:
 *  - no uuid, or explicitly read-only -> system. The platform's synthetic
 *    columns (sequence, title, created_by_user_name) carry no uuid at all and
 *    can never be addressed in a payload.
 *  - an external_relation carrying `external_reference_name` is a *derived*
 *    lookup (e.g. vendor_gstin reads companies.gst_no once vendor_name is
 *    chosen), not a relation we set ourselves.
 */
export function classifyField(entry: ClientFieldEntry): FieldRole {
  if (!entry.uuid) return 'system';
  return intendedRole(entry);
}

/**
 * The role a field's schema implies, ignoring whether a uuid was discovered.
 *
 * `classifyField` folds "no uuid" into `system`, which is right at runtime but
 * useless for integrity checks: a test that skips `system` fields can never
 * notice that a sendable field lost its uuid. Discovery losing every uuid at
 * once reads as "the whole datasource is synthetic" and passes. Integrity
 * tests classify by schema alone and assert the uuid separately.
 */
export function intendedRole(entry: ClientFieldEntry): FieldRole {
  if (entry.synthetic || entry.readOnly) return 'system';
  if (entry.dataType === 'external_relation' && isDerivedExternalRelation(entry)) return 'derived';
  const type = entry.dataType;
  if (!type || !(type in ROLE_BY_TYPE)) return 'writable';
  return ROLE_BY_TYPE[type];
}

/**
 * An external_relation that names a specific column on the related table is
 * populated by the platform from whichever record the driving relation
 * selected — we must not send it.
 *
 * Unless it is MANDATORY, in which case it is the driver, not the passenger.
 * On Decathlon's PO, `vendor_gst` (companies.gst_no) and `state_code` are both
 * mandatory external_relations, and setting `vendor_gst` is what fills
 * vendor_name, vendor_address and vendor_email_id — which are the same type but
 * optional. Treating all of them as derived left the two mandatory ones empty,
 * so the record never became eligible for approval and submit returned a
 * bare 422.
 *
 * The platform would not require a field the caller cannot set, so
 * `mandatory === true` is the signal that separates driver from derived.
 */
export function isDerivedExternalRelation(entry: ClientFieldEntry): boolean {
  if (entry.mandatory === true) return false;
  return !!entry.relatedDatasourceTable && !!entry.externalReferenceName;
}

export function isWritable(entry: ClientFieldEntry): boolean {
  const role = classifyField(entry);
  return role === 'writable' || role === 'relation';
}

/** Fields the platform fills in for us — the ones worth asserting after create. */
export function isAsserted(entry: ClientFieldEntry): boolean {
  const role = classifyField(entry);
  return role === 'derived' || role === 'computed';
}

export function groupByRole(
  fields: Record<string, ClientFieldEntry>
): Record<FieldRole, string[]> {
  const out: Record<FieldRole, string[]> = {
    system: [], writable: [], relation: [], derived: [], computed: [], children: [],
  };
  for (const [name, entry] of Object.entries(fields)) {
    if (!entry.present) continue;
    out[classifyField(entry)].push(name);
  }
  for (const key of Object.keys(out) as FieldRole[]) out[key].sort();
  return out;
}
