import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * The bug report, read from config/findings.yaml.
 *
 * Hand-written on purpose. A run can show that a call returned 500; it cannot
 * decide whether that is a defect, test data, or a wrong expectation. Someone
 * judges it, and the fields here record both halves of that judgement:
 *
 *   `status`     how far verification got   (confirmed / intermittent / …)
 *   `devStatus`  where the fix has got to   (OPEN / FIXED / RE-OPEN / …)
 *
 * Two axes, because "we have reproduced this" and "engineering has fixed it"
 * are different claims. Everything else — priority, blocker, dev type, sprint
 * week, module, user type — is the column set the QA bug sheet already uses,
 * so a finding can be pasted between the two without being re-keyed.
 */

const ROOT = path.resolve(__dirname, '..', '..');
export const FINDINGS_PATH = path.join(ROOT, 'config', 'findings.yaml');

export type FindingStatus = 'confirmed' | 'intermittent' | 'unconfirmed' | 'not-a-bug';

/**
 * Lifecycle of the fix — the bug sheet's status column, value for value.
 *
 * Kept identical to the sheet's own dropdown (and to the QA platform's, which
 * renders the same vocabulary) so a row can move between the three without
 * anyone re-typing a status.
 */
export type DevStatus =
  | 'FIXED'
  | 'OPEN'
  | 'TO BE TESTED'
  | 'TO BE DEPLOYED'
  | 'TO BE PICKED'
  | 'TO DO'
  | 'TO BE DISCUSSED'
  | 'NOT A BUG'
  | 'FIX LATER'
  | 'Duplicate Issue'
  | 'Feature Bug/ Enhancement'
  | 'Re-open';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Severity = 'high' | 'medium' | 'low' | 'none';

/** As written in the YAML — most columns optional, and defaulted on load. */
export interface RawFinding {
  id: string;
  title: string;
  status: FindingStatus;
  severity: Severity;
  client?: string;
  endpoint?: string;
  detail: string;
  evidence?: string;
  /** sheet column A — e.g. "D__001". Derived from position when absent. */
  issueId?: string;
  devStatus?: string;
  devEta?: string;
  priority?: Priority;
  blocker?: boolean | string;
  devType?: string;
  devComment?: string;
  sprintWeek?: string;
  userType?: string;
  module?: string;
  /** the bug as the sheet states it; falls back to `title` */
  description?: string;
  /** the sheet's trailing remark column */
  note?: string;
  /** tints the description cell, the way the sheet highlights a row by hand */
  highlight?: boolean;
}

/** A finding with every column resolved — what both reports render. */
export interface Finding {
  id: string;
  issueId: string;
  title: string;
  status: FindingStatus;
  severity: Severity;
  devStatus: DevStatus;
  devEta: string;
  priority: Priority;
  blocker: boolean;
  devType: string;
  devComment: string;
  sprintWeek: string;
  userType: string;
  module: string;
  description: string;
  detail: string;
  note: string;
  highlight: boolean;
  client?: string;
  endpoint?: string;
  evidence?: string;
}

/** A bug with no priority set still has one: its severity implies it. */
const PRIORITY_FROM_SEVERITY: Record<Severity, Priority> = {
  high: 'P0',
  medium: 'P1',
  low: 'P2',
  none: 'P3',
};

export const DEV_STATUSES: DevStatus[] = [
  'FIXED',
  'OPEN',
  'TO BE TESTED',
  'TO BE DEPLOYED',
  'TO BE PICKED',
  'TO DO',
  'TO BE DISCUSSED',
  'NOT A BUG',
  'FIX LATER',
  'Duplicate Issue',
  'Feature Bug/ Enhancement',
  'Re-open',
];

/** Accepts "Re-open", "re_open", "REOPEN", "wont fix" — a sheet is typed by
 * hand, and a status nobody recognises must not silently become OPEN in
 * disguise. Unknown values are reported as OPEN, which is the safe default. */
function normaliseDevStatus(value: string | undefined, status: FindingStatus): DevStatus {
  if (!value) {
    // Nothing said: a ruled-out finding is closed, anything else is open.
    return status === 'not-a-bug' ? 'NOT A BUG' : 'OPEN';
  }
  const wanted = value.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  const matched = DEV_STATUSES.find((s) => s.toLowerCase() === wanted);
  if (matched) return matched;
  // Older files said WONT FIX / IN PROGRESS before the sheet's list was adopted.
  if (wanted === 'wont fix' || wanted === "won't fix") return 'NOT A BUG';
  if (wanted === 'in progress') return 'TO DO';
  if (wanted === 'reopen' || wanted === 're open') return 'Re-open';
  return 'OPEN';
}

/** "yes"/"no"/true/false — all of which appear in sheets. */
function normaliseBlocker(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return /^(y|yes|true|1)$/i.test(String(value ?? '').trim());
}

/**
 * The module a finding belongs to.
 *
 * Stated explicitly where it matters. Otherwise inferred from the endpoint,
 * which is enough to keep a finding out of the wrong module's column but is
 * deliberately vague — "Platform" is more honest than a guess.
 */
function inferModule(raw: RawFinding): string {
  if (raw.module) return raw.module;
  const endpoint = (raw.endpoint ?? '').toLowerCase();
  if (endpoint.includes('approval')) return 'Approvals';
  if (endpoint.includes('flexi_datasources')) return 'Schema';
  if (endpoint.includes('create_row') || endpoint.includes('fx_responses')) return 'PO';
  return 'Platform';
}

export function resolveFinding(raw: RawFinding, index: number): Finding {
  return {
    id: raw.id,
    issueId: raw.issueId ?? `D__${String(index + 1).padStart(3, '0')}`,
    title: raw.title,
    status: raw.status,
    severity: raw.severity,
    devStatus: normaliseDevStatus(raw.devStatus, raw.status),
    devEta: raw.devEta ?? '',
    priority: raw.priority ?? PRIORITY_FROM_SEVERITY[raw.severity] ?? 'P2',
    blocker: normaliseBlocker(raw.blocker),
    devType: (raw.devType ?? 'BE').toUpperCase(),
    devComment: raw.devComment ?? '',
    sprintWeek: raw.sprintWeek ?? '',
    userType: raw.userType ?? 'All users',
    module: inferModule(raw),
    description: raw.description ?? raw.title,
    detail: raw.detail ?? '',
    note: raw.note ?? '',
    highlight: raw.highlight ?? false,
    client: raw.client,
    endpoint: raw.endpoint,
    evidence: raw.evidence,
  };
}

/**
 * Findings in file order — which is issue-id order, and the order a sheet is
 * read in. Sorting by severity here would renumber nothing but would make
 * D__004 appear above D__002, and the ids are how people refer to these in
 * standup.
 */
export function loadFindings(file: string = FINDINGS_PATH): Finding[] {
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) as { findings?: RawFinding[] };
    return (parsed.findings ?? []).map(resolveFinding);
  } catch {
    // A malformed findings file must not stop a report being written.
    return [];
  }
}

/**
 * Only the ones relevant to the accounts a run went against, plus any marked
 * "both" — a Decathlon run should not lead with sandbox findings.
 *
 * Takes every client the run touched rather than one: keyed on a single id, a
 * two-client run showed the bugs of whichever account was busier and silently
 * dropped the other's, which is the one case where a reader needs both.
 */
export function findingsForClients(
  clientIds: readonly string[],
  all: Finding[] = loadFindings()
): Finding[] {
  const wanted = new Set(clientIds);
  return all.filter((f) => !f.client || f.client === 'both' || wanted.has(f.client));
}

/** Still open, still believed real — the number that belongs at the top. */
export function openFindings(findings: Finding[]): Finding[] {
  const closed: DevStatus[] = ['FIXED', 'NOT A BUG', 'Duplicate Issue'];
  return findings.filter((f) => f.status !== 'not-a-bug' && !closed.includes(f.devStatus));
}
