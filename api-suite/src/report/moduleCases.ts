import { ClientConfig } from '../types';
import { loadAllClientConfigs } from '../lib/configStore';
import { moduleLabel } from '../lib/moduleNames';
import { ModuleScope, moduleScope, scopedDatasources } from '../lib/scope';
import { TestCase, generateCasesFor, loadCaseFile } from '../lib/testCases';

/**
 * The test-case catalogue for a module, read from the module's own schema.
 *
 * "From the backend" is literal: config/clients/<id>.json is written by
 * `npm run discover` straight off `GET /api/flexi_datasources/{uuid}`, so the
 * validation rules these cases come from are the tenant's live rules, not a
 * list somebody maintained by hand. Tier 2 asserts the committed copy still
 * matches the live schema, which is what makes it safe to render a report off
 * the file rather than re-fetching at report time.
 *
 * The report uses this to state coverage the run itself cannot: a case the
 * module's schema implies but that no test exercised is a gap, and a run that
 * skipped it must not read as a pass.
 */

export interface ModuleCatalogue {
  clientId: string;
  /** key_attribute, e.g. "p2p_purchase_order" */
  datasourceKey: string;
  /** what the platform calls it — the report's Module column */
  displayName: string;
  datasourceUuid: string;
  /** every case the module's schema implies, plus the hand-written ones */
  cases: TestCase[];
  /** validation rules the schema declares on this module */
  ruleCount: number;
}

function ruleCount(client: ClientConfig, datasourceKey: string): number {
  const ds = client.datasources[datasourceKey];
  if (!ds) return 0;
  return Object.values(ds.fields).reduce((total, f) => total + (f.validations?.length ?? 0), 0);
}

/** The catalogue for one module of one client. */
export function catalogueFor(client: ClientConfig, datasourceKey: string): ModuleCatalogue | undefined {
  const ds = client.datasources[datasourceKey];
  if (!ds) return undefined;
  const generated = generateCasesFor(datasourceKey, ds);
  const fromFile = loadCaseFile().filter((c) => c.datasource === datasourceKey);
  return {
    clientId: client.id,
    datasourceKey,
    displayName: moduleLabel(datasourceKey, ds.displayName),
    datasourceUuid: ds.uuid,
    cases: [...generated, ...fromFile],
    ruleCount: ruleCount(client, datasourceKey),
  };
}

/**
 * Every module of every configured client, keyed "<clientId>/<datasourceKey>".
 * Narrowed to the run's module scope — a scoped run must not be handed the
 * catalogue of a module it never touched.
 */
export function loadCatalogues(
  clients: ClientConfig[] = safeClients(),
  scope: ModuleScope = moduleScope()
): Map<string, ModuleCatalogue> {
  const out = new Map<string, ModuleCatalogue>();
  for (const client of clients) {
    for (const [key] of scopedDatasources(client, scope)) {
      const catalogue = catalogueFor(client, key);
      if (catalogue) out.set(`${client.id}/${key}`, catalogue);
    }
  }
  return out;
}

/** datasource uuid -> module, so a call's payload can name its own module. */
export function moduleByUuid(clients: ClientConfig[] = safeClients()): Map<string, { key: string; label: string }> {
  const out = new Map<string, { key: string; label: string }>();
  for (const client of clients) {
    for (const [key, ds] of Object.entries(client.datasources)) {
      if (ds.uuid) out.set(ds.uuid, { key, label: moduleLabel(key, ds.displayName) });
    }
  }
  return out;
}

/** Client ids this repo is configured for — the report matches spec titles
 * against these so a case that made no calls is still filed correctly. */
export function knownClientIds(clients: ClientConfig[] = safeClients()): string[] {
  return clients.map((c) => c.id).sort((a, b) => b.length - a.length);
}

/** Known key_attributes, longest first — so "p2p_po_line_item" wins over a
 * substring match on a title that also contains "p2p_purchase_order". */
export function knownDatasourceKeys(clients: ClientConfig[] = safeClients()): string[] {
  const keys = new Set<string>();
  for (const client of clients) for (const key of Object.keys(client.datasources)) keys.add(key);
  return [...keys].sort((a, b) => b.length - a.length);
}

/**
 * The join key between a catalogue case and an executed test.
 *
 * The spec titles a case "[negative] <name>", and the report strips the tag —
 * so the name, flattened, is what the two have in common. Punctuation is
 * dropped because a curly apostrophe in a title and a straight one in YAML
 * are the same case to a reader.
 */
export function caseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\[(positive|negative|edge)\]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Client configs, or none — a report must never fail for want of a config. */
function safeClients(): ClientConfig[] {
  try {
    return loadAllClientConfigs();
  } catch {
    return [];
  }
}
