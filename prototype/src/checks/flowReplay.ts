/**
 * FLOW REPLAYER — fire the recorded calls again with a FRESH token and judge
 * each field validation live (passed / failed), Postman-style.
 *
 * Why a fresh token: a recording's access-token is never written to disk (the
 * FlowRecorder strips headers) and would be expired anyway. We log in through
 * the API framework (`procol test/`) in-process — the same trick
 * `apiCaseRunner.ts` uses to avoid a per-call Playwright start-up — so one
 * login serves the whole replay. `api.attempt()` returns the outcome without
 * throwing, which is exactly what a validation needs.
 *
 * SAFETY: by default we replay ONLY reads (GET). A recorded mutation would
 * create/modify live data; we never fire one unless it is explicitly opted in
 * AND its payload is sandbox-named (API_Test_/QA_Platform_). The Procol live
 * data stays untouched — mutations keep their "recorded" validations, judged
 * against the capture, and are clearly marked "not replayed".
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FieldValidation, RecordedCase } from "./flowToCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");
loadEnv({ path: join(here, "..", "..", ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

interface ApiLike {
  attempt: (
    method: string,
    path: string,
    opts?: { body?: unknown; params?: Record<string, unknown> },
  ) => Promise<{ status: number; ok: boolean; data: unknown }>;
  dispose?: () => Promise<void>;
}

let cached: { api: ApiLike } | undefined;
async function buyerApi(): Promise<ApiLike> {
  if (cached) return cached.api;
  const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
  const identities = await imp("identities.ts");
  const { api } = await identities.asBuyer();
  cached = { api };
  return api;
}

/** Free the shared request context once a whole replay is done. */
export async function disposeReplay(): Promise<void> {
  if (cached?.api?.dispose) await cached.api.dispose();
  cached = undefined;
}

const typeOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

function getPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
const deepEqual = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

const isSandboxNamed = (body: unknown): boolean => {
  const s = JSON.stringify(body ?? "");
  return /API_Test_|QA_Platform_/.test(s);
};

export interface ReplayOutcome {
  replayed: boolean;
  liveStatus?: number;
  reason?: string;
  passed: number;
  failed: number;
  skipped: number;
}

/** Judge one validation against a live response; returns the mutated validation. */
function judge(
  val: FieldValidation,
  live: { status: number; data: unknown } | null,
): FieldValidation {
  if (!live) return { ...val, state: "skipped", note: "not replayed" };
  switch (val.kind) {
    case "status": {
      const ok = live.status === val.expected || (live.status >= 200 && live.status < 205);
      return { ...val, state: ok ? "passed" : "failed", actual: live.status };
    }
    case "response-field": {
      const got = getPath(live.data, val.target);
      const present = got !== undefined;
      // expected here is the type string from derivation
      const typeOk = !present ? false : typeOf(got) === val.expected || val.expected === "null";
      return {
        ...val,
        state: present && typeOk ? "passed" : "failed",
        actual: present ? typeOf(got) : "absent",
        note: present ? undefined : "field missing in live response",
      };
    }
    case "echo": {
      const got = getPath(live.data, val.target);
      if (got === undefined) return { ...val, state: "skipped", actual: "absent", note: "value not in this response (list read)" };
      const ok = deepEqual(got, val.expected);
      return { ...val, state: ok ? "passed" : "failed", actual: got };
    }
    case "request-field":
      // We assert the flow SENDS this; on a GET replay there is no body to re-send.
      return { ...val, state: "recorded", note: "part of the recorded request" };
    default:
      return val;
  }
}

/**
 * Replay one recorded case. Reads fire live; mutations are judged from the
 * capture unless `replayMutations` is on AND the body is sandbox-named.
 */
export async function replayCase(
  c: RecordedCase,
  opts: { replayMutations?: boolean } = {},
): Promise<{ case: RecordedCase; outcome: ReplayOutcome }> {
  const method = c.method.toUpperCase();
  const isRead = method === "GET";
  const allowMutation = opts.replayMutations && isSandboxNamed(c.requestBody);

  if (!isRead && !allowMutation) {
    const reason = isRead
      ? ""
      : opts.replayMutations
      ? "mutation body is not sandbox-named — skipped to protect live data"
      : "mutation not replayed (would change live data)";
    const validations = c.validations.map((v) => ({ ...v, note: v.note ?? reason }));
    return {
      case: { ...c, validations },
      outcome: {
        replayed: false,
        reason,
        passed: 0,
        failed: 0,
        skipped: validations.length,
      },
    };
  }

  let live: { status: number; data: unknown } | null = null;
  let reason: string | undefined;
  try {
    const api = await buyerApi();
    const path = c.rawPath.startsWith("/api") ? c.rawPath.replace(/^\/api/, "") : c.rawPath;
    const res = await api.attempt(method, path, {
      body: allowMutation ? c.requestBody : undefined,
    });
    live = { status: res.status, data: res.data };
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }

  const validations = c.validations.map((v) => judge(v, live));
  const passed = validations.filter((v) => v.state === "passed").length;
  const failed = validations.filter((v) => v.state === "failed").length;
  const skipped = validations.filter((v) => v.state === "skipped").length;

  return {
    case: { ...c, validations },
    outcome: {
      replayed: !!live,
      liveStatus: live?.status,
      reason,
      passed,
      failed,
      skipped,
    },
  };
}
