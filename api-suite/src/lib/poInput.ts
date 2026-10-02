import * as fs from 'fs';
import * as path from 'path';
import { ClientFieldEntry, DatasourceConfig } from '../types';

const ROOT = path.resolve(__dirname, '..', '..');
export const PO_INPUT_PATH = path.join(ROOT, 'config', 'po-input.json');

/**
 * What a human wants this PO to contain. Everything is optional: a field left
 * out is generated from its strategy in master-po.json, exactly as an
 * unattended run would.
 */
export interface PoInput {
  client?: string;
  /** field name -> value, for the PO header */
  header?: Record<string, unknown>;
  /** one entry per line item; its length decides how many are created */
  lineItems?: Array<Record<string, unknown>>;
  /**
   * Per-client values, merged over the shared blocks above.
   *
   * Clients do not have the same fields, and some mandatory ones cannot be
   * generated or sampled — Decathlon's PO needs `vendor_gst` (a company
   * record) and `state_code`, and no existing PO on that account has a
   * vendor_gst to copy. Rather than making the shared blocks the union of
   * every client's quirks, each client adds only what is specific to it.
   */
  perClient?: Record<string, { header?: Record<string, unknown>; lineItems?: Array<Record<string, unknown>> }>;
}

/** Folds a client's own values over the shared ones. */
export function forClient(input: PoInput, clientId: string): PoInput {
  const specific = input.perClient?.[clientId];
  if (!specific) return input;
  return {
    ...input,
    header: { ...(input.header ?? {}), ...(specific.header ?? {}) },
    lineItems: specific.lineItems ?? input.lineItems,
  };
}

export function loadPoInput(file: string = PO_INPUT_PATH): PoInput {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PoInput;
  // Every `_`-prefixed key is documentation — the valid dropdown options, the
  // client list, notes. Stripped wholesale so the file can explain itself
  // without a comment block ever reaching a request payload.
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) delete (raw as Record<string, unknown>)[key];
  }
  if (raw.header) {
    for (const key of Object.keys(raw.header)) {
      if (key.startsWith('_')) delete (raw.header as Record<string, unknown>)[key];
    }
  }
  return raw;
}

/** How one supplied value was turned into what we send. */
export interface Coercion {
  field: string;
  given: unknown;
  sent: unknown;
  /** set when the value could not be mapped and is being passed through */
  warning?: string;
  /** set when the field does not exist, so nothing is sent for it at all */
  dropped?: boolean;
}

/**
 * Translates a human-written value into the platform's wire format.
 *
 * People write `"USD"` and `"2026-12-31"`; the platform stores a dropdown as
 * its option index and a date as epoch seconds. Anything that cannot be
 * mapped is passed through untouched and flagged, so the platform's own
 * rejection is what you see rather than a guess made here.
 */
export function coerceOverride(
  fieldName: string,
  entry: ClientFieldEntry | undefined,
  given: unknown
): Coercion {
  if (!entry) {
    // planDocument routes an unknown name to `unsupported` and never puts it in
    // a payload, so say that rather than implying it goes to the platform.
    return { field: fieldName, given, sent: given, dropped: true, warning: 'not a field on this datasource' };
  }

  if (entry.dataType === 'dropdown_select') {
    const options = entry.options ?? [];
    const byLabel = options.indexOf(String(given));
    if (byLabel >= 0) return { field: fieldName, given, sent: String(byLabel) };
    // Already an index into the option list.
    const asIndex = Number(given);
    if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < options.length) {
      return { field: fieldName, given, sent: String(asIndex) };
    }
    return {
      field: fieldName,
      given,
      sent: given,
      warning: `not one of ${options.length} options (${options.slice(0, 6).join(', ')}${options.length > 6 ? ', …' : ''})`,
    };
  }

  if (entry.dataType === 'date' && !entry.format) {
    if (typeof given === 'number') return { field: fieldName, given, sent: given };
    const parsed = Date.parse(String(given));
    if (!Number.isNaN(parsed)) {
      return { field: fieldName, given, sent: Math.floor(parsed / 1000) };
    }
    return { field: fieldName, given, sent: given, warning: 'could not be read as a date' };
  }

  return { field: fieldName, given, sent: given };
}

/** Applies `coerceOverride` across a whole set of supplied values. */
/**
 * The same field can be named differently per client — Decathlon's PO line item
 * calls quantity `qty`, procol_sandbox_demo calls it `quantity`. An override
 * written with either name should land on whichever the client actually has,
 * otherwise a shared po-input.json can only ever drive one client.
 *
 * Declared in config/master-po.json under `fieldAliases`: canonical name on the
 * left, the alternatives clients use on the right. Matching is two-way, so a
 * value written as `qty` also finds a client whose field is `quantity`.
 */
let aliasCache: Record<string, unknown> | undefined;

/** Read straight from the JSON rather than through masterPo, which imports
 * from here — going via it would make the two modules circular. */
function loadFieldAliases(): Record<string, unknown> {
  if (aliasCache) return aliasCache;
  const file = path.join(ROOT, 'config', 'master-po.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { fieldAliases?: Record<string, unknown> };
    aliasCache = parsed.fieldAliases ?? {};
  } catch {
    aliasCache = {};
  }
  return aliasCache;
}

export function resolveFieldName(datasource: DatasourceConfig, name: string): string {
  if (datasource.fields[name]?.present) return name;

  const aliases = loadFieldAliases();
  for (const [canonical, alts] of Object.entries(aliases)) {
    if (!Array.isArray(alts)) continue;  // skips the _readme entry
    const group = [canonical, ...(alts as string[])];
    if (!group.includes(name)) continue;
    const present = group.find((candidate) => datasource.fields[candidate]?.present);
    if (present) return present;
  }
  // Not found under any name — returned unchanged so the caller reports it as
  // "a field this client does not have" rather than silently dropping it.
  return name;
}

export function coerceOverrides(
  datasource: DatasourceConfig,
  supplied: Record<string, unknown> = {}
): { overrides: Record<string, unknown>; coercions: Coercion[] } {
  const overrides: Record<string, unknown> = {};
  const coercions: Coercion[] = [];
  for (const [suppliedName, value] of Object.entries(supplied)) {
    const name = resolveFieldName(datasource, suppliedName);
    const coercion = coerceOverride(name, datasource.fields[name], value);
    overrides[name] = coercion.sent;
    coercions.push(coercion);
  }
  return { overrides, coercions };
}
