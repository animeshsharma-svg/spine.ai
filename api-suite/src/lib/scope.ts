import { ClientConfig } from '../types';
import { moduleLabel, moduleMatches } from './moduleNames';

/**
 * Narrows a run to one module.
 *
 *     MODULE=PO npm run test:write          # the PO document, and nothing else
 *     MODULE=p2p_grn npm run test:live      # GRN's schema contract only
 *     MODULE=PO,GRN npm test                # two modules
 *
 * Without it every tier loops over every datasource in the client config,
 * which is right for a full regression and wrong for the usual case: someone
 * is working on one module and wants a report about that module, not twenty
 * sections they have to scroll past.
 *
 * The scope filters what RUNS. The report reads the same scope and renders
 * only those modules, so a scoped run cannot produce an unscoped report — the
 * report would otherwise claim coverage of modules the run never touched.
 *
 * A line-item datasource travels with its header: scoping to PO includes
 * p2p_po_line_item, because a PO without its lines is not the PO module.
 */

export interface ModuleScope {
  /** exactly what was asked for, for reporting back */
  requested: string[];
  /** true when nothing was asked for — every module runs */
  isAll: boolean;
}

function parse(argv: string[], env: NodeJS.ProcessEnv): string[] {
  const raw: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--module' || argv[i] === '-m') raw.push(argv[++i] ?? '');
    else if (argv[i]?.startsWith('--module=')) raw.push(argv[i].slice('--module='.length));
  }
  if (raw.length === 0 && env.MODULE) raw.push(env.MODULE);
  return raw
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The scope for this process. Read fresh so a test can set MODULE and re-ask. */
export function moduleScope(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): ModuleScope {
  const requested = parse(argv, env);
  return { requested, isAll: requested.length === 0 };
}

/**
 * Is this datasource in scope?
 *
 * `parentKey` is the header a line item belongs to — passed so a line item is
 * in scope whenever its header is, without this function needing the config.
 */
export function inScope(
  datasourceKey: string,
  opts: { displayName?: string; parentKey?: string; scope?: ModuleScope } = {}
): boolean {
  const scope = opts.scope ?? moduleScope();
  if (scope.isAll) return true;
  return scope.requested.some(
    (name) =>
      moduleMatches(name, datasourceKey, opts.displayName) ||
      (opts.parentKey !== undefined && moduleMatches(name, opts.parentKey))
  );
}

/** Filters a client's datasources to the scope, headers keeping their lines. */
export function scopedDatasources(
  client: ClientConfig,
  scope: ModuleScope = moduleScope()
): Array<[string, ClientConfig['datasources'][string]]> {
  const parentOf = new Map<string, string>();
  for (const [key, ds] of Object.entries(client.datasources)) {
    if (ds.lineItemKeyAttribute) parentOf.set(ds.lineItemKeyAttribute, key);
  }
  return Object.entries(client.datasources).filter(([key, ds]) =>
    inScope(key, { displayName: ds.displayName, parentKey: parentOf.get(key), scope })
  );
}

/**
 * Scope entries that match no configured module — a typo.
 *
 * Worth surfacing loudly: `MODULE=P0` (digit zero) selects nothing, every test
 * skips, and a run that checked nothing at all otherwise reports as a clean
 * pass. Tier 1 asserts this is empty.
 */
export function unmatchedScope(clients: ClientConfig[], scope: ModuleScope = moduleScope()): string[] {
  if (scope.isAll) return [];
  const known = clients.flatMap((c) =>
    Object.entries(c.datasources).map(([key, ds]) => ({ key, displayName: ds.displayName }))
  );
  return scope.requested.filter(
    (name) => !known.some((m) => moduleMatches(name, m.key, m.displayName))
  );
}

/** How the scope reads in a report header: "PO (p2p_purchase_order)". */
export function describeScope(
  clients: ClientConfig[],
  scope: ModuleScope = moduleScope()
): string | undefined {
  if (scope.isAll) return undefined;
  const keys = new Set<string>();
  for (const client of clients) {
    for (const [key] of scopedDatasources(client, scope)) keys.add(key);
  }
  const named = [...keys].map((key) => `${moduleLabel(key)} (${key})`);
  return named.length ? named.join(', ') : scope.requested.join(', ');
}
