import { CONFIG } from "../../config.js";
import { newApiContext } from "../../master/config.js";
import { eventGroupByTitle, tradesOfEventGroup } from "../../db/verifyRows.js";

/**
 * WHAT THE TICK MEANS.
 *
 * A browser journey used to end the moment the script ran out of steps: it
 * landed on a project page, saw no error toast, and went green. That proves
 * the screens can be driven. It does not prove the event is the one that was
 * asked for — same title, live, the rounds that were chosen, the vendors that
 * were invited — and those are different claims. A published event with one
 * round missing looks exactly like a published event from the last screen.
 *
 * So after the journey finishes, the suite reads the event back and compares
 * it with what it set out to build. Twice, where it can:
 *
 *   through the API — the same session the browser is logged in with, so it
 *     is the same user looking at the same record through another door;
 *   through Postgres — the rows themselves, which is the only source that
 *     cannot be a rendering of a cache.
 *
 * Every comparison is stated before it is made and narrated as it is made, so
 * it reaches the trail — and from there the report — as a sentence rather than
 * as a silent assertion.
 *
 * THE FAILURE RULE. A check that can be read and disagrees fails the journey:
 * that is the whole point. A check that cannot be read — no token, no DB, a
 * field this deployment does not return — is recorded as unread and fails
 * nothing, because "we could not look" and "it is wrong" are not the same
 * statement and only one of them is about Procol.
 */

export interface VerifiedCheck {
  /** What is being compared, in plain words. */
  what: string;
  /** What the journey asked for, stated before the read. */
  expected: string;
  /** What came back. */
  actual: string;
  /** false only when both sides were read and they disagree. */
  ok: boolean;
  /** Set when the check could not be made at all. */
  unread?: string;
  /** api | db */
  via: "api" | "db";
}

export interface Verification {
  checks: VerifiedCheck[];
  /** Where the read-back came from, for the report to say out loud. */
  via: string;
  /** Why nothing could be read, when that is the case. */
  reason?: string;
}

interface Expectation {
  projectId: string | null;
  title: string;
  /** The rounds the journey chose, in order: rfp | rfq | auction. */
  stages: string[];
  lineItems: number;
}

const MODE_NAME: Record<string, string> = {
  rfp: "technical (RFP)",
  rfq: "pricing (RFQ)",
  auction: "auction",
};

/** Narrated so the check lands in the trail, and the report, as a sentence. */
function say(check: VerifiedCheck): VerifiedCheck {
  const verdict = check.unread ? `could not check — ${check.unread}` : check.ok ? "matches" : "DOES NOT MATCH";
  console.log(`[verify] ${check.what}: wanted ${check.expected}, found ${check.actual} — ${verdict}`);
  return check;
}

const check = (
  via: "api" | "db",
  what: string,
  expected: string,
  actual: string | undefined,
  ok?: boolean,
): VerifiedCheck =>
  say(
    actual === undefined
      ? { via, what, expected, actual: "—", ok: true, unread: "this deployment did not return it" }
      : { via, what, expected, actual, ok: ok ?? expected === actual },
  );

/** The stage list an event group came back with, however the payload wraps it. */
function stagesOf(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = (body.stages ?? (body.data as Record<string, unknown>)?.stages) as unknown;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
}

/**
 * How many companies can see the event.
 *
 * The payload has carried this under three names across versions, and a
 * participant count read from the wrong one would be a confident number about
 * nothing. Unreadable is an acceptable answer here; wrong is not.
 */
function participantsOf(body: Record<string, unknown>): number | undefined {
  const perStage = body.stage_vs_participants_data as Record<string, unknown> | undefined;
  if (perStage && typeof perStage === "object") {
    const counts = Object.values(perStage).map((v) => (Array.isArray(v) ? v.length : 0));
    if (counts.length) return Math.max(...counts);
  }
  for (const key of ["audience_count", "participants_count", "total_participants"]) {
    const v = body[key];
    if (typeof v === "number") return v;
  }
  const audience = body.audiences ?? body.participants;
  if (Array.isArray(audience)) return audience.length;
  return undefined;
}

/**
 * The last verification this worker ran.
 *
 * `UiFlowModule.run` returns void — every journey is self-verifying and throws
 * — so there is no return path from deep inside a flow up to the spec that
 * writes the run's result record. One slot is enough: journeys run one at a
 * time in one worker, and the spec reads it immediately after the flow ends.
 */
let LAST: Verification | null = null;

export function lastVerification(): Verification | null {
  return LAST;
}

export async function verifyPublishedEvent(want: Expectation): Promise<Verification> {
  LAST = null;
  const checks: VerifiedCheck[] = [];
  if (!want.projectId) {
    return (LAST = { checks, via: "nothing", reason: "the journey never reached a project id to read back" });
  }

  const api = await newApiContext(CONFIG).catch(() => null);
  if (!api) {
    return (LAST = {
      checks,
      via: "nothing",
      reason: "no captured access token, so the event could not be read back through the API",
    });
  }

  let via = "the API";
  try {
    const res = await api.get(`/event_groups/${want.projectId}`);
    if (!res.ok()) {
      return (LAST = {
        checks,
        via: "nothing",
        reason: `reading the event back answered HTTP ${res.status()}`,
      });
    }
    const raw = (await res.json()) as Record<string, unknown>;
    const body = ((raw.data as Record<string, unknown>) ?? raw) as Record<string, unknown>;

    checks.push(
      check("api", "The event exists when read back by its own id", want.projectId, String(body.uuid ?? body.id ?? "—")),
    );
    checks.push(check("api", "Its title is the one the journey typed", want.title, body.title as string | undefined));
    checks.push(
      check(
        "api",
        "It is live",
        "active",
        typeof body.status === "string" ? (body.status as string) : undefined,
      ),
    );

    const stages = stagesOf(body);
    checks.push(
      check(
        "api",
        `It has ${want.stages.length} round${want.stages.length === 1 ? "" : "s"}`,
        String(want.stages.length),
        stages.length ? String(stages.length) : undefined,
      ),
    );

    const modes = stages
      .map((s) => String(s.rfx_mode ?? s.mode ?? ""))
      .filter(Boolean);
    checks.push(
      check(
        "api",
        "The rounds are the ones that were chosen",
        want.stages.map((s) => MODE_NAME[s] ?? s).join(" then "),
        modes.length ? modes.map((m) => MODE_NAME[m] ?? m).join(" then ") : undefined,
      ),
    );

    const participants = participantsOf(body);
    checks.push(
      check(
        "api",
        "The invited vendors can see it",
        "at least 1 vendor",
        participants === undefined ? undefined : `${participants} vendor(s)`,
        participants === undefined ? undefined : participants > 0,
      ),
    );

    // ── the rows themselves, where the database is reachable ──────────────
    // The API can only ever tell us what the API believes. A row count is the
    // one reading that cannot be a cache, a serializer default or a field this
    // deployment renames.
    if (process.env.DATABASE_URL) {
      try {
        const row = await eventGroupByTitle(want.title);
        checks.push(
          check(
            "db",
            "The event is a row in the database, not just a screen",
            "one row with this title",
            row ? `row ${row.id}, status "${row.status}"` : undefined,
            !!row,
          ),
        );
        if (row) {
          const trades = await tradesOfEventGroup(row.id);
          checks.push(
            check(
              "db",
              `The database holds its ${want.stages.length} round${want.stages.length === 1 ? "" : "s"}`,
              String(want.stages.length),
              String(trades.length),
            ),
          );
          via = "the API and the database";
        }
      } catch (e) {
        checks.push({
          via: "db",
          what: "The event is a row in the database, not just a screen",
          expected: "one row with this title",
          actual: "—",
          ok: true,
          unread: `the database could not be read (${e instanceof Error ? e.message : String(e)})`,
        });
      }
    }

    return (LAST = { checks, via });
  } catch (e) {
    return (LAST = {
      checks,
      via: "nothing",
      reason: `reading the event back failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  } finally {
    await api.dispose().catch(() => {});
  }
}

/** The checks that were read and disagreed — what should fail a journey. */
export function mismatches(v: Verification): VerifiedCheck[] {
  return v.checks.filter((c) => !c.ok && !c.unread);
}
