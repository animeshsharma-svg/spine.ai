/**
 * ONE WAY TO SHOW A TEST CASE, in the browser.
 *
 * Every surface of the dashboard — the API automation tree, the Run page's
 * check rows and journey steps, the UI automation results, the test-case book,
 * the Journeys page, recorded flows, history — renders a case through this
 * file, from the display model the server builds (src/checks/caseDisplay.ts):
 *
 *   title · area · type · priority · preconditions · numbered steps · expected
 *   · actual · verdict + reason · track record
 *
 * all in plain words, and a collapsible "Details" (closed) holding the
 * technical part: ids, requests, bodies, status, error codes, file:line.
 *
 * Loaded before app.js as a plain script; exposes `window.CaseView`.
 */
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const VERDICT_CLASS = { Passed: "pass", Failed: "fail", "Couldn't tell": "unknown", "Not run": "idle" };

  /** "Passed" → a small coloured pill. */
  function verdictPill(verdict) {
    if (!verdict) return "";
    return `<span class="cv-verdict ${VERDICT_CLASS[verdict] || "idle"}">${esc(verdict)}</span>`;
  }

  /** The technical part, behind a closed "Details". */
  function detailsHtml(rows, { label = "Details" } = {}) {
    const list = (rows || []).filter((r) => r && r.value !== undefined && r.value !== null && r.value !== "");
    if (!list.length) return "";
    const body = list
      .map((r) => {
        const v =
          r.kind === "block"
            ? `<pre class="cv-pre">${esc(r.value)}</pre>`
            : r.kind === "code"
              ? `<code class="cv-code">${esc(r.value)}</code>`
              : `<span>${esc(r.value)}</span>`;
        return `<div class="cv-drow"><span class="cv-dlabel">${esc(r.label)}</span><div class="cv-dval">${v}</div></div>`;
      })
      .join("");
    return `<details class="cv-details"><summary>${esc(label)}</summary><div class="cv-dbody">${body}</div></details>`;
  }

  /** "Sourcing events › Publish · Negative · P0 · critical" */
  function metaLine(d, hideArea) {
    const bits = [hideArea ? "" : d.area, d.type, d.priority].filter(Boolean).map(esc);
    return bits.join(" · ");
  }

  /**
   * The whole case. `compact` leaves out preconditions/steps/expected until the
   * reader opens the case (a list of 200 stays scannable); `track` is the
   * track-record sentence, when known.
   */
  function card(d, { compact = false, open = false, track = "", extraTop = "", extraDetails = [], hideArea = false, noHead = false, noTrack = false } = {}) {
    if (!d) return "";
    const steps = (d.steps || []).filter(Boolean);
    const body = `
      ${d.preconditions ? `<div class="cv-sec"><span class="cv-k">Before you start</span><p>${esc(d.preconditions)}</p></div>` : ""}
      ${steps.length ? `<div class="cv-sec"><span class="cv-k">Steps</span><ol class="cv-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
      ${d.expected ? `<div class="cv-sec"><span class="cv-k">Expected</span><p>${esc(d.expected)}</p></div>` : ""}
      ${d.why ? `<div class="cv-sec cv-why"><span class="cv-k">Why it matters</span><p>${esc(d.why)}</p></div>` : ""}
      ${d.actual ? `<div class="cv-sec"><span class="cv-k">What happened</span><p>${esc(d.actual)}</p></div>` : ""}
      ${detailsHtml([...(d.details || []), ...extraDetails])}`;
    const verdictLine =
      d.verdict && d.verdict !== "Not run"
        ? `<div class="cv-reason">${verdictPill(d.verdict)} <span>${esc(d.reason || "")}</span></div>`
        : d.verdict === "Not run" && d.reason
          ? `<div class="cv-reason">${verdictPill(d.verdict)} <span>${esc(d.reason)}</span></div>`
          : "";
    const head = `
      <div class="cv-head">
        <div class="cv-title">${esc(d.title)}</div>
        <div class="cv-meta">${metaLine(d, hideArea)}${d.ref ? ` <span class="cv-ref">${esc(d.ref)}</span>` : ""}</div>
        ${track ? `<div class="cv-track" data-track-for="${esc(d.ref)}">${esc(track)}</div>` : `<div class="cv-track" data-track-for="${esc(d.ref)}" hidden></div>`}
      </div>`;
    if (noHead)
      return `<div class="cv-inline">${verdictLine}<div class="cv-meta">${metaLine(d, hideArea)}</div>${noTrack ? "" : `<div class="cv-track" data-track-for="${esc(d.ref)}" hidden></div>`}<div class="cv-body">${body}</div></div>`;
    if (compact)
      return `<details class="cv-card compact${d.verdict ? ` v-${VERDICT_CLASS[d.verdict] || "idle"}` : ""}" ${open ? "open" : ""}>
        <summary>${extraTop}${head}${verdictLine}</summary><div class="cv-body">${body}</div></details>`;
    return `<div class="cv-card${d.verdict ? ` v-${VERDICT_CLASS[d.verdict] || "idle"}` : ""}">${extraTop}${head}${verdictLine}<div class="cv-body">${body}</div></div>`;
  }

  // ── data ────────────────────────────────────────────────────────────────

  const byId = new Map();
  const featureCache = new Map();

  async function one(id) {
    if (byId.has(id)) return byId.get(id);
    try {
      const j = await (await fetch(`/api/case-display?id=${encodeURIComponent(id)}`)).json();
      byId.set(id, j.display || null);
      return j.display || null;
    } catch {
      return null;
    }
  }

  /** Any cases by id → { id: display }, cached. */
  async function many(ids) {
    const want = [...new Set(ids.filter((id) => id && !byId.has(id)))];
    for (let i = 0; i < want.length; i += 500) {
      const part = want.slice(i, i + 500);
      try {
        const j = await (
          await fetch("/api/case-display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: part }) })
        ).json();
        for (const id of part) byId.set(id, j.cases?.[id] || null);
      } catch {
        /* the list still renders, from its own words */
      }
    }
    return Object.fromEntries(ids.map((id) => [id, byId.get(id) || null]));
  }

  async function forFeature(feature) {
    if (featureCache.has(feature)) return featureCache.get(feature);
    const j = await (await fetch(`/api/case-display?set=library&feature=${encodeURIComponent(feature)}`)).json();
    const list = (j.order || Object.keys(j.cases || {})).map((id) => j.cases[id]).filter(Boolean);
    for (const d of list) byId.set(d.ref, d);
    featureCache.set(feature, list);
    return list;
  }

  /** Finished (or running) check rows → their displays, in order. */
  async function forRows(rows) {
    if (!rows || !rows.length) return [];
    try {
      const j = await (
        await fetch("/api/case-display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) })
      ).json();
      return j.items || [];
    } catch {
      return [];
    }
  }

  /** A journey's steps (with field checks) → { step, checks }[]. */
  async function forSteps(steps, made) {
    if (!steps || !steps.length) return [];
    try {
      const j = await (
        await fetch("/api/case-display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ steps, made: made || {} }) })
      ).json();
      return j.steps || [];
    } catch {
      return [];
    }
  }

  const trackCache = new Map();
  /** ids → { id: "Passed 6 of the last 13 runs · flaky" } — empty when spine.ai's database is down. */
  async function track(ids, company) {
    const want = [...new Set(ids.filter((id) => id && !trackCache.has(`${company || ""}|${id}`)))];
    for (let i = 0; i < want.length; i += 300) {
      const part = want.slice(i, i + 300);
      try {
        const j = await (await fetch(`/api/case-display/track?ids=${encodeURIComponent(part.join(","))}${company ? `&c=${company}` : ""}`)).json();
        for (const id of part) trackCache.set(`${company || ""}|${id}`, j.records?.[id]?.words || "");
      } catch {
        for (const id of part) trackCache.set(`${company || ""}|${id}`, "");
      }
    }
    return Object.fromEntries(ids.map((id) => [id, trackCache.get(`${company || ""}|${id}`) || ""]));
  }

  /** Fill every `[data-track-for]` slot under `root` with its track record. */
  async function fillTrack(root, company) {
    if (!root) return;
    const slots = [...root.querySelectorAll("[data-track-for]")];
    const ids = slots.map((s) => s.dataset.trackFor).filter(Boolean);
    if (!ids.length) return;
    const words = await track(ids, company);
    for (const s of slots) {
      const w = words[s.dataset.trackFor];
      if (w) {
        s.textContent = w;
        s.hidden = false;
        s.classList.toggle("flaky", /flaky/.test(w));
      }
    }
  }

  // ── words for ids in sentences the server did not write ────────────────

  /** Procol's 8-character reference ids (base64) and uuids, as words. */
  const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const REF = /(?<![\w@.\/+=-])(?=[A-Za-z0-9+\/]*[A-Z])(?=[A-Za-z0-9+\/]*(?:\d|=))(?:[A-Za-z0-9+\/]{8}|[A-Za-z0-9+\/]{7}=|[A-Za-z0-9+\/]{6}==)(?![\w@.+\/=-])/g;
  function scrub(text, known) {
    let s = String(text ?? "");
    const k = known || {};
    // the platform's own test records: "API_Journey_RFP_only_179…" → "the test event" (the name is in Details)
    s = s.replace(/["“](API_Journey|QA_Platform|API_Test)[^"”]*["”]/g, (_m, kind) => (kind === "API_Journey" ? "the test event" : "the test record"));
    s = s.replace(UUID, (m) => k[m] || "the record");
    s = s.replace(REF, (m) => k[m] || "the record");
    // snake_case words left in a sentence ("role: super_admin") read as words; e-mail addresses and file names stay
    s = s.replace(/(?<![\w@.\/-])([a-z]+(?:_[a-z0-9]+)+)(?![\w@.\/-])/g, (m) => m.replace(/_/g, " "));
    return s;
  }

  window.CaseView = { card, detailsHtml, verdictPill, one, many, forFeature, forRows, forSteps, track, fillTrack, scrub, esc };
})();
