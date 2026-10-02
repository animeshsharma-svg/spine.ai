import type { DefectGroup } from "../agents/oracle.js";
import type { PoRunRecord } from "../poRunStore.js";

/**
 * WHAT ONE PO RUN FOUND — from the calls the app refused, not from a list.
 *
 * The PO flow's bug sheet used to open the platform's whole standing sheet:
 * every hand-raised finding ever filed, headed by defects from other modules,
 * after a run that had just stopped on its own specific 422. The answer to
 * "what went wrong just now" was somewhere on page two.
 *
 * A PO run already holds the answer. Its report records every call with the
 * status the app returned, the message the app wrote, and the curl that
 * reproduces it. Turning the refused ones into defects makes the sheet about
 * this run, and — because the evidence is the app's own words plus a command
 * anyone can paste — makes it something a backend engineer can act on without
 * asking what the automation was doing.
 */

interface ReportCall {
  method?: string;
  uri?: string;
  url?: string;
  status?: number;
  ok?: boolean;
  step?: string;
  message?: string;
  curl?: string;
  timestamp?: string;
}

interface ReportCase {
  test?: { title?: string; status?: string; startedAt?: string };
  calls?: ReportCall[];
  failedCalls?: ReportCall[];
}

/**
 * The app's message, in the app's words.
 *
 * The suite keeps the refusal payload whole, which is right for evidence and
 * wrong for a title: `{"code":754,"message":"Datasource id is missing in
 * input"}` reads as a blob. The sentence inside it is what a reader needs, and
 * the code is worth keeping next to it because that is what a backend engineer
 * will search for.
 */
function saidPlainly(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text.startsWith("{")) return text;
  try {
    const body = JSON.parse(text) as { message?: string; code?: number; error?: { message?: string; code?: number } };
    const inner = body.error ?? body;
    if (!inner?.message) return text;
    return inner.code ? `${inner.message} (code ${inner.code})` : inner.message;
  } catch {
    return text;
  }
}

/** The path alone: two searches of the same endpoint are one defect. */
function endpoint(call: ReportCall): string {
  const raw = call.uri ?? call.url ?? "";
  return raw.split("?")[0] || "(unknown endpoint)";
}

/**
 * A refusal aimed at US, not at the request.
 *
 * "You are not authorized to perform this action" and a plain 401 are the app
 * saying the credential may not do this — which is a statement about the
 * account the run signed in as, not about the feature under test. Filed as a
 * product defect it reads as "the purchase order API is broken", and a reader
 * goes looking for a bug that is not there. It is an environment problem, and
 * saying so is the difference between a fix that takes a minute and an
 * afternoon spent in the wrong repository.
 */
function isCredentialRefusal(status: number | undefined, said: string | undefined): boolean {
  if (status === 401 || status === 403) return true;
  return /not authorized|unauthori[sz]ed|permission|forbidden|authentication failed/i.test(said ?? "");
}

function severityOf(status: number | undefined, blocking: boolean): DefectGroup["severity"] {
  // A refusal that stopped the run outranks one the run survived, whatever
  // the status code says — the blast radius is the whole flow either way.
  if (blocking) return "critical";
  if (status && status >= 500) return "critical";
  if (status === 401 || status === 403) return "high";
  return "high";
}

export function defectsFromPoRun(record: PoRunRecord): DefectGroup[] {
  const model = record.report as { cases?: ReportCase[] } | null;
  const cases = model?.cases ?? [];
  if (!cases.length) return [];

  // The run stopped at the last step it reached; a refusal there is what
  // ended it, rather than something it walked past.
  const lastStepTitle = cases[cases.length - 1]?.test?.title;
  const stopped = record.exitCode !== 0;

  const byDefect = new Map<string, DefectGroup>();

  for (const c of cases) {
    const stepTitle = c.test?.title ?? "a step";
    const failed = c.failedCalls?.length ? c.failedCalls : (c.calls ?? []).filter((call) => call.ok === false);

    for (const call of failed) {
      const path = endpoint(call);
      const status = call.status;
      const said = saidPlainly(call.message);
      const key = `po-call:${call.method ?? "?"}:${path}:${status ?? "?"}:${said ?? ""}`;
      const when = call.timestamp ?? c.test?.startedAt ?? record.startedAt;
      const blocking = stopped && stepTitle === lastStepTitle;

      const credential = isCredentialRefusal(status, said);
      const existing = byDefect.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.flows.includes("PO automation")) existing.flows.push("PO automation");
        if (call.curl && existing.evidence.length < 6) existing.evidence.push(call.curl);
        if (when && when < existing.firstSeen) existing.firstSeen = when;
        if (when && when > existing.lastSeen) existing.lastSeen = when;
        continue;
      }

      byDefect.set(key, {
        defectFingerprint: key,
        kind: credential ? "environment" : "product_defect",
        severity: severityOf(status, blocking),
        title:
          `${call.method ?? "?"} ${path} is refused` +
          (said ? `: “${said}”` : "") +
          (status ? ` (HTTP ${status})` : ""),
        rationale:
          `The purchase-order run called this during “${stepTitle}” and the app refused it` +
          (said ? ` with “${said}”` : "") +
          `. ` +
          (credential
            ? "This is the app refusing the account the run signed in as, not a fault in the " +
              "purchase-order API: the call never got as far as being judged. Nothing here was " +
              "tested. Give this login access to the datasource, or run as one that has it. "
            : "") +
          (blocking
            ? "The run stopped here, so nothing after this step was exercised at all."
            : "The run carried on, so this did not fail a step on its own — but the values it " +
              "was fetching never arrived, and whatever needed them went out incomplete."),
        flows: ["PO automation"],
        runs: [record.runId],
        occurrences: 1,
        firstSeen: when ?? record.startedAt,
        lastSeen: when ?? record.endedAt,
        // The app's own words, then the command that reproduces it.
        evidence: [
          ...(said ? [`the app replied: ${said}`] : []),
          ...(call.curl ? [call.curl] : []),
        ],
        reproduction: [
          `Run the PO automation against ${record.companyName ?? "this account"}`,
          `It stops at “${stepTitle}” — or paste the curl above to see the same refusal on its own`,
        ],
        actionable: true,
      });
    }
  }

  /**
   * What the run could not finish is NOT filed here.
   *
   * It was, briefly, and it was wrong: "the purchase order never entered
   * approval because this account has no flow that accepts one" arrived in the
   * bug table with an issue id, a P1, a Dev ETA and a Sprint Week — inviting
   * someone to triage as engineering work a thing no engineer will ever fix.
   * It is a fact about the run and the account, so it is carried as a run note
   * on the sheet's scope instead (see `notes` in SheetScope), above the bugs
   * and clearly apart from them.
   */

  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...byDefect.values()].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.occurrences - a.occurrences,
  );
}
