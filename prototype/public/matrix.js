/**
 * Bidding scenarios (the bidding matrix).
 *
 * Several QA test vendors bid on one event; the buyer bids for some of them
 * (on-behalf / surrogate bids); clocks are pushed past the end, into the extra
 * closing time, extended; awards are split. Each scenario is a short story of
 * numbered steps, and some steps are "probes" — a suspected backend problem
 * found by reading the code, tried for real.
 *
 *   #/matrix                       newest result per scenario, for the current client
 *   #/matrix/<scenario>            … with that scenario's steps open
 *   #/matrix/run/<file>[/<scen.>]  one saved run instead of the newest results
 *
 * Data: /api/matrix/latest?c=, /api/matrix/combos, /api/matrix/runs, /api/matrix/run?file=
 * Live: /api/matrix/stream?c=&combos= (SSE: line, step, done, error) — only
 * after the reader confirms; a run takes minutes and creates test events.
 *
 * Loaded after app.js; uses CaseView for pills, cards and closed Details.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#mx-root");

  // ── words ─────────────────────────────────────────────────────────────

  const VERDICT = { pass: "Passed", fail: "Failed", defect: "Failed", inconclusive: "Couldn't tell", skipped: "Not run" };
  const TONE = { pass: "good", fail: "bad", defect: "bad", inconclusive: "warn", skipped: "idle" };

  let override = null;
  function clientId() {
    if (override) return override;
    const n = Number(q("#client")?.value);
    if (n > 0) return n;
    try {
      return typeof currentClient === "number" && currentClient ? currentClient : 198678;
    } catch {
      return 198678;
    }
  }

  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  const mins = (ms) => {
    const m = Math.round((ms || 0) / 60000);
    return m < 1 ? "under a minute" : m === 1 ? "about a minute" : `about ${m} minutes`;
  };

  /**
   * A sentence written by the runner, as a person would say it: reference ids,
   * error codes, HTTP statuses and file:line go — they are in Details.
   */
  function plain(text) {
    let s = String(text ?? "");
    s = s.replace(/\bDraft [A-Za-z0-9+\/=]{6,} was created\b/g, "The draft event was created");
    s = s.replace(/\bProposal [A-Za-z0-9+\/=]{6,} was opened\b/g, "An award proposal was opened");
    s = s.replace(/\bTechnical response [A-Za-z0-9+\/=]{6,} was opened\b/g, "A technical response was opened");
    s = s.replace(/\bBid [A-Za-z0-9+\/=]{6,} was opened\b/g, "A bid was opened");
    s = s.replace(/ was attached as \S+?\./g, " was attached.");
    s = s.replace(/["“]QA_Platform_Matrix_[^"”]*["”] is live/g, "The test event is live");
    // the round clocks
    s = s.replace(/\bthe RFQ window\b/g, "the pricing round's clock").replace(/\bthe RFP window\b/g, "the technical round's clock").replace(/\bthe AUCTION window\b/g, "the auction's clock");
    s = s.replace(/: bid end (\d\d:\d\d(?::\d\d)?), extra closing time (\d\d:\d\d(?::\d\d)?)/g, ": bidding now ends at $1, extra closing time until $2");
    // codes, statuses and source locations
    s = s.replace(/\s*\((?:[\w/.-]+\.rb:[\d-]+)\)/g, "");
    s = s.replace(/\s*\((?:HTTP \d+[^)]*|code [^)]*)\)/g, "");
    s = s.replace(/\s*\(\d+(?:\s*\/\s*[\w]+)*\)/g, "");
    s = s.replace(/\s*\((?:ok \/ )?\d+(?: \/ \d+)*\)/g, "");
    s = s.replace(/\s+guard\b/g, " check");
    s = s.replace(/\b(refused|refuses|refuse|refusing) \d{2,4}\b/g, "$1");
    s = s.replace(/, \d{2,4}\)/g, ")");
    s = s.replace(/\b(?:the )?\d{3,4} check\b/gi, (m) => (/^The/.test(m) ? "The other check" : /^the/.test(m) ? "the other check" : "other check"));
    s = s.replace(/Suspected defect CONFIRMED — /g, "The suspected backend problem showed up: ");
    s = s.replace(/Suspected defect not confirmed — /g, "The suspected backend problem did not show up: ");
    s = s.replace(/^Could not tell — /g, "Could not tell: ");
    s = s.replace(/\s+([.,;:])/g, "$1");
    return CV.scrub(s);
  }

  /** A capital first letter and a full stop, for a sentence shown on its own. */
  function sentence(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const c = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?…”)]$/.test(c) ? c : `${c}.`;
  }

  /**
   * What a step expected, in words. A probe step's own text sometimes only says
   * what it tries ("the bid is submitted"); then the probe's rule is the expectation.
   */
  function should(s) {
    if (!s) return "";
    if (!s.probe || /refus|should|must|not allowed/i.test(s.expected || "")) return sentence(plain(s.expected));
    return /a defect if refused/.test(s.expect || "") ? "The app should allow this." : "The app should refuse this.";
  }

  /** "QA vendor 2" → "Vendor 2"; the buyer's on-behalf calls say so. */
  function actorWords(step) {
    const a = String(step.actor || "");
    const path = step.call?.path || "";
    if (/^buyer$/i.test(a)) {
      const onBehalf = /surrogate|\/bids\/template_input|^\/v1\/bids/.test(path);
      if (onBehalf) {
        const m = String(step.title || "").match(/QA vendor (\d+)/i);
        return { label: m ? `Buyer, for vendor ${m[1]}` : "Buyer, on behalf of a vendor", cls: "onbehalf" };
      }
      return { label: "Buyer", cls: "buyer" };
    }
    const m = a.match(/vendor (\d+)/i);
    return { label: m ? `Vendor ${m[1]}` : a, cls: "vendor" };
  }

  /** The runner's notes, as a kind of thing that happened plus the sentence. */
  function noteHtml(n) {
    const kind = /moved the .* window|clock/i.test(n)
      ? "Clock shift"
      : /fresh session|session/i.test(n)
        ? "Session reopened"
        : /reopen/i.test(n)
          ? "Round reopened"
          : /misleading/i.test(n)
            ? "Misleading message"
            : "Note";
    return `<li><b>${esc(kind)}:</b> ${esc(plain(n))}</li>`;
  }

  // ── data ──────────────────────────────────────────────────────────────

  async function getJson(url) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  let combosCache = null;
  async function combos() {
    if (!combosCache) combosCache = await getJson("/api/matrix/combos").catch(() => []);
    return combosCache;
  }

  /** route → { file?, combo? } */
  function parse() {
    const m = location.hash.match(/^#\/matrix(?:\/(.*))?$/);
    if (!m) return null;
    const parts = (m[1] || "").split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "run") return { file: parts[1] || "", combo: parts[2] || "" };
    return { combo: parts[0] || "" };
  }
  const hashFor = (file, combo) => (file ? `#/matrix/run/${encodeURIComponent(file)}${combo ? `/${encodeURIComponent(combo)}` : ""}` : `#/matrix${combo ? `/${encodeURIComponent(combo)}` : ""}`);

  // ── the page ──────────────────────────────────────────────────────────

  let shown = null; // { key, data, all, runs }
  let live = null; // { es, company, combos, log[], steps{} }

  async function route() {
    const r = parse();
    if (!r) return;
    const box = root();
    if (!box) return;
    const c = clientId();
    const key = `${c}|${r.file || ""}`;
    if (shown?.key === key) {
      // same data: only the open scenario changed
      showScenario(r.combo, r.file);
      return;
    }
    box.innerHTML = `<div class="loading">Loading the bidding scenarios…</div>`;
    // on a fresh page load the header's client list is still arriving: wait for it (briefly) so the client is the app's
    for (let i = 0; i < 30 && !override && !(Number(q("#client")?.value) > 0); i++) await new Promise((res) => setTimeout(res, 100));
    if (clientId() !== c) {
      shown = null;
      return route();
    }
    try {
      const [data, all, runs] = await Promise.all([
        r.file ? getJson(`/api/matrix/run?file=${encodeURIComponent(r.file)}`) : getJson(`/api/matrix/latest?c=${c}`),
        combos(),
        getJson("/api/matrix/runs").catch(() => []),
      ]);
      if (parse()?.file !== r.file || clientId() !== c) return; // the reader moved on
      shown = { key, data, all, runs, company: c };
      render(r);
    } catch (e) {
      box.innerHTML = `<div class="sx-banner bad"><b>Could not load the bidding scenarios:</b> ${esc(e.message)}</div>`;
    }
  }

  function render(r) {
    const box = root();
    const { data, all, runs, company } = shown;
    const none = !data || data.none || !(data.combos || []).length;
    const name = data?.company || (q("#client")?.selectedOptions?.[0]?.textContent || "").replace(/\s*\(\d+\).*$/, "") || `company ${company}`;
    const forClient = all.filter((x) => (x.clients || []).includes(company) && x.id !== "MX");

    box.innerHTML =
      clientSwitcher(runs, company) +
      (r.file ? `<div class="sx-banner info">Showing an earlier run from <b>${esc(when(data?.startedAt))}</b>. <a href="${hashFor("", "")}">Back to the newest results</a></div>` : "") +
      (none
        ? `<div class="sx-card"><h3 class="sx-h3">No bidding scenarios have run for ${esc(name)} yet</h3><p class="sx-p">${
            forClient.length
              ? `${forClient.length} scenario${forClient.length === 1 ? " is" : "s are"} written for this client. Run them below — each one creates its own test event.`
              : "No scenario is written for this client yet; the scenarios cover PROCOL DEMO and Demo Account 2."
          }</p></div>`
        : summaryHtml(data, name, !!r.file) + vendorsHtml(data.vendors || []) + gridHtml(data, forClient, !!r.file) + `<div id="mx-scenario"></div>` + probesHtml(data)) +
      historyHtml(runs, company, r.file) +
      (r.file ? "" : liveHtml(forClient, data, company, name)); // live runs only from the newest-results page, for the app's client

    for (const b of box.querySelectorAll("[data-client]"))
      b.addEventListener("click", () => switchClient(Number(b.dataset.client)));
    for (const b of box.querySelectorAll("[data-open]"))
      b.addEventListener("click", () => {
        const cur = parse();
        location.hash = hashFor(cur?.file, cur?.combo === b.dataset.open ? "" : b.dataset.open);
      });
    wireLive(company, name);
    if (live && live.company === company) paintLive();
    showScenario(r.combo, r.file);
  }

  // ── client switcher: the clients that have saved results ───────────────
  function clientSwitcher(runs, company) {
    const names = { 198678: "PROCOL DEMO", 32461: "Demo Account 2", 47053: "GMMCO" };
    for (const o of q("#client")?.options || []) if (Number(o.value) > 0) names[o.value] = o.textContent.replace(/\s*\(\d+\).*$/, "");
    const ids = [...new Set([...runs.map((r) => r.companyId), company])].filter(Boolean);
    if (ids.length < 2) return "";
    return (
      `<div class="sx-tabs" role="tablist" aria-label="Client">` +
      ids.map((id) => `<button type="button" class="chip${id === company ? " active" : ""}" data-client="${id}" role="tab" aria-selected="${id === company}">${esc(names[id] || `Company ${id}`)}</button>`).join("") +
      `</div>`
    );
  }

  function switchClient(id) {
    const sel = q("#client");
    if (location.hash !== "#/matrix") history.replaceState(null, "", "#/matrix");
    if (sel && [...sel.options].some((o) => Number(o.value) === id)) {
      sel.value = String(id);
      sel.dispatchEvent(new Event("change")); // every screen follows the app's client; our listener reloads this one
      return;
    }
    override = id; // a client with saved results that the header list does not carry
    shown = null;
    route();
  }

  // ── the top line ──────────────────────────────────────────────────────
  function summaryHtml(data, name, isRun) {
    const list = data.combos || [];
    const count = (v) => list.filter((c) => (v === "fail" ? c.verdict === "fail" || c.verdict === "defect" : c.verdict === v)).length;
    const conf = (data.probes || []).filter((p) => p.confirmed === true).length;
    const steps = list.reduce((n, c) => n + (c.steps || []).length, 0);
    const stat = (n, label, tone) => `<div class="sx-stat${tone ? ` mx-${tone}` : ""}"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
    const newest = list.map((c) => c.startedAt).filter(Boolean).sort().pop() || data.startedAt;
    return (
      (isRun
        ? `<p class="sx-p">This run played ${esc(list.length)} bidding scenario${list.length === 1 ? "" : "s"} for <b>${esc(name)}</b>, starting ${esc(when(data.startedAt))}. `
        : `<p class="sx-p">The newest result of every bidding scenario run for <b>${esc(name)}</b>${newest ? `, last run ${esc(when(newest))}` : ""}. `) +
      `Each scenario creates its own test event, invites the QA test vendors, and plays the steps in order — vendors bidding from their own portal, the buyer bidding for them, clocks running out, awards being split.</p>` +
      `<div class="sx-stats">${stat(list.length, "scenarios")}${stat(count("pass"), "passed", "good")}${stat(count("fail"), "failed", count("fail") ? "bad" : "")}${count("inconclusive") ? stat(count("inconclusive"), "couldn't tell", "warn") : ""}${stat(conf, "backend problems confirmed", conf ? "bad" : "")}${stat(steps, "steps checked")}</div>`
    );
  }

  // ── the QA test vendors ───────────────────────────────────────────────
  function vendorsHtml(vendors) {
    if (!vendors.length) return "";
    return (
      `<div class="sx-card"><h3 class="sx-h3">Who bids</h3>` +
      `<p class="sx-sub">The buyer is this client's QA login. The vendors are test companies made by spine.ai for these scenarios — no real supplier is invited or e-mailed.</p>` +
      `<div class="sx-chips"><span class="sx-chip buyer">Buyer</span>${vendors.map((v) => `<span class="sx-chip vendor">Vendor ${esc(v.n)} <span class="sx-muted">· test vendor</span></span>`).join("")}</div>` +
      CV.detailsHtml(vendors.map((v) => ({ label: `Vendor ${v.n}`, value: `${v.name} · ${v.email}`, kind: "code" }))) +
      `</div>`
    );
  }

  // ── the grid ──────────────────────────────────────────────────────────
  function gridHtml(data, forClient, isRun) {
    const ran = data.combos || [];
    const ids = new Set(ran.map((c) => c.id));
    const notRun = isRun ? [] : forClient.filter((x) => !ids.has(x.id));
    const tile = (c) => {
      const v = c.verdict;
      const n = c.counts || {};
      const total = (c.steps || []).length;
      const bad = (n.fail || 0) + (n.defect || 0);
      const line =
        bad
          ? `${bad} of ${total} step${total === 1 ? "" : "s"} failed`
          : n.inconclusive
            ? `${n.inconclusive} step${n.inconclusive === 1 ? "" : "s"} couldn't tell`
            : `All ${total} steps passed`;
      const probes = (c.steps || []).filter((s) => s.probe?.confirmed === true).length;
      return (
        `<div class="mx-tile v-${esc(TONE[v] || "idle")}" data-tile="${esc(c.id)}" title="${esc(c.why || "")}">` +
        `<button type="button" class="mx-tile-btn" data-open="${esc(c.id)}" aria-controls="mx-scenario">` +
        `<span class="mx-tile-top">${CV.verdictPill(VERDICT[v] || "Not run")}<span class="cv-ref">${esc(c.id)}</span></span>` +
        `<span class="mx-tile-title">${esc(plain(c.title))}</span>` +
        `<span class="mx-tile-line">${esc(line)}${probes ? ` · <b class="mx-badtext">${probes} backend problem${probes === 1 ? "" : "s"}</b>` : ""}${(c.notes || []).length ? ` · ${(c.notes || []).length} note${c.notes.length === 1 ? "" : "s"}` : ""}</span>` +
        `</button>` +
        (c.why ? `<details class="mx-why"><summary>Why it matters</summary><p>${esc(plain(c.why))}</p></details>` : "") +
        `</div>`
      );
    };
    const idle = (x) =>
      `<div class="mx-tile v-idle" title="${esc(x.why || "")}"><div class="mx-tile-btn mx-static"><span class="mx-tile-top">${CV.verdictPill("Not run")}<span class="cv-ref">${esc(x.id)}</span></span>` +
      `<span class="mx-tile-title">${esc(plain(x.title))}</span><span class="mx-tile-line">Not run for this client yet</span></div>` +
      (x.why ? `<details class="mx-why"><summary>Why it matters</summary><p>${esc(plain(x.why))}</p></details>` : "") +
      `</div>`;
    return (
      `<div class="col-head" style="margin-top:14px"><h2>Scenarios</h2><span class="hint">open one to see its steps in order</span></div>` +
      `<div class="mx-grid">${ran.map(tile).join("")}${notRun.map(idle).join("")}</div>`
    );
  }

  // ── one scenario's steps ──────────────────────────────────────────────
  function showScenario(id, file) {
    const slot = q("#mx-scenario");
    if (!slot) return;
    for (const t of document.querySelectorAll(".mx-tile")) t.classList.toggle("open", !!id && t.dataset.tile === id);
    const c = (shown?.data?.combos || []).find((x) => x.id === id);
    if (!id || !c) {
      slot.innerHTML = "";
      return;
    }
    const n = c.counts || {};
    const steps = c.steps || [];
    slot.innerHTML =
      `<div class="sx-card mx-scen ${TONE[c.verdict] || ""}">` +
      `<div class="sx-row"><h3 class="sx-h3 sx-grow">${esc(plain(c.title))}</h3>${CV.verdictPill(VERDICT[c.verdict] || "Not run")}</div>` +
      `<p class="sx-sub">${esc(steps.length)} steps · ${esc(n.pass || 0)} passed${n.fail || n.defect ? ` · ${(n.fail || 0) + (n.defect || 0)} failed` : ""}${n.inconclusive ? ` · ${n.inconclusive} couldn't tell` : ""}${n.skipped ? ` · ${n.skipped} not run` : ""} · ran ${esc(when(c.startedAt))} for ${esc(mins(c.durationMs))}</p>` +
      (c.why ? `<div class="cv-sec cv-why"><span class="cv-k">Why it matters</span><p>${esc(plain(c.why))}</p></div>` : "") +
      ((c.notes || []).length ? `<div class="cv-sec"><span class="cv-k">Worth knowing</span><ul class="sx-list">${c.notes.map(noteHtml).join("")}</ul></div>` : "") +
      `<ol class="mx-steps">${steps.map(stepHtml).join("")}</ol>` +
      CV.detailsHtml([
        { label: "Scenario", value: c.id, kind: "code" },
        { label: "Test event", value: c.eventGroupUuid, kind: "code" },
        { label: "Company", value: `${c.company} (${c.companyId})` },
        { label: "Started", value: c.startedAt },
        { label: "Took", value: `${Math.round((c.durationMs || 0) / 1000)} s` },
        { label: "Raw notes", value: (c.notes || []).join("\n"), kind: "block" },
      ]) +
      `<div class="sx-btnrow"><button type="button" class="sx-back" data-close>Close this scenario</button></div>` +
      `</div>`;
    slot.querySelector("[data-close]")?.addEventListener("click", () => (location.hash = hashFor(file, "")));
    // bring it into view, under the grid
    // (only the views pane scrolls — scrollIntoView would also push the whole page up on a phone)
    setTimeout(() => {
      const pane = slot.closest(".views");
      if (pane) pane.scrollTo({ top: slot.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 8, behavior: "smooth" });
    }, 0);
  }

  function stepHtml(s) {
    const who = actorWords(s);
    const verdict = VERDICT[s.verdict] || "Not run";
    const reason =
      s.probe
        ? s.probe.confirmed === true
          ? "A backend problem — the app allowed something it should refuse."
          : s.probe.confirmed === false
            ? "The suspected backend problem did not show up."
            : "Could not tell whether the suspected problem is real."
        : s.verdict === "defect"
          ? "The server crashed with an unexplained error — always a defect."
          : "";
    const body = s.call?.body !== undefined ? JSON.stringify(s.call.body, null, 2) : "";
    const d = {
      title: plain(s.title),
      verdict,
      reason,
      expected: should(s),
      actual: sentence(plain(s.actual)),
      details: [
        { label: "Request", value: s.call ? `${s.call.method} ${s.call.path}` : "no request — read from an earlier answer", kind: "code" },
        { label: "Status", value: s.status },
        { label: "App code", value: s.code, kind: "code" },
        { label: "App message", value: s.message },
        { label: "Rule", value: s.expect, kind: "code" },
        { label: "Backend problem", value: s.probe ? `${s.probe.id} — ${s.probe.confirmed === true ? "confirmed" : s.probe.confirmed === false ? "not confirmed" : "couldn't tell"}` : "", kind: "code" },
        { label: "Expected, as written", value: should(s) !== sentence(plain(s.expected)) ? s.expected : "" },
        { label: "Who", value: s.actor },
        { label: "Tries", value: s.tries && s.tries > 1 ? s.tries : "" },
        { label: "Took", value: s.ms ? `${s.ms} ms` : "" },
        { label: "At", value: s.at },
        { label: "Body sent", value: body.length > 6000 ? `${body.slice(0, 6000)}\n… (${body.length - 6000} more characters)` : body, kind: "block" },
      ],
    };
    const top = `<div class="mx-stephead"><span class="mx-n">${esc(s.n)}</span><span class="sx-chip ${who.cls}">${esc(who.label)}</span>${s.probe ? `<span class="sx-badge ${s.probe.confirmed === true ? "bad" : s.probe.confirmed === false ? "good" : "warn"}">backend probe</span>` : ""}</div>`;
    return `<li>${CV.card(d, { extraTop: top, hideArea: true })}</li>`;
  }

  // ── backend problems ──────────────────────────────────────────────────
  function probesHtml(data) {
    const probes = data.probes || [];
    if (!probes.length) return "";
    const stepOf = (p) => (data.combos || []).find((c) => c.id === p.combo)?.steps?.find((s) => s.probe?.id === p.id);
    const comboOf = (p) => (data.combos || []).find((c) => c.id === p.combo);
    const order = (p) => (p.confirmed === true ? 0 : p.confirmed === false ? 2 : 1);
    const word = (p) => (p.confirmed === true ? ["Confirmed", "bad"] : p.confirmed === false ? ["Not confirmed", "good"] : ["Couldn't tell", "warn"]);
    const reply = (p) => sentence(plain(p.reply || ""));
    const rows = [...probes]
      .sort((a, b) => order(a) - order(b))
      .map((p) => {
        const s = stepOf(p);
        const c = comboOf(p);
        const [w, tone] = word(p);
        return (
          `<div class="sx-card ${tone}">` +
          `<div class="sx-row"><b class="sx-grow">${esc(plain(p.title))}</b><span class="sx-badge ${tone}">${w}</span></div>` +
          (s ? `<p class="sx-p"><span class="sx-muted">What should happen:</span> ${esc(should(s))}</p>` : "") +
          `<p class="sx-p"><span class="sx-muted">The app's reply:</span> ${esc(reply(p))}</p>` +
          (c ? `<p class="sx-sub">Found in: <a href="${hashFor(parse()?.file, c.id)}">${esc(plain(c.title))}</a>${s ? `, step ${esc(s.n)}` : ""}</p>` : "") +
          CV.detailsHtml([
            { label: "Problem id", value: p.id, kind: "code" },
            { label: "Request", value: s?.call ? `${s.call.method} ${s.call.path}` : "", kind: "code" },
            { label: "Status", value: s?.status },
            { label: "App code", value: s?.code, kind: "code" },
            { label: "App message", value: s?.message },
            { label: "Reply as recorded", value: p.reply },
            { label: "Scenario", value: p.combo, kind: "code" },
          ]) +
          `</div>`
        );
      })
      .join("");
    const conf = probes.filter((p) => p.confirmed === true).length;
    return (
      `<div class="col-head" style="margin-top:16px"><h2>Backend problems found</h2><span class="hint">${conf} of ${probes.length} confirmed</span></div>` +
      `<p class="sx-sub">Each one is a gap seen in the backend's code and then tried for real. <b>Confirmed</b> means the app allowed it; <b>Not confirmed</b> means the app refused it, as it should; <b>Couldn't tell</b> is never counted as fine.</p>` +
      rows
    );
  }

  // ── earlier runs ──────────────────────────────────────────────────────
  function historyHtml(runs, company, file) {
    const mine = runs.filter((r) => r.companyId === company);
    if (!mine.length) return "";
    const vw = (v) =>
      Object.entries(v || {})
        .map(([k, n]) => `${n} ${(VERDICT[k] || k).toLowerCase()}`)
        .join(", ");
    return (
      `<details class="sx-group" style="margin-top:16px"${file ? " open" : ""}><summary>Earlier runs <span class="sx-muted">(${mine.length})</span></summary><div class="sx-group-body">` +
      `<table class="sx-table"><thead><tr><th>When</th><th>Scenarios</th><th>Result</th></tr></thead><tbody>` +
      mine
        .map(
          (r) =>
            `<tr class="sx-click${r.file === file ? " mx-cur" : ""}" data-file="${esc(r.file)}"><td data-k="When">${esc(when(r.startedAt))}</td><td data-k="Scenarios">${esc(r.combos)}</td><td data-k="Result">${esc(vw(r.verdicts))}</td></tr>`,
        )
        .join("") +
      `</tbody></table></div></details>`
    );
  }
  document.addEventListener("click", (e) => {
    const tr = e.target.closest?.("#mx-root tr[data-file]");
    if (tr) location.hash = hashFor(tr.dataset.file, "");
  });

  // ── live run (secondary) ──────────────────────────────────────────────
  function liveHtml(forClient, data, company, name) {
    if (!forClient.length) return "";
    const ran = new Map((data?.combos || []).map((c) => [c.id, c]));
    const avg = (() => {
      const d = (data?.combos || []).map((c) => c.durationMs).filter(Boolean);
      // never promise less than two minutes a scenario: the clocks, the vendor sign-ins
      return Math.max(120000, d.length ? d.reduce((a, b) => a + b, 0) / d.length : 180000);
    })();
    return (
      `<details class="sx-group mx-live" id="mx-live"${live && live.company === company ? " open" : ""}><summary>Run these scenarios again, live</summary><div class="sx-group-body">` +
      `<p class="sx-sub">Plays the chosen scenarios against ${esc(name)} on UAT. Each one takes ${esc(mins(avg))} and creates its own test event. The results above are from saved runs; you do not need to run anything to read them.</p>` +
      `<div class="mx-pick">${forClient
        .map((x) => {
          const v = ran.get(x.id)?.verdict;
          return `<label class="mx-pickrow"><input type="checkbox" value="${esc(x.id)}" data-avg="${Math.round(avg)}" /> <span>${esc(plain(x.title))}${v ? ` <span class="sx-muted">· last ${esc((VERDICT[v] || v).toLowerCase())}</span>` : ""}</span></label>`;
        })
        .join("")}</div>` +
      `<div class="sx-btnrow"><button type="button" class="run-btn ghost small" id="mx-run" disabled>Run these scenarios…</button><span class="sx-sub" id="mx-picked">Pick at least one.</span></div>` +
      `<div id="mx-livebox"></div>` +
      `</div></details>` +
      `<dialog class="mx-dialog" id="mx-confirm"><form method="dialog">` +
      `<h3 class="sx-h3">Run <span id="mx-cn"></span> on UAT?</h3>` +
      `<ul class="sx-list" id="mx-cwhat"></ul>` +
      `<div class="sx-btnrow"><button value="cancel" class="chip">Cancel</button><button value="go" class="run-btn primary small" id="mx-go">Yes, run them</button></div>` +
      `</form></dialog>`
    );
  }

  function picked() {
    return [...document.querySelectorAll("#mx-live .mx-pick input:checked")].map((i) => i.value);
  }

  let pending = null; // the scenarios waiting on the confirmation dialog
  function wireLive(company, name) {
    const run = q("#mx-run");
    if (!run) return;
    const update = () => {
      const p = picked();
      run.disabled = !p.length || !!live?.es;
      const avg = Number(document.querySelector("#mx-live .mx-pick input")?.dataset.avg) || 180000;
      q("#mx-picked").textContent = live?.es ? "A run is going — wait for it to finish." : p.length ? `${p.length} chosen · ${mins(avg * p.length + 60000)} in all` : "Pick at least one.";
    };
    for (const i of document.querySelectorAll("#mx-live .mx-pick input")) i.addEventListener("change", update);
    update();
    run.addEventListener("click", () => {
      const p = picked();
      if (!p.length) return;
      const avg = Number(document.querySelector("#mx-live .mx-pick input")?.dataset.avg) || 180000;
      const dlg = q("#mx-confirm");
      q("#mx-cn").textContent = p.length === 1 ? "1 scenario" : `${p.length} scenarios`;
      q("#mx-cwhat").innerHTML =
        `<li>It takes <b>${esc(mins(avg * p.length + 60000))}</b> — the steps wait for real bidding clocks to open and close. Keep this page open.</li>` +
        `<li>It creates <b>${p.length} new test event${p.length === 1 ? "" : "s"}</b> on ${esc(name)} (UAT), named QA_Platform_Matrix_…, with bids and award proposals on them.</li>` +
        `<li>Only the QA test vendors are invited. No real supplier is contacted and no setting is changed.</li>` +
        `<li>One run at a time on this server.</li>`;
      if (typeof dlg.showModal !== "function") {
        if (window.confirm(`Run ${p.length} scenario(s) on UAT? It takes ${mins(avg * p.length + 60000)} and creates test events.`)) startLive(company, p);
        return;
      }
      pending = p;
      dlg.showModal();
    });
    // the buttons themselves, not the dialog's "close" event (which a hidden tab may hold back)
    q("#mx-go")?.addEventListener("click", (e) => {
      e.preventDefault();
      q("#mx-confirm")?.close();
      const p = pending;
      pending = null;
      if (p?.length) startLive(company, p);
    });
    q('#mx-confirm button[value="cancel"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      pending = null;
      q("#mx-confirm")?.close();
    });
  }

  function startLive(company, list) {
    if (live?.es) return;
    const es = new EventSource(`/api/matrix/stream?c=${company}&combos=${encodeURIComponent(list.join(","))}`);
    live = { es, company, combos: list, log: [], steps: {}, state: "running", started: Date.now() };
    const stop = () => {
      // EventSource reconnects by itself — and a reconnect would start ANOTHER run. Never let it.
      es.close();
      if (live) live.es = null;
    };
    es.addEventListener("line", (e) => {
      try {
        live.log.push(JSON.parse(e.data).line);
      } catch {
        /* ignore */
      }
      paintLive();
    });
    es.addEventListener("step", (e) => {
      try {
        const { combo, step } = JSON.parse(e.data);
        (live.steps[combo] ||= []).push(step);
      } catch {
        /* ignore */
      }
      paintLive();
    });
    es.addEventListener("done", (e) => {
      stop();
      live.state = "done";
      try {
        live.file = JSON.parse(e.data).file;
      } catch {
        /* ignore */
      }
      paintLive();
      shown = null;
      if (parse() && clientId() === company) route();
    });
    es.addEventListener("error", (e) => {
      let msg = "";
      try {
        msg = e.data ? JSON.parse(e.data).message : "";
      } catch {
        /* a connection error has no data */
      }
      const wasRunning = !!live?.es;
      stop();
      if (live && live.state === "running" && wasRunning) {
        live.state = "stopped";
        live.error = msg || "The connection to the server closed before the run finished.";
      }
      paintLive();
    });
    paintLive();
    const run = q("#mx-run");
    if (run) run.disabled = true;
  }

  function paintLive() {
    const box = q("#mx-livebox");
    if (!box || !live) return;
    const all = shown?.all || [];
    const title = (id) => plain(all.find((x) => x.id === id)?.title || id);
    const state =
      live.state === "running"
        ? `<div class="sx-banner info"><b>Running</b> — ${esc(live.combos.length)} scenario${live.combos.length === 1 ? "" : "s"}, started ${esc(when(new Date(live.started).toISOString()))}. Keep this page open.</div>`
        : live.state === "done"
          ? `<div class="sx-banner"><b>Finished.</b> The results above now include this run.</div>`
          : `<div class="sx-banner bad"><b>Stopped:</b> ${esc(plain(live.error || ""))}</div>`;
    const per = live.combos
      .map((id) => {
        const st = live.steps[id] || [];
        const bad = st.filter((s) => s.verdict === "fail" || s.verdict === "defect").length;
        const lastS = st[st.length - 1];
        return `<div class="sx-result">${st.length ? CV.verdictPill(bad ? "Failed" : "Passed") : `<span class="sx-badge">Waiting</span>`}<div><b>${esc(title(id))}</b><div class="sx-sub">${st.length ? `${st.length} step${st.length === 1 ? "" : "s"} so far${bad ? `, ${bad} failed` : ""} · last: ${esc(plain(lastS.title))}` : "waiting"}</div></div></div>`;
      })
      .join("");
    const log = live.log.slice(-40).map((l) => plain(l)).join("\n");
    const run = q("#mx-run");
    if (run) run.disabled = !!live.es || !picked().length;
    if (live.es && q("#mx-picked")) q("#mx-picked").textContent = "A run is going — wait for it to finish.";
    box.innerHTML = state + per + (log ? `<details class="cv-details"><summary>Details</summary><pre class="sx-log">${esc(log)}</pre></details>` : "");
  }

  window.addEventListener("hashchange", () => {
    if (parse()) route();
  });
  // the app's client picker: what is on screen belongs to the old client
  q("#client")?.addEventListener("change", () => {
    if (q("#client")?.value === "__add__") return;
    override = null;
    shown = null;
    if (parse()) route();
  });
  route();
})();
