import * as fs from 'fs';
import * as path from 'path';
import { ClientConfig } from '../types';
import { apiRequest } from '../lib/httpClient';
import { searchRecordsUrl } from '../lib/endpoints';
import { PlannedField } from '../lib/plan';

export interface ResolvedRelation {
  field: string;
  recordUuid: string;
  /** the record we picked, kept so autofill assertions can check against it */
  record?: Record<string, unknown>;
}

export interface RelationFailure {
  field: string;
  reason: string;
}

/** A row is either a positional array aligned to `headers`, or — in older
 * captures — an object already keyed by field name. */
type RawRecordRow = unknown[] | { uuid?: string; record_uuid?: string; [key: string]: unknown };

interface RecordsResponse {
  /** plain strings for the platform's own columns, objects for real fields */
  headers?: Array<string | { name?: string; field_id?: string; key_attribute?: string }>;
  records?: RawRecordRow[];
  data?: RawRecordRow[];
}

/**
 * Turns one row of a records response into a uuid plus a name-keyed record.
 *
 * The endpoint answers with positional arrays aligned to `headers`
 * (`["cERYWk5r", 1, "India", …]`), so reading `row.uuid` off it yields
 * undefined — which previously read as "this datasource is empty" and failed
 * every relation. The record uuid lives under the `fx_response_id` header.
 */
export function normaliseRecordRow(
  row: RawRecordRow | undefined,
  headers: RecordsResponse['headers'] = []
): { uuid?: string; record: Record<string, unknown> } | undefined {
  if (!row) return undefined;
  if (!Array.isArray(row)) {
    return { uuid: row.uuid ?? row.record_uuid, record: row };
  }
  const record: Record<string, unknown> = {};
  let uuid: string | undefined;
  headers.forEach((header, i) => {
    const name = typeof header === 'string' ? header : header?.key_attribute;
    if (!name) return;
    record[name] = row[i];
    if (name === 'fx_response_id' && typeof row[i] === 'string') uuid = row[i] as string;
  });
  return { uuid, record };
}

/**
 * Relations can't be hardcoded — `linked_cost_center` needs a real cost-centre
 * UUID from *this* client's data. The schema tells us which datasource to look
 * in; we fetch page 1 and take the first record.
 *
 * Results are cached per run: a PO with ten line items would otherwise re-query
 * the same UOM datasource ten times.
 */
export class RelationResolver {
  private readonly cache = new Map<string, string>();
  private readonly records = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly client: ClientConfig,
    /** datasource id (numeric, from the schema) -> that datasource's uuid */
    private readonly datasourceUuidById: Map<number, string>
  ) {}

  /** Builds the numeric-id -> uuid map from an already-discovered client. The
   * schema gives relation targets as numeric ids while addressing needs uuids,
   * so the map is only as complete as the client's discovered datasources. */
  static datasourceIndex(client: ClientConfig, idByKey: Map<string, number>): Map<number, string> {
    const index = new Map<number, string>();
    for (const [key, datasource] of Object.entries(client.datasources)) {
      const id = idByKey.get(key);
      if (id !== undefined) index.set(id, datasource.uuid);
    }
    return index;
  }

  async resolve(
    pending: PlannedField[],
    /** the datasource the record being planned belongs to. External relations
     * are resolved by sampling it, so without it they cannot be resolved. */
    ownerDatasourceUuid?: string
  ): Promise<{ resolved: ResolvedRelation[]; failed: RelationFailure[] }> {
    const resolved: ResolvedRelation[] = [];
    const failed: RelationFailure[] = [];

    for (const field of pending) {
      const target = field.lookup;
      if (!target) {
        failed.push({ field: field.name, reason: 'no lookup target on the field' });
        continue;
      }

      // External relations point at a platform table (e.g. "companies"), not an
      // fx datasource, so the numeric-id path below cannot address them and the
      // platform exposes no endpoint we know of for listing that table.
      // Instead, sample a reference the account is already using: read existing
      // records of the owning datasource and reuse the first value this field
      // holds. Any valid company is as good as any other for a create, and it
      // needs no endpoint we would otherwise have to guess at.
      if (!target.datasourceId) {
        if (!target.table) {
          failed.push({ field: field.name, reason: 'relation names no target' });
          continue;
        }
        if (!ownerDatasourceUuid) {
          failed.push({
            field: field.name,
            reason: `points at platform table "${target.table}" and no owning datasource was given to sample`,
          });
          continue;
        }
        const sampled = await this.sampleExistingReference(ownerDatasourceUuid, field.name);
        if (!sampled) {
          failed.push({
            field: field.name,
            reason: `points at platform table "${target.table}" — no existing record references one, so there is nothing to sample`,
          });
          continue;
        }
        resolved.push({ field: field.name, recordUuid: sampled.recordUuid, record: sampled.record });
        continue;
      }

      // The numeric id first; then the target declared in master-po.json.
      // Nothing in the API maps a numeric datasource id to a uuid — only
      // `npm run audit` does, via the database — so without the declared
      // fallback a mandatory relation is unresolvable on any client that has
      // not been audited.
      const datasourceUuid =
        this.datasourceUuidById.get(target.datasourceId) ??
        declaredRelationTarget(this.client, field.name);
      if (!datasourceUuid) {
        failed.push({
          field: field.name,
          reason:
            `datasource id ${target.datasourceId} is not in this client's discovered set — ` +
            `run \`npm run audit\`, or add "${field.name}" to relationTargets in master-po.json`,
        });
        continue;
      }

      const cached = this.cache.get(datasourceUuid);
      if (cached) {
        resolved.push({ field: field.name, recordUuid: cached, record: this.records.get(datasourceUuid) });
        continue;
      }

      const res = await apiRequest<RecordsResponse>(
        this.client, searchRecordsUrl(this.client, datasourceUuid, { page: 1, perPage: 1 })
      );
      if (!res.ok) {
        /**
         * Say WHAT the app said, not just that it said no.
         *
         * "record search returned HTTP 422" is the same sentence whether the
         * datasource is missing, the token is dead, or this login simply may
         * not read it — three problems with three different fixes, reported
         * identically. The app names which one it is in the body; repeating
         * that costs a line and saves the reader a trip to the call log.
         */
        const said = appMessage(res.body);
        failed.push({
          field: field.name,
          reason: `record search returned HTTP ${res.status}` + (said ? ` — ${said}` : ''),
        });
        continue;
      }
      const rows = res.body?.records ?? res.body?.data ?? [];
      const first = normaliseRecordRow(rows[0], res.body?.headers);
      if (!first) {
        failed.push({
          field: field.name,
          reason: 'target datasource has no records — this client account needs seed master data',
        });
        continue;
      }
      const uuid = first.uuid;
      if (!uuid) {
        failed.push({
          field: field.name,
          reason: 'a record was returned but carried no fx_response_id to reference it by',
        });
        continue;
      }
      this.cache.set(datasourceUuid, uuid);
      this.records.set(datasourceUuid, first.record);
      resolved.push({ field: field.name, recordUuid: uuid, record: first.record });
    }

    return { resolved, failed };
  }

  /**
   * Finds a reference this account already uses for `fieldName`, by reading
   * existing records of the datasource the field lives on.
   *
   * Used only for external relations (platform tables such as `companies`),
   * where there is no datasource to query directly. It reuses real data rather
   * than inventing it, but note the consequence: it verifies that a create
   * *accepts* a vendor reference, not that vendor lookup itself works. A
   * datasource with no populated value for the field yields nothing.
   */
  private async sampleExistingReference(
    ownerDatasourceUuid: string,
    fieldName: string
  ): Promise<{ recordUuid: string; record: Record<string, unknown> } | undefined> {
    const cacheKey = `${ownerDatasourceUuid}#${fieldName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return { recordUuid: cached, record: this.records.get(cacheKey) ?? {} };

    const res = await apiRequest<RecordsResponse>(
      this.client,
      searchRecordsUrl(this.client, ownerDatasourceUuid, { page: 1, perPage: 50 })
    );
    if (!res.ok || !res.body) return undefined;

    const rows = res.body.records ?? res.body.data ?? [];
    for (const row of rows) {
      const normalised = normaliseRecordRow(row, res.body.headers);
      const value = normalised?.record[fieldName];
      const recordUuid = referenceUuidOf(value);
      if (!recordUuid) continue;
      this.cache.set(cacheKey, recordUuid);
      this.records.set(cacheKey, (value ?? {}) as Record<string, unknown>);
      return { recordUuid, record: (value ?? {}) as Record<string, unknown> };
    }
    return undefined;
  }
}

/** A populated relation cell looks like `{ record_uuid, title }`; an empty one
 * carries nulls. Returns the uuid only when the cell actually references a
 * record. */
function referenceUuidOf(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const cell = value as { record_uuid?: unknown; fx_response_uuid?: unknown };
  const uuid = cell.record_uuid ?? cell.fx_response_uuid;
  return typeof uuid === 'string' && uuid.length > 0 ? uuid : undefined;
}

/** Relation targets are named by numeric datasource id, which discovery reads
 * from the schema endpoint's `datasource.id` (the audit can also supply it). */
let relationTargetCache: Record<string, string> | undefined;

/**
 * The datasource uuid a relation field points at, from master-po.json's
 * `relationTargets`. Read straight from the JSON to avoid importing masterPo,
 * which would pull the planning layer into the runtime one.
 */
function declaredRelationTarget(client: ClientConfig, fieldName: string): string | undefined {
  if (!relationTargetCache) {
    const file = path.join(__dirname, '..', '..', 'config', 'master-po.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        relationTargets?: Record<string, string>;
      };
      relationTargetCache = parsed.relationTargets ?? {};
    } catch {
      relationTargetCache = {};
    }
  }
  const key = relationTargetCache[fieldName];
  if (!key || key.startsWith('_')) return undefined;
  return client.datasources[key]?.uuid;
}

export function datasourceIdIndex(client: ClientConfig): Map<string, number> {
  const index = new Map<string, number>();
  for (const [key, datasource] of Object.entries(client.datasources)) {
    if (typeof datasource.numericId === 'number') index.set(key, datasource.numericId);
  }
  return index;
}

/** The message the app put in an error body, when it put one there. */
function appMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, any>;
  const inner = b.error ?? b;
  const text = typeof inner === 'string' ? inner : inner?.message;
  if (typeof text !== 'string' || !text.trim()) return undefined;
  const code = typeof inner === 'object' ? inner?.code : undefined;
  return code ? `${text.trim()} (code ${code})` : text.trim();
}
