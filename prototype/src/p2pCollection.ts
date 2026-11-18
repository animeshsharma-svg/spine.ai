/**
 * STAND-IN for the P2P collection runner (18 Nov 2026).
 *
 * server.ts has imported "./p2pCollection.js" since commit 4c16953a (12 Nov), but that module was never committed:
 * no commit on any branch of the team repo holds it, so a fresh checkout of `demo` could not start the server
 * (ERR_MODULE_NOT_FOUND). This file keeps the server starting and answers every P2P-collection call with "not
 * available"; the real module replaces it the moment it is committed (keep THEIRS on the add/add conflict).
 */
export type P2PFolder = { id: string; label: string; what: string; actor?: "buyer" | "vendor" | string; always?: boolean; [k: string]: any };

/** the folders of the P2P collection, in the order they run; empty until the real runner is committed */
export const FOLDERS: P2PFolder[] = [];

const WHY = "the P2P collection runner (src/p2pCollection.ts) is not in the repo yet — ask Aanya to commit it";

/** cases covered per folder id; none until the real runner is committed */
export function collectionFeatureCases(): Record<string, number> {
  return {};
}

export function collectionReady(): { ready: boolean; reason?: string; [k: string]: any } {
  return { ready: false, reason: WHY };
}

export function collectionSteps(): Array<{ id: string; title: string; actor?: string; feature?: string }> {
  return [];
}

export function folderGate(_account: any): Record<string, any> {
  return {};
}

export function readCollectionRun(_runId: string): any {
  return null;
}

export function rememberPo(_c: any, _poNumber: string, _runId: string): void {}

export function runCollection(_account: any, _folderIds: string[], _onEvent: (e: any) => void): any {
  throw new Error(WHY);
}

export function collectionReportHtml(_rec: any): string {
  return `<!doctype html><meta charset="utf-8"><title>P2P collection</title><p>${WHY}.</p>`;
}
