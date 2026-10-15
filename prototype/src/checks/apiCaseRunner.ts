import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Run the API framework's contract cases IN PROCESS.
 *
 * `procol test/` already implements these cases and judges them with its own
 * Oracle. Spawning `npx playwright test` for one case would cost a browserless
 * runner start-up, a fresh login and a full fixture build every time — about a
 * minute for a single HTTP call. Importing the same modules by `file://` URL
 * (the directory name has a space in it) reuses one login and one set of
 * fixtures across every case a person picks, which is what makes picking a
 * case by hand feel like pressing a button rather than starting a build.
 *
 * The verdict is the framework's own `judgeContractCase`, not a re-implementation.
 * There is exactly one Oracle, and it stays deterministic — an LLM never
 * decides pass or fail.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");

loadEnv({ path: join(here, "..", "..", ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

export interface ApiCaseOutcome {
  id: string;
  title: string;
  area: string;
  status: "passed" | "failed" | "skipped";
  /** The Oracle's classification: pass, product_defect, automation_defect… */
  verdict?: string;
  severity?: string;
  method?: string;
  path?: string;
  httpStatus?: number;
  expectedStatus?: number;
  message?: string;
  reason?: string;
  durationMs: number;
}

type Mods = {
  context: any;
  identities: any;
  config: any;
  contract: any;
  oracle: any;
  evidence: any;
  findings: any;
};

let mods: Mods | undefined;
async function load(): Promise<Mods> {
  if (mods) return mods;
  const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
  const [context, identities, config, contract, oracle, evidence, findings] = await Promise.all([
    imp("context.ts"),
    imp("identities.ts"),
    imp("config.ts"),
    imp("flows/eventsContract.ts"),
    imp("oracle/oracle.ts"),
    imp("oracle/evidence.ts"),
    imp("oracle/findings.ts"),
  ]);
  mods = { context, identities, config, contract, oracle, evidence, findings };
  return mods;
}

/**
 * Login + fixtures, built once and reused.
 *
 * The fixtures create several sandbox draft events (`API_Test_Contract_*`), so
 * rebuilding them per case would litter the environment as well as being slow.
 * They are held for a session's worth of time and then rebuilt, because a draft
 * that has been sitting around can be mutated by an earlier case.
 */
const SESSION_TTL_MS = 20 * 60 * 1000;
let session: { at: number; companyId: number; buyer: any; fx: any; dispose?: () => Promise<void> } | null = null;

/**
 * The buyer, signed in the way the journeys sign in: the company's saved
 * web-console session (procol test context.ts), so no one-time code is needed.
 * A one-time code was the only way before, and PROCOL DEMO's buyer has none —
 * every case run from the dashboard's test-case table ended "No OTP for role
 * buyer". The code login stays as the fallback for a client with no saved session.
 */
async function signInBuyer(m: Mods, companyId: number, onLog?: (line: string) => void) {
  try {
    const ctx = await m.context.resolveClientContext(companyId);
    return { buyer: { api: ctx.buyerApi }, evaluatorUuid: String(ctx.evaluatorUuid ?? ""), vendorCompanyUuid: ctx.catalog?.vendorBidCompanyUuid as string | undefined, dispose: ctx.dispose as () => Promise<void> };
  } catch (e) {
    onLog?.(`no saved session to sign the buyer in with (${String((e as Error).message).split("\n")[0].slice(0, 140)}) — using a one-time code instead`);
    const buyer = await m.identities.asBuyer();
    const evaluator = await m.identities.asEvaluator();
    return { buyer, evaluatorUuid: String(evaluator.login.userUuid ?? ""), vendorCompanyUuid: undefined, dispose: undefined };
  }
}

async function openSession(onLog?: (line: string) => void, companyId?: number) {
  const m = await load();
  const cid = Number(companyId) || m.context.activeCompanyId();
  if (session && session.companyId === cid && Date.now() - session.at < SESSION_TTL_MS) return session;
  await session?.dispose?.().catch(() => {});
  session = null;
  onLog?.("logging in as the buyer…");
  const { buyer, evaluatorUuid, vendorCompanyUuid, dispose } = await signInBuyer(m, cid, onLog);
  let vendor: any;
  try {
    vendor = await m.identities.asVendorEmail(m.config.CONFIG.inputs.vendorEmail);
  } catch {
    vendor = undefined; // the vendor-side probe self-skips without one
  }
  onLog?.("building the shared fixtures (draft, staged, active, auction events)…");
  const fx = await m.contract.buildContractFixtures(buyer.api, vendorCompanyUuid || m.config.CONFIG.catalog.vendorBidCompanyUuid, evaluatorUuid, vendor);
  session = { at: Date.now(), companyId: cid, buyer, fx, dispose };
  return session;
}

/** Drop the cached login and fixtures — the next run builds fresh ones. */
export function resetApiSession(): void {
  session = null;
}

/** The contract cases for the events module, by id. */
export async function apiCaseIndex(): Promise<Map<string, any>> {
  const m = await load();
  const cases = m.contract.loadContractCases().filter((c: any) => c.module === "events");
  return new Map(cases.map((c: any) => [c.id, c]));
}

const STOP = new Set(["the", "and", "with", "must", "from", "into", "that", "this", "then", "after", "when", "their", "them", "its", "for", "not", "are", "was", "has", "have", "can", "still", "try", "please"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}

export interface ApiCaseMatch {
  id: string;
  title: string;
  area: string;
  score: number;
}

/**
 * The closest real contract case to a free-text instruction, scored by how
 * much of the case's own title shows up in the words typed plus a bonus when
 * one of its tags is present. A real run against the live API is only worth
 * doing when the match is strong — a wrong match here does not just mislabel
 * a demo row, it fires a real request against UAT for the wrong case — so the
 * bar is deliberately high and a weak match is reported as "no match" rather
 * than guessed.
 */
export async function matchApiCase(text: string): Promise<ApiCaseMatch | undefined> {
  const index = await apiCaseIndex();
  const t = tokens(text);
  let best: ApiCaseMatch | undefined;
  for (const [id, c] of index) {
    const title = tokens(c.title);
    let hit = 0;
    for (const w of title) if (t.has(w)) hit++;
    const overlap = title.size ? hit / title.size : 0;
    const tagHit = (c.tags ?? []).some((tag: string) => t.has(tag.toLowerCase()));
    const score = overlap * 10 + (tagHit ? 1.5 : 0);
    if (score >= 6 && (!best || score > best.score)) best = { id, title: c.title, area: c.area, score };
  }
  return best;
}

/**
 * Run the given `BE-x.y` cases in order, reporting each as it finishes.
 *
 * Cases run sequentially and share fixtures, exactly as the Playwright spec
 * does (`workers: 1`, `fullyParallel: false`) — several of them mutate the same
 * draft event, so running them at once would have them fight each other.
 */
export async function runApiCases(
  ids: string[],
  onResult: (r: ApiCaseOutcome) => void,
  onLog?: (line: string) => void,
  companyId?: number,
): Promise<ApiCaseOutcome[]> {
  const m = await load();
  const index = await apiCaseIndex();
  const out: ApiCaseOutcome[] = [];
  const { buyer, fx } = await openSession(onLog, companyId);

  for (const id of ids) {
    const started = Date.now();
    const c = index.get(id);
    const emit = (r: ApiCaseOutcome) => {
      out.push(r);
      onResult(r);
    };
    if (!c) {
      emit({ id, title: id, area: "", status: "skipped", reason: "no such contract case", durationMs: 0 });
      continue;
    }
    const runner = m.contract.CASE_RUNNERS[id];
    if (!runner) {
      emit({
        id,
        title: c.title,
        area: c.area,
        status: "skipped",
        reason: m.contract.SKIP_REASONS[id] ?? "not automated in this pass",
        durationMs: Date.now() - started,
      });
      continue;
    }

    try {
      const attempt = await runner(buyer.api, fx);
      if ("skip" in attempt) {
        emit({ id, title: c.title, area: c.area, status: "skipped", reason: attempt.skip, durationMs: Date.now() - started });
        continue;
      }

      const flowKey = `events.contract.${id}`;
      const shapedPath = m.evidence.routeShape(attempt.path) || attempt.path;
      const verdict = m.oracle.judgeContractCase({
        flowKey,
        title: c.title,
        severity: c.severity,
        method: attempt.method,
        path: shapedPath,
        url: attempt.path,
        requestBody: attempt.requestBody,
        expectedStatus: c.expected.status,
        expectedErrorCode: m.contract.extractExpectedErrorCode(c),
        actualStatus: attempt.raw.status,
        actualErrorCode: attempt.raw.errorCode,
        actualErrorMessage: attempt.raw.errorMessage,
        actualBody: attempt.raw.data,
        contractCheck: m.contract.CONTRACT_CHECKS[id],
        anyRejectionAcceptable: m.contract.ANY_REJECTION_OK.has(id),
        reproduction: [
          `${id}: ${c.title}`,
          `source: ${c.source.join(", ")}`,
          `documented: ${c.expected.status} — ${c.expected.shape}`,
          `oracle: ${c.oracle.kind} — ${c.oracle.detail}`,
        ],
      });

      // Record it the same way the spec does, so a defect found from the
      // dashboard lands in the same findings store as one found from a suite
      // run and groups with it.
      const evidence = m.evidence.newEvidence(flowKey);
      evidence.notes.push(...verdict.reproduction);
      if (verdict.kind !== "pass") {
        const bodyText =
          typeof attempt.raw.data === "string" ? attempt.raw.data : JSON.stringify(attempt.raw.data ?? "");
        evidence.httpFailures.push({
          method: attempt.method,
          url: shapedPath,
          path: shapedPath,
          status: attempt.raw.status,
          requestBody: attempt.requestBody == null ? null : JSON.stringify(attempt.requestBody).slice(0, 4000),
          responseBody: bodyText.slice(0, 1000),
          at: new Date().toISOString(),
        });
      }
      m.findings.recordFinding(evidence, verdict);

      emit({
        id,
        title: c.title,
        area: c.area,
        status: verdict.kind === "pass" ? "passed" : "failed",
        verdict: verdict.kind,
        severity: verdict.severity,
        method: attempt.method,
        path: shapedPath,
        httpStatus: attempt.raw.status,
        expectedStatus: c.expected.status,
        message: verdict.kind === "pass" ? undefined : `${verdict.title} — ${verdict.rationale}`,
        durationMs: Date.now() - started,
      });
    } catch (err: any) {
      // A thrown runner is a harness problem, not a product observation. Say
      // so rather than colouring it as a failed contract.
      emit({
        id,
        title: c.title,
        area: c.area,
        status: "failed",
        verdict: "automation_defect",
        message: `the case runner threw: ${err?.message ?? err}`,
        durationMs: Date.now() - started,
      });
    }
  }
  return out;
}
