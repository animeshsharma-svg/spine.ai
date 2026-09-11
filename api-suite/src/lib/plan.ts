import { ClientConfig, ClientFieldEntry, DatasourceConfig } from '../types';
import { MasterPo, ValueStrategy, resolveSpec, Assertion } from './masterPo';
import { classifyField } from './policy';

/** A field we intend to send, with the value resolved (or pending lookup). */
export interface PlannedField {
  name: string;
  uuid: string;
  value: unknown;
  /** relations carry the target so the resolver knows where to look */
  lookup?: { datasourceId?: number; table?: string };
}

/** A field we will NOT send but WILL check after the record exists. */
export interface PlannedAssertion {
  name: string;
  assertion: Assertion;
  /** derived fields only: which relation should have populated this */
  via?: string;
}

export interface DocumentPlan {
  datasourceKey: string;
  datasourceUuid: string;
  fields: PlannedField[];
  pendingLookups: PlannedField[];
  assertions: PlannedAssertion[];
  /** mandatory fields we could not produce a value for — a create will fail */
  missingMandatory: string[];
  /** requested names this client does not have */
  unsupported: string[];
  skipped: string[];
}

export interface PlanContext {
  runId: string;
  index?: number;
}

/** A short, unique-per-run token used by `{{runId}}` templates. Uniqueness
 * matters: po_number is rejected as a duplicate on a second run otherwise. */
export function newRunId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`.toUpperCase();
}

function formatDate(offsetDays: number, format?: string): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  if (format === 'DD-MM-YYYY') return `${dd}-${mm}-${yyyy}`;
  if (format === 'MM-DD-YYYY') return `${mm}-${dd}-${yyyy}`;
  if (format === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

/** Epoch seconds for a day offset — this platform's wire format for dates. */
function epochSeconds(offsetDays: number): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return Math.floor(d.getTime() / 1000);
}

function applyTemplate(template: string, ctx: PlanContext): string {
  return template
    .replace(/\{\{runId\}\}/g, ctx.runId)
    .replace(/\{\{index\}\}/g, String(ctx.index ?? 0))
    .replace(/\{\{today\}\}/g, formatDate(0));
}

/** Produces a value for one field, or `undefined` when the strategy is skip or
 * cannot be satisfied (e.g. a dropdown whose client exposes no options). */
export function generateValue(
  strategy: ValueStrategy,
  entry: ClientFieldEntry,
  ctx: PlanContext
): unknown {
  switch (strategy.kind) {
    case 'skip':
    case 'lookup':
      return undefined;
    case 'literal':
      return strategy.value;
    case 'text': {
      // "AUTO" marks every generated value as test data in the client's own
      // account, matching the AUTO-* templates in master-po.json.
      const base = `AUTO ${entry.label ?? 'value'} ${ctx.runId}`;
      return strategy.maxLength ? base.slice(0, strategy.maxLength) : base;
    }
    case 'template':
      return applyTemplate(strategy.template, ctx);
    case 'number': {
      const min = strategy.min ?? 1;
      const max = strategy.max ?? 100;
      const decimals = strategy.decimals ?? 0;
      const raw = min + Math.random() * (max - min);
      return Number(raw.toFixed(decimals));
    }
    case 'date': {
      const offsetDays = strategy.offsetDays ?? 0;
      // A field whose schema names no format is sent as epoch seconds: that is
      // what this platform stores (existing records carry
      // `po_date: "1788928160"`), and an ISO string comes back rejected as
      // "cannot be in the past" because it never parses. Clients that do
      // declare a format still get that format.
      return entry.format ? formatDate(offsetDays, entry.format) : epochSeconds(offsetDays);
    }
    case 'option': {
      const options = entry.options ?? [];
      if (options.length === 0) return undefined;
      let chosen = options[0];
      for (const preferred of strategy.prefer ?? []) {
        if (options.includes(preferred)) {
          chosen = preferred;
          break;
        }
      }
      // The platform stores a dropdown as the option's *index*, as a string:
      // existing records carry currency "0" for INR and status "0" for Draft.
      // Sending the label is accepted by the API but leaves the cell blank in
      // the UI, because nothing maps "INR" back to an option.
      return String(options.indexOf(chosen));
    }
  }
}

/**
 * Builds the plan for one record: what to send, what to look up first, and
 * what to verify afterwards. Explicit `overrides` (a test saying "quantity
 * must be 5") always win over generated values.
 *
 * Nothing here performs I/O — the plan is fully inspectable before a single
 * request is made, which is what the offline tests exercise.
 */
export function planDocument(
  _client: ClientConfig,
  datasource: DatasourceConfig,
  master: MasterPo,
  ctx: PlanContext,
  overrides: Record<string, unknown> = {}
): DocumentPlan {
  const plan: DocumentPlan = {
    datasourceKey: datasource.keyAttribute,
    datasourceUuid: datasource.uuid,
    fields: [], pendingLookups: [], assertions: [],
    missingMandatory: [], unsupported: [], skipped: [],
  };

  for (const name of Object.keys(overrides)) {
    const entry = datasource.fields[name];
    if (!entry?.present || !entry.uuid) plan.unsupported.push(name);
  }

  for (const [name, entry] of Object.entries(datasource.fields)) {
    if (!entry.present) continue;
    const role = classifyField(entry);
    const spec = resolveSpec(master, name, entry);

    if (spec.assert) {
      plan.assertions.push({
        name,
        assertion: spec.assert,
        via: datasource.autofill?.[name]?.via,
      });
    }

    if (role === 'system' || role === 'derived' || role === 'computed' || role === 'children') {
      plan.skipped.push(name);
      continue;
    }

    const override = Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : undefined;
    const planned: PlannedField = { name, uuid: entry.uuid as string, value: override };

    if (role === 'relation') {
      if (override !== undefined) {
        plan.fields.push(planned);
      } else {
        planned.lookup = { datasourceId: entry.relatedDatasourceId, table: entry.relatedDatasourceTable };
        plan.pendingLookups.push(planned);
      }
      continue;
    }

    const value = override !== undefined ? override : generateValue(spec.strategy, entry, ctx);
    if (value === undefined) {
      plan.skipped.push(name);
      if (entry.mandatory === true) plan.missingMandatory.push(name);
      continue;
    }
    planned.value = value;
    plan.fields.push(planned);
  }

  plan.missingMandatory.sort();
  plan.skipped.sort();
  return plan;
}
