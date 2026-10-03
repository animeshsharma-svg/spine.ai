/**
 * Success — is spine.ai worth it? Five questions, each answered with today's
 * number, the target, and the last 14 days.
 *
 *   #/success              every client's history
 *   (the client picker in the top bar narrows it to one client)
 *
 * Data: GET /api/metrics?c=  (src/routes/metrics.ts → src/checks/metrics.ts)
 * Input: POST /api/metrics/input {key, value} — the bug numbers only the team knows.
 *
 * Plain words in the main text; where a number comes from is in the closed
 * "Details" under each pillar. Loaded after app.js; uses CaseView for esc/details.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#sc-root");

  let scope = "all"; // "all" | "client"
  let data = null;
  let loading = false;

  function clientId() {
    const n = Number(q("#client")?.value);
    if (n > 0) return n;
    try {
      return typeof currentClient === "number" && currentClient ? currentClient : null;
    } catch {
      return null;
    }
  }
  function clientName() {
    try {
      return typeof currentClientName === "string" && currentClientName ? currentClientName : "this client";
    } catch {
      return "this client";
    }
  }

  // ── numbers in words ──────────────────────────────────────────────────

  function fmt(v, unit) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    if (unit === "%") return `${(Math.round(v * 1000) / 10).toLocaleString()}%`;
    if (unit === "minutes") return v < 1 ? "< 1 min" : `${Math.round(v)} min`;
    if (unit === "usd") return v === 0 ? "$0" : `$${v.toFixed(2)}`;
    return Math.round(v).toLocaleString();
  }
  const targetWords = (m) =>
    m.target === null || m.target === undefined ? "no target set" : `target ${m.better === "lower" ? "at most" : "at least"} ${fmt(m.target, m.unit)}`;
  const STATUS = {
    met: ["good", "✓", "On target"],
    close: ["warn", "≈", "Close"],
    missed: ["bad", "✕", "Below target"],
    unknown: ["", "·", "Not measured yet"],
  };

  // ── 14-day sparkline: one series, the target as a dashed line ─────────

  function spark(m) {
    const pts = (m.trend || []).map((p, i) => ({ i, day: p.day, v: p.value }));
    const have = pts.filter((p) => p.v !== null && p.v !== undefined);
    if (!have.length) return `<div class="sc-spark-empty">No history for the last 14 days yet</div>`;
    const W = 220, H = 48, P = 5;
    const vals = have.map((p) => p.v).concat(m.target != null ? [m.target] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (m.unit === "%" || m.unit === "count") { lo = Math.min(lo, 0); hi = Math.max(hi, 1e-9); }
    if (hi === lo) { hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.1); }
    const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, pts.length - 1);
    const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
    // a gap where a day has nothing — never draw a line through missing days
    let d = "", pen = false;
    for (const p of pts) {
      if (p.v === null || p.v === undefined) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)} `;
      pen = true;
    }
    const tgt = m.target != null ? `<line class="sc-tgt" x1="${P}" x2="${W - P}" y1="${y(m.target).toFixed(1)}" y2="${y(m.target).toFixed(1)}"/>` : "";
    const dots = have
      .map((p) => {
        const label = `${new Date(p.day + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}: ${fmt(p.v, m.unit)}`;
        return `<g class="sc-pt"><circle class="sc-hit" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="9"><title>${esc(label)}</title></circle><circle class="sc-dot" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p === have[have.length - 1] ? 3.5 : 2.5}"/></g>`;
      })
      .join("");
    const first = pts[0].day, last = pts[pts.length - 1].day;
    const short = (s) => new Date(s + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" });
    return `<svg class="sc-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.label)}, last 14 days">${tgt}<path class="sc-line" d="${d}"/>${dots}</svg>
      <div class="sc-axis"><span>${esc(short(first))}</span><span>${m.target != null ? "dashed line = target" : ""}</span><span>${esc(short(last))}</span></div>`;
  }

  // ── a metric, a pillar, the page ──────────────────────────────────────

  function metricCard(m) {
    const [tone, ico, word] = STATUS[m.status] || STATUS.unknown;
    return `<div class="sc-metric ${tone}">
      <div class="sc-mhead"><span class="sc-mlabel">${esc(m.label)}</span><span class="sx-badge ${tone}" title="${esc(word)}">${ico} ${esc(word)}</span></div>
      <div class="sc-value">${esc(fmt(m.value, m.unit))}<span class="sc-target">${esc(targetWords(m))}</span></div>
      <p class="sc-says">${esc(m.says)}</p>
      ${spark(m)}
    </div>`;
  }

  function bugInputs() {
    const v = data.inputs.values || {};
    const val = (k) => (v[k] ? v[k].value : "");
    const when = v.bugs_accepted?.updatedAt || v.bugs_reported?.updatedAt;
    const field = (k, label) =>
      `<label class="sc-in"><span>${esc(label)}</span><input class="sx-input" type="number" min="0" step="1" data-key="${k}" value="${esc(val(k))}" /></label>`;
    return `<div class="sc-inputs">
      <div class="sx-sub">Only the team knows these. They decide the "bugs Procol accepted" number and are kept in spine.ai's database${when ? ` — last changed ${esc(new Date(when).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}` : ""}.</div>
      <div class="sc-inrow">
        ${field("bugs_reported", "Bugs reported to Procol")}
        ${field("bugs_accepted", "Accepted as real bugs")}
        ${field("bugs_rejected", "Turned down")}
        <button class="run-btn primary" id="sc-save">Save</button>
      </div>
      <div class="sx-sub" id="sc-save-msg">${data.inputs.stored ? "" : "spine.ai's database is not running, so these cannot be saved right now."}</div>
    </div>`;
  }

  function pillarHtml(p, n) {
    const details = p.metrics.map((m) => ({ label: m.label, value: m.source }));
    let extra = "";
    if (p.key === "bugs") {
      const b = data.bugs;
      const sev = Object.entries(b.bySeverity || {}).sort((a, z) => z[1] - a[1]).map(([k, c]) => `${c} ${k.toLowerCase()}`).join(" · ");
      extra = `${sev ? `<p class="sx-p sx-muted">By severity: ${esc(sev)}.</p>` : ""}${bugInputs()}`;
      if (b.bugs?.length) {
        details.push({
          label: "Verified bugs",
          kind: "block",
          value: b.bugs.map((x) => `${x.id}  ${x.title}  (${x.severity}${x.confirmed ? `, last confirmed ${x.confirmed}` : ""})`).join("\n"),
        });
      }
    }
    if (p.key === "coverage") extra = coverageHtml();
    return `<section class="sc-pillar" id="sc-${p.key}">
      <header class="sc-phead"><span class="sc-n">${n}</span><div><h2>${esc(p.title)}</h2><p class="sx-sub">${esc(p.question)}</p></div></header>
      <div class="sc-grid">${p.metrics.map(metricCard).join("")}</div>
      ${extra}
      ${CV.detailsHtml(details, { label: "Where these numbers come from" })}
    </section>`;
  }

  function bar(b) {
    const w = (x) => (b.total ? (100 * x) / b.total : 0);
    return `<div class="sc-bar" title="${esc(`${b.everRun} of ${b.total} have run · ${b.runsNow} can run today`)}">
      <span class="sc-bar-ever" style="width:${w(b.everRun).toFixed(1)}%"></span>
      <span class="sc-bar-now" style="width:${Math.max(0, w(b.runsNow) - w(b.everRun)).toFixed(1)}%"></span>
    </div>`;
  }

  function coverageHtml() {
    const c = data.coverage;
    const row = (b) =>
      b.total
        ? `<tr><td>${esc(b.label)}</td><td class="num">${b.total}</td><td class="num">${b.runsNow}</td><td class="num">${b.everRun}</td><td class="num">${b.pass}</td><td class="num">${b.fail}</td><td class="num">${b.inconclusive}</td><td class="sc-barcell">${bar(b)}</td></tr>`
        : "";
    const head = `<tr><th></th><th class="num">Cases</th><th class="num">Can run</th><th class="num">Have run</th><th class="num">Passing</th><th class="num">Failing</th><th class="num">Couldn't tell</th><th><span class="sc-key ever"></span>run <span class="sc-key now"></span>can run</th></tr>`;
    const build = (c.buildOrder || [])
      .map((x, i) => `<li><b>${esc(x.title)}</b> <span class="sx-muted">· ${esc(x.priority)} · ${esc(journeyName(x.journey))}</span></li>`)
      .join("");
    return `
      <details class="sx-group" open><summary>By journey</summary><div class="sx-group-body sc-tablewrap"><table class="sx-table sc-table">${head}${c.byJourney.map(row).join("")}</table></div></details>
      <details class="sx-group"><summary>By area</summary><div class="sx-group-body sc-tablewrap"><table class="sx-table sc-table">${head}${c.byArea.map(row).join("")}</table></div></details>
      <details class="sx-group"><summary>What to automate next — ${c.buildOrderTotal} important cases have no runner of their own</summary>
        <div class="sx-group-body"><p class="sx-sub">The most important cases marked for automation that nothing runs yet, highest priority first, in journey order. The first 50:</p><ol class="sx-list">${build}</ol>
        ${CV.detailsHtml([{ label: "Case ids, in order", kind: "block", value: (c.buildOrder || []).map((x) => `${x.id}  — ${x.because}`).join("\n") }])}</div></details>`;
  }

  function journeyName(id) {
    const j = (data.coverage.byJourney || []).find((b) => b.key === id);
    return j ? j.label : "—";
  }

  function render() {
    const box = root();
    if (!box) return;
    if (!data) {
      box.innerHTML = `<div class="loading">${loading ? "Counting…" : ""}</div>`;
      return;
    }
    if (data.error) {
      box.innerHTML = `<div class="sx-banner bad"><b>Could not load the numbers:</b> ${esc(data.error)}</div>`;
      return;
    }
    const cid = clientId();
    const scopeBar = `<div class="sx-tabs">
      <button class="chip ${scope === "all" ? "active" : ""}" data-scope="all">Every client</button>
      <button class="chip ${scope === "client" ? "active" : ""}" data-scope="client" ${cid ? "" : "disabled"}>Only ${esc(clientName())}</button>
      <span class="sx-sub" style="margin-left:auto">Updated ${esc(new Date(data.generatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))} · <a href="#/success" id="sc-refresh">refresh</a></span>
    </div>`;
    const met = data.pillars.flatMap((p) => p.metrics).filter((m) => m.status === "met").length;
    const all = data.pillars.flatMap((p) => p.metrics).filter((m) => m.status !== "unknown").length;
    const headline = `<div class="sx-banner info"><b>${met} of ${all} measured goals are on target.</b> ${data.database ? "" : "spine.ai's database is not running — history comes from the saved run files and nothing can be saved."}</div>`;
    box.innerHTML = scopeBar + headline + data.pillars.map((p, i) => pillarHtml(p, i + 1)).join("");
    box.querySelectorAll("[data-scope]").forEach((b) =>
      b.addEventListener("click", () => {
        scope = b.dataset.scope;
        load();
      }),
    );
    q("#sc-refresh")?.addEventListener("click", (e) => {
      e.preventDefault();
      load();
    });
    q("#sc-save")?.addEventListener("click", save);
  }

  async function save() {
    const msg = q("#sc-save-msg");
    const inputs = [...document.querySelectorAll("#sc-root .sc-inputs input[data-key]")];
    const filled = inputs.filter((i) => i.value !== "");
    if (!filled.length) {
      if (msg) msg.textContent = "Fill in at least one number first.";
      return;
    }
    if (msg) msg.textContent = "Saving…";
    for (const i of filled) {
      try {
        const r = await fetch("/api/metrics/input", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: i.dataset.key, value: Number(i.value) }),
        }).then((x) => x.json());
        if (!r.ok) {
          if (msg) msg.textContent = `Not saved: ${r.error || "unknown problem"}`;
          return;
        }
      } catch {
        if (msg) msg.textContent = "Not saved: the server did not answer.";
        return;
      }
    }
    load();
  }

  async function load() {
    if (loading) return;
    loading = true;
    if (!data) render();
    const cid = scope === "client" ? clientId() : null;
    try {
      const r = await fetch(`/api/metrics${cid ? `?c=${cid}` : ""}`);
      data = await r.json();
    } catch {
      data = { error: "the server did not answer" };
    } finally {
      loading = false;
    }
    render();
  }

  function active() {
    return (location.hash.replace(/^#\/?/, "") || "").split("/")[0] === "success";
  }
  window.addEventListener("hashchange", () => {
    if (active()) load();
  });
  q("#client")?.addEventListener("change", () => {
    if (scope === "client" && active()) load();
  });
  if (active()) load();
})();
