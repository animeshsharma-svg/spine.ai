/**
 * The catalog INTO the database: features, journeys, test cases and their
 * versions, compiled plans — and, for the run writer, "which version of this
 * case did that result run?".
 *
 *   npm run db:sync-catalog       after npm run cases:import (or any case edit)
 *
 * Re-running changes nothing unless a file changed. A case whose content
 * changed gets a NEW version (the old one stays, with the results that ran
 * it); a case that disappeared from the files is retired, never deleted.
 */
import type { Queryable, OrgContext } from "./tenant.js";
import { FEATURE_TREE } from "../../config/featureTree.js";
import { allCaseKeys, caseContent, compiledPlanFiles, contentHash, journeyDefs } from "./catalogSource.js";

export interface SyncReport {
  features: { upserted: number; retired: number };
  journeys: { upserted: number; retired: number };
  cases: { total: number; created: number; newVersions: number; retired: number; generated: number };
  plans: { total: number; created: number; skippedNoCase: number };
}

// ── features + journeys ─────────────────────────────────────────────────────

export async function syncFeatures(c: Queryable, ctx: OrgContext): Promise<{ upserted: number; retired: number }> {
  let pos = 0;
  const keys: string[] = [];
  for (const g of FEATURE_TREE) {
    pos++;
    const r = await c.query(
      `INSERT INTO features (org_id, key, kind, parent_id, label, description, position, journey_step, retired_at)
       VALUES ($1, $2, 'group', NULL, $3, $4, $5, $6, NULL)
       ON CONFLICT (org_id, key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description,
         position = EXCLUDED.position, journey_step = EXCLUDED.journey_step, retired_at = NULL
       RETURNING id`,
      [ctx.orgId, g.id, g.label, g.what ?? "", pos, g.step ?? null],
    );
    const gid = r.rows[0].id;
    keys.push(g.id);
    for (const f of g.children) {
      pos++;
      keys.push(f.id);
      await c.query(
        `INSERT INTO features (org_id, key, kind, parent_id, label, description, position, portal, requires_config, flow_id, ui_flow, retired_at)
         VALUES ($1, $2, 'feature', $3, $4, $5, $6, $7, $8, $9, $10, NULL)
         ON CONFLICT (org_id, key) DO UPDATE SET parent_id = EXCLUDED.parent_id, label = EXCLUDED.label, description = EXCLUDED.description,
           position = EXCLUDED.position, portal = EXCLUDED.portal, requires_config = EXCLUDED.requires_config,
           flow_id = EXCLUDED.flow_id, ui_flow = EXCLUDED.ui_flow, retired_at = NULL`,
        [ctx.orgId, f.id, gid, f.label, f.what ?? "", pos, f.portal ?? null, f.requiresConfig ?? null, f.flowId ?? null, f.uiFlow ?? null],
      );
    }
  }
  const ret = await c.query(`UPDATE features SET retired_at = now() WHERE org_id = $1 AND retired_at IS NULL AND NOT (key = ANY($2))`, [ctx.orgId, keys]);
  return { upserted: keys.length, retired: ret.rowCount ?? 0 };
}

export async function syncJourneys(c: Queryable, ctx: OrgContext): Promise<{ upserted: number; retired: number }> {
  const defs = journeyDefs();
  for (const j of defs) {
    await c.query(
      `INSERT INTO journeys (org_id, key, title, persona, goal, position, ui_groups, api_groups, retired_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
       ON CONFLICT (org_id, key) DO UPDATE SET title = EXCLUDED.title, persona = EXCLUDED.persona, goal = EXCLUDED.goal,
         position = EXCLUDED.position, ui_groups = EXCLUDED.ui_groups, api_groups = EXCLUDED.api_groups, retired_at = NULL`,
      [ctx.orgId, j.id, j.title, j.persona ?? null, j.goal ?? null, j.order, j.uiGroups, j.apiGroups],
    );
  }
  if (!defs.length) return { upserted: 0, retired: 0 };
  const ret = await c.query(`UPDATE journeys SET retired_at = now() WHERE org_id = $1 AND retired_at IS NULL AND NOT (key = ANY($2))`, [ctx.orgId, defs.map((j) => j.id)]);
  return { upserted: defs.length, retired: ret.rowCount ?? 0 };
}

// ── cases and versions ──────────────────────────────────────────────────────

export type CaseOrigin = "catalog" | "library" | "generated" | "template-check" | "matrix" | "crosscheck" | "pasted" | "observed";

/** What a result knows about the case it ran, for cases no catalog file has. */
export interface CaseSeed {
  key: string;
  origin: CaseOrigin;
  title: string;
  layer?: "api" | "ui" | "api+ui" | "unknown";
  featureKey?: string | null;
  priority?: string | null;
  /** hashed as the version's content */
  content: Record<string, unknown>;
  source?: string | null;
}

interface CaseRow {
  id: number;
  origin: string;
  currentVersionId: number | null;
  versions: Map<string, { id: number; version: number }>;
  firstVersionId: number | null;
  maxVersion: number;
}

/** Loads cases by key (with their versions) for one organisation; caches within one writer call. */
export class CaseIndex {
  private rows = new Map<string, CaseRow | null>();
  private featureIds: Map<string, number> | undefined;
  private journeyOfCase: Map<string, number> | undefined;
  constructor(
    private c: Queryable,
    private ctx: OrgContext,
  ) {}

  async featureId(key: string | null | undefined): Promise<number | null> {
    if (!key) return null;
    if (!this.featureIds) {
      const r = await this.c.query(`SELECT key, id FROM features WHERE org_id = $1`, [this.ctx.orgId]);
      this.featureIds = new Map(r.rows.map((x: any) => [x.key, Number(x.id)]));
    }
    return this.featureIds.get(key) ?? null;
  }

  async journeyId(caseKey: string): Promise<number | null> {
    if (!this.journeyOfCase) {
      this.journeyOfCase = new Map();
      const r = await this.c.query(`SELECT key, id FROM journeys WHERE org_id = $1`, [this.ctx.orgId]);
      const ids = new Map(r.rows.map((x: any) => [x.key, Number(x.id)]));
      for (const j of journeyDefs()) {
        const id = ids.get(j.id);
        if (id) for (const k of j.caseIds) if (!this.journeyOfCase.has(k)) this.journeyOfCase.set(k, id);
      }
    }
    return this.journeyOfCase.get(caseKey) ?? null;
  }

  /** Load these keys (one query for all that are not loaded yet). */
  async load(keys: string[]): Promise<void> {
    const want = [...new Set(keys)].filter((k) => !this.rows.has(k));
    if (!want.length) return;
    for (const k of want) this.rows.set(k, null);
    const CH = 5000;
    for (let i = 0; i < want.length; i += CH) {
      const r = await this.c.query(
        `SELECT t.case_key, t.id, t.origin, t.current_version_id, v.id AS vid, v.version, v.content_hash
           FROM test_cases t LEFT JOIN case_versions v ON v.case_id = t.id
          WHERE t.org_id = $1 AND t.case_key = ANY($2)`,
        [this.ctx.orgId, want.slice(i, i + CH)],
      );
      for (const x of r.rows) {
        let row = this.rows.get(x.case_key);
        if (!row) {
          row = { id: Number(x.id), origin: x.origin, currentVersionId: x.current_version_id ? Number(x.current_version_id) : null, versions: new Map(), firstVersionId: null, maxVersion: 0 };
          this.rows.set(x.case_key, row);
        }
        if (x.vid) {
          const v = { id: Number(x.vid), version: Number(x.version) };
          row.versions.set(x.content_hash, v);
          if (v.version > row.maxVersion) row.maxVersion = v.version;
          if (v.version === 1 || row.firstVersionId === null) {
            const first = [...row.versions.values()].sort((a, b) => a.version - b.version)[0];
            row.firstVersionId = first.id;
          }
        }
      }
    }
  }

  get(key: string): CaseRow | null {
    return this.rows.get(key) ?? null;
  }

  /**
   * Make sure the case exists and has a version with this content; returns
   * { caseId, versionId, created, newVersion }. `makeCurrent` moves the case's
   * current version to it (true for the catalog's own sync and live runs).
   */
  async ensure(seed: CaseSeed, makeCurrent: boolean): Promise<{ caseId: number; versionId: number; created: boolean; newVersion: boolean }> {
    await this.load([seed.key]);
    let row = this.rows.get(seed.key) ?? null;
    let created = false;
    if (!row) {
      const r = await this.c.query(
        `INSERT INTO test_cases (org_id, case_key, origin, layer, feature_id, journey_id, group_key, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (org_id, case_key) DO UPDATE SET updated_at = now()
         RETURNING id, origin, current_version_id`,
        [
          this.ctx.orgId,
          seed.key,
          seed.origin,
          seed.layer ?? "unknown",
          await this.featureId(seed.featureKey),
          await this.journeyId(seed.key),
          groupOf(seed.key),
          seed.priority && /^P[0-4]$/.test(seed.priority) ? seed.priority : null,
        ],
      );
      row = { id: Number(r.rows[0].id), origin: r.rows[0].origin, currentVersionId: null, versions: new Map(), firstVersionId: null, maxVersion: 0 };
      this.rows.set(seed.key, row);
      created = true;
    }
    const hash = contentHash(seed.content);
    let v = row.versions.get(hash);
    let newVersion = false;
    if (!v) {
      const r = await this.c.query(
        `INSERT INTO case_versions (org_id, case_id, version, content_hash, title, content, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (case_id, content_hash) DO UPDATE SET title = case_versions.title
         RETURNING id, version`,
        [this.ctx.orgId, row.id, row.maxVersion + 1, hash, seed.title.slice(0, 2000) || seed.key, JSON.stringify(seed.content), seed.source ?? null],
      );
      v = { id: Number(r.rows[0].id), version: Number(r.rows[0].version) };
      row.versions.set(hash, v);
      row.maxVersion = Math.max(row.maxVersion, v.version);
      if (row.firstVersionId === null) row.firstVersionId = v.id;
      newVersion = true;
    }
    if ((makeCurrent || row.currentVersionId === null) && row.currentVersionId !== v.id) {
      await this.c.query(`UPDATE test_cases SET current_version_id = $2, retired_at = NULL WHERE id = $1`, [row.id, v.id]);
      row.currentVersionId = v.id;
    }
    return { caseId: row.id, versionId: v.id, created, newVersion };
  }
}

export function groupOf(key: string): string | null {
  const m = key.match(/^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-\d/);
  return m ? m[1] : null;
}

/** The seed for a catalog or library case as the files hold it now. */
export function seedFromFiles(key: string): CaseSeed | null {
  const cc = caseContent(key);
  if (!cc) return null;
  return {
    key,
    origin: cc.origin,
    title: cc.title,
    layer: cc.layer,
    featureKey: cc.featureKey,
    priority: cc.priority,
    content: cc.content as unknown as Record<string, unknown>,
    source: cc.source,
  };
}

/** Copy the whole catalog in. Run inside withService (or withOrg for the org). */
export async function syncCatalog(c: Queryable, ctx: OrgContext): Promise<SyncReport> {
  const features = await syncFeatures(c, ctx);
  const journeys = await syncJourneys(c, ctx);

  const idx = new CaseIndex(c, ctx);
  const keys = allCaseKeys();
  await idx.load(keys);
  let created = 0;
  let newVersions = 0;
  for (const k of keys) {
    const seed = seedFromFiles(k);
    if (!seed) continue;
    const r = await idx.ensure(seed, true);
    if (r.created) created++;
    else if (r.newVersion) newVersions++;
    // metadata that can change without the content changing (an origin
    // upgrade when a library case gets its written twin, a feature move)
    await c.query(
      `UPDATE test_cases SET origin = $2, layer = $3, feature_id = coalesce($4, feature_id), journey_id = coalesce($5, journey_id),
              group_key = coalesce($6, group_key), priority = coalesce($7, priority), retired_at = NULL
        WHERE id = $1 AND (origin, layer, feature_id, journey_id, group_key, priority, retired_at)
              IS DISTINCT FROM ($2, $3, coalesce($4, feature_id), coalesce($5, journey_id), coalesce($6, group_key), coalesce($7, priority), NULL::timestamptz)`,
      [r.caseId, seed.origin, seed.layer ?? "unknown", await idx.featureId(seed.featureKey), await idx.journeyId(k), groupOf(k), seed.priority ?? null],
    );
  }

  // Cases the assistant drafted (003 generated_cases), unless rejected.
  let generated = 0;
  const g = await c.query(`SELECT id, status, title, setup, steps, expected, oracle, layer, api_case, ui_plan FROM generated_cases WHERE status <> 'rejected'`).catch(() => ({ rows: [] as any[] }));
  for (const x of g.rows) {
    if (keys.includes(x.id)) continue;
    const layer = x.layer === "api" || x.layer === "ui" || x.layer === "api+ui" ? x.layer : "unknown";
    const r = await idx.ensure(
      {
        key: x.id,
        origin: "generated",
        title: x.title,
        layer,
        content: { written: { title: x.title, setup: x.setup, steps: x.steps, expected: x.expected, oracle: x.oracle, layer: x.layer, status: x.status }, automation: x.api_case ?? x.ui_plan ?? null },
        source: "generated_cases",
      },
      true,
    );
    if (r.created || r.newVersion) generated++;
  }

  // Cases no file has any more: retired (their versions and results stay).
  const ret = await c.query(
    `UPDATE test_cases SET retired_at = now()
      WHERE org_id = $1 AND origin IN ('catalog', 'library') AND retired_at IS NULL AND NOT (case_key = ANY($2))`,
    [ctx.orgId, keys],
  );

  const plans = await syncPlans(c, ctx, idx);
  return { features, journeys, cases: { total: keys.length, created, newVersions, retired: ret.rowCount ?? 0, generated }, plans };
}

export async function syncPlans(c: Queryable, ctx: OrgContext, idx = new CaseIndex(c, ctx)): Promise<SyncReport["plans"]> {
  const files = compiledPlanFiles();
  await idx.load(files.map((f) => f.caseId));
  let created = 0;
  let skippedNoCase = 0;
  for (const f of files) {
    const row = idx.get(f.caseId);
    if (!row) {
      skippedNoCase++;
      continue;
    }
    const hash = contentHash(f.plan);
    const coverage = ["full", "partial", "none"].includes(f.meta?.coverage) ? f.meta.coverage : "none";
    const at = f.meta?.compiledAt && !isNaN(Date.parse(f.meta.compiledAt)) ? f.meta.compiledAt : new Date().toISOString();
    const r = await c.query(
      `INSERT INTO compiled_plans (org_id, case_id, case_version_id, kind, plan_version, plan_hash, coverage, gaps, warnings, compiled_by, compiled_at, plan, source)
       SELECT $1, $2, $3, $4, coalesce(max(p.plan_version), 0) + 1, $5, $6, $7, $8, $9, $10, $11, $12
         FROM compiled_plans p WHERE p.case_id = $2 AND p.kind = $4
       ON CONFLICT (case_id, kind, plan_hash) DO NOTHING`,
      [
        ctx.orgId,
        row.id,
        row.currentVersionId,
        f.kind,
        hash,
        coverage,
        (f.meta?.gaps ?? []).map(String),
        (f.meta?.warnings ?? []).map(String),
        f.meta?.source ?? f.meta?.tier ?? null,
        at,
        JSON.stringify(f.plan),
        f.file,
      ],
    );
    created += r.rowCount ?? 0;
  }
  return { total: files.length, created, skippedNoCase };
}
