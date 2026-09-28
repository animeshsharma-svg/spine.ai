import type { DefectGroup } from "../agents/oracle.js";
import type { RfpRunRecord } from "../rfpRunner.js";

/**
 * An RFP run's failures, as bugs on the sheet.
 *
 * A failed case is a defect when the app did something wrong: a server error,
 * an invalid payload it accepted, a published event that reads back different
 * from what was sent. A refused token is not — it is the account, and it is
 * filed as environment so nobody triages it as engineering work. Cases that
 * did not run file nothing: untested is not broken.
 *
 * Grouped by endpoint + what went wrong, so the same 500 hit by six negative
 * cases is one bug seen six times, not six bugs.
 */

interface Call {
  method: string;
  path: string;
  status: number;
  ms: number;
  curl: string;
  responseText: string;
  at: string;
}
interface Case {
  id: string;
  title: string;
  plain: string;
  expected: string;
  actual: string;
  verdict: "pass" | "fail" | "not-run";
  part: "publish" | "verify" | "negative" | "surrogate";
  kind: string;
  checks: Array<{ name: string; pass: boolean; detail?: string; critical?: boolean }>;
  calls: Call[];
}

const endpoint = (p: string) =>
  p
    .split("?")[0]
    .replace(/\/[A-Za-z0-9+/_-]{6,}={0,2}(?=\/|$)/g, "/:id")
    .replace(/\/ZZZZZZZZ/g, "/:id");

function said(text: string): string | undefined {
  try {
    const j = JSON.parse(text);
    const m = j?.message ?? j?.error ?? j?.errors?.[0]?.message ?? j?.errors?.[0];
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 160);
  } catch {
    /* not JSON */
  }
  return text.trim() ? text.trim().slice(0, 160) : undefined;
}

export function defectsFromRfpRun(record: RfpRunRecord): DefectGroup[] {
  const model = record.model ?? {};
  const all: Case[] = [];
  for (const s of model.steps ?? []) {
    all.push(s);
    for (const c of s.cases ?? []) all.push(c);
  }
  for (const c of model.loose ?? []) all.push(c);

  const stoppedAt: string | undefined = model.stoppedAt?.at;
  const groups = new Map<string, DefectGroup>();

  for (const c of all) {
    if (c.verdict !== "fail") continue;
    const call = c.calls[c.calls.length - 1];
    const failed = c.checks.filter((k) => !k.pass);
    const status = call?.status ?? 0;
    const message = call ? said(call.responseText) : undefined;
    const credential = c.kind === "step" && (status === 401 || status === 403);
    const server = status >= 500;
    const accepted = c.kind !== "step" && status >= 200 && status < 300 && c.kind === "negative";
    const blocking = c.part === "publish" && stoppedAt === c.id;
    // Only slow? Say so — it is still worth a row, but it is not a broken endpoint.
    const onlySlow = failed.length > 0 && failed.every((k) => /^Responds within/.test(k.name));

    const what = server
      ? `server error ${status}`
      : accepted
        ? "accepts an invalid request"
        : onlySlow
          ? "responds slower than the SLA"
          : credential
            ? `refuses the account (${status})`
            : `${failed[0]?.name ?? "a check failed"}`;
    const where = call ? `${call.method} ${endpoint(call.path)}` : c.title;
    const key = `rfp:${where}:${what}`;
    const when = call?.at ?? record.startedAt;

    // Which section of the RFP report the case is in — the sheet says so.
    const section = c.kind === "step" ? "RFP event · Test Cases" : "RFP event · Validations";
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.flows.includes(section)) existing.flows.push(section);
      if (call?.curl && existing.evidence.length < 6) existing.evidence.push(`${c.id} — ${call.curl}`);
      if (when < existing.firstSeen) existing.firstSeen = when;
      if (when > existing.lastSeen) existing.lastSeen = when;
      existing.reproduction.push(`${c.id}: ${c.plain}`);
      continue;
    }

    const severity: DefectGroup["severity"] = blocking ? "critical" : server || accepted ? "high" : onlySlow ? "low" : c.kind !== "step" ? "medium" : "high";
    groups.set(key, {
      defectFingerprint: key,
      kind: credential ? "environment" : "product_defect",
      severity,
      title: `${where} ${what}` + (message && (server || credential) ? `: “${message}”` : ""),
      rationale:
        `${c.id} — ${c.plain} Expected: ${c.expected} Actual: ${c.actual}` +
        (failed.length ? ` Failed checks: ${failed.map((k) => k.name + (k.detail ? ` (${k.detail})` : "")).join("; ")}.` : "") +
        (blocking ? " The publish flow stopped here, so nothing after this step was tested." : "") +
        (credential ? " This is the account being refused, not the RFP API — refresh the token and run again." : ""),
      flows: [section],
      runs: [record.runId],
      occurrences: 1,
      firstSeen: when,
      lastSeen: when,
      evidence: [...(message ? [`the app replied: ${message}`] : []), ...(call?.curl ? [`${c.id} — ${call.curl}`] : [])],
      reproduction: [`Run the RFP suite against ${record.companyName}`, `${c.id}: ${c.plain}`],
      actionable: !credential,
    });
  }
  return [...groups.values()];
}
