/**
 * ONE POSTMAN REQUEST = ONE PLAYWRIGHT TEST = ONE ROW IN THE REPORT.
 *
 * Each case declares, before it sends anything, what it is and what should
 * happen. It then runs its checks — the collection's pm.test lines, one named
 * check each — and files a record the reporter turns into the test report:
 * the plain sentence, the expected result, the actual result, every check, and
 * the calls it made as curls.
 *
 * A check never stops a case on its own; a failed case still reports every
 * check it had. A CRITICAL check is the collection's U.critical: in the
 * publish flow it stops the rest of the flow (stop_on_failure), because every
 * later step consumes what this one should have produced.
 */
import { expect, test } from "@playwright/test";

import { Api, type ApiResponse } from "./api.js";
import { caseSelected, cfgBool, cfgInt, mode, type SuitePart } from "./config.js";
import { schemaErrors, type SchemaName } from "./schemas.js";
import { loadState, NEEDS_REASON, saveState, type RunState } from "./state.js";

export type CaseKind = "step" | "negative" | "edge" | "security" | "latency";

export interface CaseMeta {
  /** the collection's own number: "1.8", "3.2.6" */
  id: string;
  /** the request name, in the words of the collection */
  title: string;
  /** what this case does, as one sentence a non-engineer reads */
  plain: string;
  /** what should happen — stated before the request goes out */
  expected: string;
  /** the happy-path step this case belongs under in the report ("1.8") */
  anchor: string;
  part: SuitePart;
  kind: CaseKind;
  /** state this case consumes; missing state = not run, with the reason */
  needs?: Array<keyof RunState>;
  /** a failure here stops the publish flow */
  chain?: boolean;
  /** only for this kind of event; in the other, the case is left out of the run */
  mode?: "rfp" | "rfq";
  /**
   * Say so, rather than leave it out, when the mode does not fit — for a case
   * someone ticks on purpose (the surrogate bid on an RFQ).
   */
  modeNote?: string;
}

export interface CheckRecord {
  name: string;
  pass: boolean;
  detail?: string;
  critical?: boolean;
}

export interface CaseRecord {
  meta: CaseMeta;
  checks: CheckRecord[];
  calls: Api["calls"];
  actual?: string;
  notes: string[];
  /** the ids this case produced, by name */
  produced?: Record<string, string>;
}

class CriticalStop extends Error {}
class SkipSignal extends Error {}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
/**
 * An assertion's failure, as the reader needs it: our own message when the
 * check gave one, otherwise just Expected / Received — never the matcher
 * signature ("expect(received).toEqual(expected) // deep equality").
 */
const clean = (e: unknown) => {
  const lines = String((e as Error)?.message ?? e)
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^at /.test(l) && !/^Call log:/.test(l));
  const cut = lines.findIndex((l) => /^expect\(/.test(l));
  const keep =
    cut > 0
      ? lines.slice(0, cut)
      : lines.filter((l) => !/^expect\(/.test(l) && !/^[-+] (Expected|Received)\s+[-+]/.test(l)).slice(0, 4);
  return keep.join(" ").slice(0, 400);
};

export const sla = (cls: "normal" | "heavy" = "normal") => (cls === "heavy" ? cfgInt("sla_heavy_ms")! : cfgInt("sla_ms")!);

export class Ctx {
  readonly checks: CheckRecord[] = [];
  readonly notes: string[] = [];
  actualText?: string;
  produced: Record<string, string> = {};

  constructor(
    readonly api: Api,
    readonly state: RunState,
    readonly meta: CaseMeta,
  ) {}

  /** A named check. `fn` asserts with expect(); a throw is a failure, never a crash. */
  check(name: string, fn: () => unknown): boolean {
    try {
      fn();
      this.checks.push({ name, pass: true });
      return true;
    } catch (e) {
      this.checks.push({ name, pass: false, detail: clean(e) });
      return false;
    }
  }

  /** A check the rest of the case — and in the publish flow, the rest of the run — depends on. */
  critical(name: string, fn: () => unknown): void {
    if (this.check(name, fn)) return;
    this.checks[this.checks.length - 1].critical = true;
    throw new CriticalStop(`${name}: ${this.checks[this.checks.length - 1].detail ?? "failed"}`);
  }

  /** What did happen, as one sentence. Without it the report derives one from the call and the checks. */
  actual(sentence: string): void {
    this.actualText = sentence;
  }

  note(line: string): void {
    this.notes.push(line);
  }

  /** Stop here and report the case as not run, with the reason. */
  skip(reason: string): never {
    throw new SkipSignal(reason);
  }

  private snippet(res: ApiResponse, n = 300) {
    return res.text.slice(0, n);
  }

  /**
   * The collection's U.basic: status, response time, JSON, size, schema.
   * Returns whether the status was the one expected.
   */
  basic(
    res: ApiResponse,
    opts: { status?: number | number[]; sla?: "normal" | "heavy"; json?: boolean; schema?: SchemaName; critical?: boolean } = {},
  ): boolean {
    const want = opts.status ?? 200;
    const limit = sla(opts.sla);
    const statusName = `Status code is ${Array.isArray(want) ? want.join("/") : want}`;
    const ok = this.check(statusName, () => {
      if (Array.isArray(want)) expect(want, `got ${res.status} ${this.snippet(res)}`).toContain(res.status);
      else expect(res.status, `got ${res.status} ${this.snippet(res)}`).toBe(want);
    });
    this.check(`Responds within ${limit} ms`, () => expect(res.ms, `took ${res.ms} ms`).toBeLessThan(limit));
    if (res.status !== 204 && opts.json !== false) {
      this.check("Content-Type is application/json", () =>
        expect(res.headers["content-type"] ?? "", "content-type").toContain("application/json"),
      );
      this.check("Body is valid JSON", () => expect(res.json, this.snippet(res, 120)).not.toBeNull());
    }
    this.check("Response size under 5 MB", () => expect(res.size).toBeLessThan(5 * 1024 * 1024));
    if (opts.schema && ok) {
      const errs = schemaErrors(opts.schema, res.json);
      this.check(`Reply matches the ${opts.schema} schema`, () => expect(errs, errs ?? "").toBeNull());
    }
    if (!ok && opts.critical) {
      this.checks.find((c) => c.name === statusName)!.critical = true;
      throw new CriticalStop(`unexpected status ${res.status}`);
    }
    return ok;
  }

  /**
   * The collection's U.negative.
   *  - reject: must be refused (4xx, or one of `codes`) with a message
   *  - graceful: anything but a server error; what it did is noted
   */
  negative(res: ApiResponse, opts: { mode?: "reject" | "graceful"; codes?: number[]; sla?: "normal" | "heavy" } = {}): void {
    const code = res.status;
    const limit = sla(opts.sla);
    this.check("No server error (not 5xx)", () => expect(code, this.snippet(res)).toBeLessThan(500));
    this.check(`Responds within ${limit} ms`, () => expect(res.ms, `took ${res.ms} ms`).toBeLessThan(limit));
    if ((opts.mode ?? "reject") === "reject") {
      if (opts.codes) {
        this.check(`Refused with ${opts.codes.join("/")}`, () =>
          expect(opts.codes, `got ${code}: ${this.snippet(res)}`).toContain(code),
        );
      } else {
        this.check("Refused with a 4xx", () => {
          expect(code, `got ${code}: ${this.snippet(res)}`).toBeGreaterThanOrEqual(400);
          expect(code, `got ${code}: ${this.snippet(res)}`).toBeLessThan(500);
        });
      }
      this.check("Error body is not empty", () => expect(res.text.length).toBeGreaterThan(0));
      // Only a POST creates something. A PATCH that is wrongly accepted
      // changes the record it names — reported as accepted, never as a leak.
      const lastCall = this.api.calls[this.api.calls.length - 1];
      if (code >= 200 && code < 300 && res.json?.uuid && lastCall?.method === "POST") {
        const leaks = (this.state.negLeaks ??= []);
        leaks.push({ request: `${this.meta.id} ${this.meta.title}`, uuid: res.json.uuid });
        this.note(`The invalid payload was ACCEPTED and created ${res.json.uuid}.`);
      }
      if (res.json && code >= 400) {
        this.check("Error reply carries a message", () =>
          expect(
            /error|message|invalid|not|required|unauthor|forbidden|must|blank|exist/.test(JSON.stringify(res.json).toLowerCase()),
            JSON.stringify(res.json).slice(0, 300),
          ).toBe(true),
        );
      }
    } else {
      this.note(`Behaviour: HTTP ${code} — ${this.snippet(res, 200) || "(empty body)"}`);
    }
  }
}

/** Declares one case. The body gets a Ctx; everything it records lands in the report. */
export function rfpCase(meta: CaseMeta, body: (t: Ctx) => Promise<void>): void {
  test(`${meta.id} ${meta.title}`, async ({ request }) => {
    const info = test.info();
    // The reporter reads the case's words even when it never runs.
    info.annotations.push({ type: "rfp-meta", description: JSON.stringify(meta) });

    if (!caseSelected(meta.id, meta.part)) test.skip(true, "not part of this run — only the features ticked on the platform run");
    // The surrogate bid (4.x, 5.x) is written for RFP rounds; on an RFQ it says so, all the way down.
    const onlyFor = meta.mode ?? (meta.part === "surrogate" ? "rfp" : undefined);
    if (onlyFor && onlyFor !== mode()) {
      const note =
        meta.modeNote ??
        (meta.part === "surrogate"
          ? "the surrogate bid covers RFP rounds only — this run is an RFQ, and an RFQ price bid needs its own flow"
          : undefined);
      test.skip(true, note ?? `not part of this run — ${onlyFor.toUpperCase()} only, and this run is an ${mode().toUpperCase()}`);
    }
    const state = loadState();
    if (meta.part === "publish" && state.stopped && state.stopped.at !== meta.id) {
      test.skip(true, `the publish flow stopped at step ${state.stopped.at} (${state.stopped.reason}), and this step needs what that one should have produced`);
    }
    const missing = (meta.needs ?? []).filter((k) => state[k] === undefined || state[k] === null || state[k] === false);
    if (missing.length) {
      test.skip(true, NEEDS_REASON[missing[0]] ?? `it needs ${String(missing[0])}, which an earlier step did not produce`);
    }

    const t = new Ctx(new Api(request), state, meta);
    let skipReason: string | undefined;
    try {
      await body(t);
    } catch (e) {
      if (e instanceof SkipSignal) skipReason = e.message;
      else if (e instanceof CriticalStop) {
        if (meta.chain && cfgBool("stop_on_failure")) t.state.stopped = { at: meta.id, reason: e.message };
      } else {
        t.checks.push({ name: "The case ran to the end", pass: false, detail: clean(e) });
        if (meta.chain && cfgBool("stop_on_failure")) t.state.stopped = { at: meta.id, reason: clean(e) };
      }
    }
    saveState(t.state);

    const record: CaseRecord = {
      meta,
      checks: t.checks,
      calls: t.api.calls,
      actual: t.actualText,
      notes: t.notes,
      produced: Object.keys(t.produced).length ? t.produced : undefined,
    };
    info.annotations.push({ type: "rfp-case", description: JSON.stringify(record) });
    if (skipReason) test.skip(true, skipReason);

    const failed = t.checks.filter((c) => !c.pass);
    if (failed.length) {
      throw new Error(failed.map((f) => `✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`).join("\n"));
    }
  });
}

export const uniq = <T>(a: T[]) => a.filter((x, i) => a.indexOf(x) === i);
export const sameSet = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
export const now = () => Math.floor(Date.now() / 1000);
export function parseQty(s: unknown) {
  const m = String(s ?? "").trim().match(/^(-?[0-9.]+)\s*(.*)$/);
  return m ? { value: Number(m[1]), unit: m[2].trim() } : null;
}
export const approx = (a: unknown, b: unknown, tol = 1e-6) => Math.abs(Number(a) - Number(b)) <= tol;
