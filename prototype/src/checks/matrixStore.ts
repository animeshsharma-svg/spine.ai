/**
 * Where bidding-matrix runs are kept: one JSON file per client run in
 * data/matrix/ (the dashboard and the catalog cases read them back).
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MatrixRunResult } from "./biddingMatrix.js";

export const MATRIX_DIR = join(fileURLToPath(new URL("../../data/matrix", import.meta.url)));

export async function saveMatrixRun(r: MatrixRunResult): Promise<string> {
  await mkdir(MATRIX_DIR, { recursive: true });
  const file = join(MATRIX_DIR, `${r.startedAt.replace(/[:.]/g, "-")}_${r.companyId}.json`);
  await writeFile(file, JSON.stringify(r, null, 2));
  return file;
}

export async function listMatrixRuns(): Promise<Array<{ file: string; companyId: number; startedAt: string; combos: number; verdicts: Record<string, number> }>> {
  const files = (await readdir(MATRIX_DIR).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort().reverse();
  const out = [];
  for (const f of files.slice(0, 50)) {
    try {
      const r = JSON.parse(await readFile(join(MATRIX_DIR, f), "utf8")) as MatrixRunResult;
      const verdicts: Record<string, number> = {};
      for (const c of r.combos) verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;
      out.push({ file: f, companyId: r.companyId, startedAt: r.startedAt, combos: r.combos.length, verdicts });
    } catch {
      /* a half-written file is skipped */
    }
  }
  return out;
}

export async function readMatrixRun(file: string): Promise<MatrixRunResult | undefined> {
  if (!/^[\w.-]+\.json$/.test(file)) return undefined;
  return JSON.parse(await readFile(join(MATRIX_DIR, file), "utf8").catch(() => "null")) ?? undefined;
}

/** The latest run per client, merged combination by combination (newest wins). */
export async function latestMatrix(companyId: number): Promise<MatrixRunResult | undefined> {
  const runs = (await listMatrixRuns()).filter((r) => r.companyId === companyId);
  let merged: MatrixRunResult | undefined;
  for (const meta of runs.reverse()) {
    const r = await readMatrixRun(meta.file);
    if (!r) continue;
    if (!merged) merged = { ...r, combos: [...r.combos], probes: [...r.probes] };
    else {
      for (const c of r.combos) merged.combos = [...merged.combos.filter((x) => x.id !== c.id), c];
      for (const p of r.probes) merged.probes = [...merged.probes.filter((x) => !(x.id === p.id && x.combo === p.combo)), p];
      merged.startedAt = r.startedAt;
    }
  }
  return merged;
}
