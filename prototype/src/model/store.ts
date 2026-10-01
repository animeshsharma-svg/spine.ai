/**
 * Where the product model lives.
 *
 *   spine.ai's database (migration 002) — anatomy rows, field-rule rows, and a
 *   versioned snapshot per client (content hash; an unchanged re-fetch is a
 *   light row pointing at the snapshot that holds the detail).
 *
 *   File fallback — src/model/snapshots/<companyId>.json holds the latest
 *   built model, and src/model/anatomy.json the static knowledge, so every
 *   query still answers when Postgres is down.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spineDb } from "../db/spineDb.js";
import type { ClientModel } from "./types.js";
import { diffModels } from "./build.js";

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(here, "snapshots");
export const ANATOMY_PATH = join(here, "anatomy.json");

function fileOf(companyId: number): string {
  return join(SNAP_DIR, `${companyId}.json`);
}

export function loadModelFile(companyId: number): ClientModel | null {
  try {
    return JSON.parse(readFileSync(fileOf(companyId), "utf8")) as ClientModel;
  } catch {
    return null;
  }
}

export async function loadLatestModel(companyId: number): Promise<{ model: ClientModel | null; from: "database" | "file" | "none" }> {
  const db = await spineDb();
  if (db) {
    try {
      const r = await db.query(
        `SELECT l.snapshot_id, l.fetched_at, l.changed, l.changes, s.model
           FROM model_latest l JOIN model_snapshots s ON s.id = l.data_snapshot_id
          WHERE l.company_id = $1`,
        [companyId],
      );
      if (r.rows[0]?.model) {
        const m = r.rows[0].model as ClientModel;
        // the light row's time is when it was last checked
        m.fetchedAt = new Date(r.rows[0].fetched_at).toISOString();
        m.snapshotId = Number(r.rows[0].snapshot_id);
        return { model: m, from: "database" };
      }
    } catch {
      /* table missing (migration not applied) → file */
    }
  }
  const f = loadModelFile(companyId);
  return { model: f, from: f ? "file" : "none" };
}

/** Save a freshly built model: always to the file; to the DB as a new version (or a light "unchanged" row). */
export async function saveModel(model: ClientModel): Promise<{ snapshotId: number | null; changed: boolean; changes: string[]; savedTo: string[] }> {
  const prev = (await loadLatestModel(model.companyId)).model;
  const changed = !prev || prev.hash !== model.hash;
  const changes = changed ? diffModels(prev, model) : [];
  model.previousHash = prev?.hash ?? null;
  model.changed = changed;
  model.changes = changes;
  const savedTo: string[] = [];

  mkdirSync(SNAP_DIR, { recursive: true });
  writeFileSync(fileOf(model.companyId), JSON.stringify(model, null, 1));
  savedTo.push(`file src/model/snapshots/${model.companyId}.json`);

  const db = await spineDb();
  let snapshotId: number | null = null;
  if (db) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      if (!changed && prev?.snapshotId) {
        const holder = await client.query(`SELECT coalesce(same_as, id) AS id FROM model_snapshots WHERE id = $1`, [prev.snapshotId]);
        const r = await client.query(
          `INSERT INTO model_snapshots (company_id, company_name, fetched_at, content_hash, previous_hash, changed, same_as, summary, changes, model)
           VALUES ($1,$2,$3,$4,$5,false,$6,$7,'[]',NULL) RETURNING id`,
          [model.companyId, model.companyName, model.fetchedAt, model.hash, prev.hash, holder.rows[0]?.id ?? prev.snapshotId, model.summary],
        );
        snapshotId = Number(r.rows[0].id);
      } else {
        const r = await client.query(
          `INSERT INTO model_snapshots (company_id, company_name, fetched_at, content_hash, previous_hash, changed, summary, changes, model)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [model.companyId, model.companyName, model.fetchedAt, model.hash, prev?.hash ?? null, changed, model.summary, JSON.stringify(changes), model],
        );
        snapshotId = Number(r.rows[0].id);
        for (const t of model.templates) {
          await client.query(
            `INSERT INTO model_templates (snapshot_id, company_id, uuid, name, template_type, order_type, type_identifiers, listed_under, use_for,
                                          is_default, opens, field_count, required_count, problems, content_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [snapshotId, model.companyId, t.uuid, t.name, t.templateType, t.orderType ?? null, t.typeIdentifiers, t.listedUnder, t.useFor,
             t.isDefault, t.opens, t.fieldCount, t.requiredCount, JSON.stringify(t.problems), null],
          );
          for (const f of t.fields) {
            await client.query(
              `INSERT INTO model_template_fields (snapshot_id, company_id, template_uuid, position, section, page, key, name, input_type,
                                                  filled_by, required, mode, unit, options, formula, rules, plain)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
              [snapshotId, model.companyId, t.uuid, f.position, f.section, f.page ?? null, f.key, f.name, f.inputType, f.filledBy, f.required,
               f.mode ?? null, f.unit ?? null, f.options ? JSON.stringify(f.options) : null, f.formula ?? null, JSON.stringify(f.rules), f.plain],
            );
          }
        }
        for (const [i, u] of model.units.usable.entries()) {
          // unit ids are not carried in the built model; position keeps rows unique per snapshot
          await client.query(
            `INSERT INTO model_units (snapshot_id, company_id, unit_id, symbol, name, owner_company_id) VALUES ($1,$2,$3,$4,$5,$6)`,
            [snapshotId, model.companyId, i, u.symbol, u.name, u.owner === "client" ? model.companyId : null],
          );
        }
      }
      await client.query("COMMIT");
      model.snapshotId = snapshotId;
      writeFileSync(fileOf(model.companyId), JSON.stringify(model, null, 1));
      savedTo.push(`database snapshot #${snapshotId}${changed ? "" : " (unchanged — points at the earlier one)"}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      savedTo.push(`database FAILED: ${(e as Error).message}`);
      snapshotId = null;
    } finally {
      client.release();
    }
  }
  return { snapshotId, changed, changes, savedTo };
}

/** Snapshot history for one client, newest first. */
export async function snapshotHistory(companyId: number, limit = 20): Promise<Array<{ id: number; fetchedAt: string; changed: boolean; hash: string; changes: string[]; summary: unknown }>> {
  const db = await spineDb();
  if (!db) return [];
  try {
    const r = await db.query(
      `SELECT id, fetched_at, changed, content_hash, changes, summary FROM model_snapshots WHERE company_id = $1 ORDER BY fetched_at DESC, id DESC LIMIT $2`,
      [companyId, limit],
    );
    return r.rows.map((x) => ({ id: Number(x.id), fetchedAt: new Date(x.fetched_at).toISOString(), changed: x.changed, hash: x.content_hash, changes: x.changes, summary: x.summary }));
  } catch {
    return [];
  }
}

// ── static knowledge ─────────────────────────────────────────────────────────

export function loadAnatomyFile(): any | null {
  try {
    return existsSync(ANATOMY_PATH) ? JSON.parse(readFileSync(ANATOMY_PATH, "utf8")) : null;
  } catch {
    return null;
  }
}

/** Replace the anatomy + field-rule rows with the current static knowledge. */
export async function saveStaticKnowledge(
  anatomyRows: Array<{ id: string; section: string; title: string; plain: string; code?: number | null; details?: unknown; cites: string[] }>,
  ruleRows: Array<{ id: string; appliesTo: string; kind: string; plain: string; enforcedBy: string; code?: number | null; message?: string | null; details?: unknown; cites: string[] }>,
  backendRef: string,
): Promise<string> {
  const db = await spineDb();
  if (!db) return "database not reachable — static knowledge kept in anatomy.json only";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM model_anatomy");
    for (const a of anatomyRows) {
      await client.query(
        `INSERT INTO model_anatomy (id, section, title, plain, code, details, cites, backend_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [a.id, a.section, a.title, a.plain, a.code ?? null, JSON.stringify(a.details ?? {}), a.cites, backendRef],
      );
    }
    await client.query("DELETE FROM model_field_rules");
    for (const r of ruleRows) {
      await client.query(
        `INSERT INTO model_field_rules (id, applies_to, kind, plain, enforced_by, code, message, details, cites) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.id, r.appliesTo, r.kind, r.plain, r.enforcedBy, r.code ?? null, r.message ?? null, JSON.stringify(r.details ?? {}), r.cites],
      );
    }
    await client.query("COMMIT");
    return `database: ${anatomyRows.length} anatomy rows, ${ruleRows.length} field-rule rows`;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return `database FAILED: ${(e as Error).message}`;
  } finally {
    client.release();
  }
}
