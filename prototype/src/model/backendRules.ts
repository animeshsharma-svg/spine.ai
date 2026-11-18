/**
 * STAND-IN for the backend-rules citations (18 Nov 2026).
 *
 * routes/runCases.ts has imported "../model/backendRules.js" since commit 4c16953a (12 Nov), but that module was never
 * committed on any branch of the team repo, so a fresh checkout of `demo` failed its typecheck and could not start
 * the server. This file keeps both working; a case gets no code citation until the real module is committed
 * (keep THEIRS on the add/add conflict).
 */

/** the backend rules a run was grounded in: per action reached, its refusal rules (the real shape lives in the uncommitted module) */
export type RunBackend = {
  actions?: Array<{ method: string; path: string; rules: Array<{ message?: string; [k: string]: any }>; [k: string]: any }>;
  [k: string]: any;
};

/** the code citation for a rule reference, when the backend rules are present */
export function citeOf(_backend: RunBackend | undefined, _ref: string): { at: string; rule: string } | undefined {
  return undefined;
}
