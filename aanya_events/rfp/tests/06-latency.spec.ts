/**
 * 06 — LATENCY UNDER PARALLEL LOAD.
 *
 * The console is never the only thing reading an event: vendors open it,
 * evaluators score it, integrations poll it. These cases fire the same reads
 * several at once, the way parallel users and systems do, and check that
 * every one comes back, within the limit, and with the same answer — a read
 * that is fast alone and slow or inconsistent under company is a defect the
 * serial cases can never see.
 */
import { expect } from "@playwright/test";

import type { ApiResponse } from "../src/api.js";
import { cfgStr } from "../src/config.js";
import { rfpCase, sla, type Ctx } from "../src/harness.js";

const q = encodeURIComponent;
const PARALLEL = Number(process.env.RFP_PARALLEL || 10);

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
};

/** The standard judgement of a burst: all OK, all in time, p95 in time, one answer. */
function judgeBurst(t: Ctx, label: string, res: ApiResponse[], limit: number, sameBy: (r: ApiResponse) => unknown) {
  const times = res.map((r) => r.ms);
  const bad = res.filter((r) => r.status !== 200);
  t.check(`Status code is 200 for all ${res.length} ${label}`, () =>
    expect(bad.map((r) => r.status), `${bad.length} of ${res.length} did not return 200`).toEqual([]),
  );
  t.check(`Responds within ${limit} ms — every one of the ${res.length} at once`, () =>
    expect(Math.max(...times), `slowest took ${Math.max(...times)} ms`).toBeLessThan(limit),
  );
  t.check(`p95 of the parallel calls is under ${limit} ms`, () => expect(p95(times), `p95 ${p95(times)} ms`).toBeLessThan(limit));
  const answers = new Set(res.filter((r) => r.status === 200).map((r) => JSON.stringify(sameBy(r))));
  t.check(`All ${res.length} return the same answer`, () => expect(answers.size, "the replies disagreed").toBe(1));
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  t.actual(
    `${res.length} at once: ${res.length - bad.length} returned 200; fastest ${Math.min(...times)} ms, ` +
      `average ${avg} ms, p95 ${p95(times)} ms, slowest ${Math.max(...times)} ms.`,
  );
}

rfpCase(
  {
    id: "6.1",
    title: `${PARALLEL} parallel reads of the published event`,
    plain: `Open the published event from ${PARALLEL} places at the same moment, as vendors, evaluators and integrations would.`,
    expected: `All ${PARALLEL} come back 200, each within the limit, with the same status and title.`,
    anchor: "2.1",
    part: "verify",
    kind: "latency",
    needs: ["published"],
  },
  async (t) => {
    const path = `/api/event_groups/${q(t.state.eventGroupUuid!)}`;
    const res = await Promise.all(Array.from({ length: PARALLEL }, () => t.api.call("GET", path)));
    judgeBurst(t, "reads", res, sla("heavy"), (r) => [r.json?.status, r.json?.title, r.json?.stages?.length]);
  },
);

rfpCase(
  {
    id: "6.2",
    title: `${PARALLEL} parallel product searches`,
    plain: `Search the catalogue ${PARALLEL} times at once with the run's own search.`,
    expected: `All ${PARALLEL} come back 200, each within the limit, with the same products.`,
    anchor: "1.2",
    part: "verify",
    kind: "latency",
    needs: ["selProducts"],
  },
  async (t) => {
    const path = `/api/products/search?query=${q(cfgStr("product_search_query"))}`;
    const res = await Promise.all(Array.from({ length: PARALLEL }, () => t.api.call("GET", path)));
    judgeBurst(t, "searches", res, sla("heavy"), (r) => (r.json?.products ?? []).map((p: any) => p.uuid));
  },
);

rfpCase(
  {
    id: "6.3",
    title: "Line items, audience and forms read together, three times over",
    plain: "Read the event's line items, its audience and its round's forms all at once, three times over — the screens a buyer opens side by side.",
    expected: "All 9 come back 200 within the limit, and each kind of read gives the same answer every time.",
    anchor: "2.5",
    part: "verify",
    kind: "latency",
    needs: ["published"],
  },
  async (t) => {
    const eg = q(t.state.eventGroupUuid!);
    const paths = [
      `/api/event_groups/${eg}/get_line_items?filters=%7B%7D&page=1&query=&prevent_pagination=false`,
      `/api/event_groups/${eg}/get_audience`,
      `/api/v1/trade/${q(t.state.tradeUuid!)}/schema?response_type=template&additional_fields=order_details`,
    ];
    const res = await Promise.all([0, 1, 2].flatMap(() => paths.map((p) => t.api.call("GET", p))));
    const limit = sla("heavy");
    const times = res.map((r) => r.ms);
    t.check("Status code is 200 for all 9", () => expect(res.filter((r) => r.status !== 200).map((r) => r.status)).toEqual([]));
    t.check(`Responds within ${limit} ms — every one of the 9 at once`, () =>
      expect(Math.max(...times), `slowest took ${Math.max(...times)} ms`).toBeLessThan(limit),
    );
    t.check(`p95 of the parallel calls is under ${limit} ms`, () => expect(p95(times)).toBeLessThan(limit));
    const kinds: Array<[string, (r: ApiResponse) => unknown]> = [
      ["line items", (r) => (r.json?.data ?? []).map((d: any) => [d.uuid, d.quantity])],
      ["audience", (r) => (r.json?.vendors ?? []).map((v: any) => v.uuid).sort()],
      ["forms", (r) => (r.json?.sheets?.forms ?? []).map((f: any) => f.uuid)],
    ];
    kinds.forEach(([name, key], k) => {
      const answers = new Set([0, 1, 2].map((i) => JSON.stringify(key(res[i * 3 + k]))));
      t.check(`The ${name} read gives the same answer all 3 times`, () => expect(answers.size).toBe(1));
    });
    t.actual(`9 reads at once: fastest ${Math.min(...times)} ms, p95 ${p95(times)} ms, slowest ${Math.max(...times)} ms.`);
  },
);
