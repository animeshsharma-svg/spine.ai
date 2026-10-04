/**
 * History — every client's runs, from spine.ai's own database.
 *
 *   #/history                 one card per client (runs, last run, last 30 days, test records, bugs)
 *   click a card              that client's 14-day trend, its recent runs and the UAT test-record log
 *
 * Data (src/routes/data.ts): GET /api/data/companies · /api/data/companies/:id/runs ·
 * /api/data/trend?c=&days= · /api/data/test-records?c=. Every route answers
 * {database:false} when the database is down — the page then says so.
 * Plain words on the page; ids live in the closed "Details". Uses CaseView (esc, detailsHtml).
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#hy-root");
  let picked = null; // procol company id
  let busy = false;

  const fmtDate = (s) => (s ? new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  const pct = (n) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
  const STATUS = {
    passed: ["passed", "good"],
    failed: ["failed", "bad"],
    couldnt_tell: ["couldn't tell", "warn"],
    not_run: ["not run", "idle"],
    mixed: ["mixed", "warn"],
  };
  const KIND = { journey: "Event journey", api_cases: "API cases", ui_plan: "Screen case", matrix: "Bidding scenario", crosscheck: "Screen vs API", other: "Other" };
  function runWhat(r) {
    const t = String(r.title || "");
    if (/^ui-cases:/.test(t)) return `Screen case ${t.replace(/^ui-cases:\s*/, "")}`;
    if (/^api plan:/.test(t)) return t.replace(/^api plan:\s*/, "API automation: ");
    return t || KIND[r.kind] || "A run";
  }

  async function getJson(url) {
    const r = await fetch(url);
    return r.json();
  }

  function trendHtml(days) {
    if (!days?.length) return "";
    const max = Math.max(1, ...days.map((d) => d.passed + d.failed + d.couldntTell));
    const bars = days
      .map((d) => {
        const total = d.passed + d.failed + d.couldntTell;
        const h = (n) => Math.round((n / max) * 100);
        return (
          `<div class="hy-day" title="${esc(d.day)}: ${d.passed} passed, ${d.failed} failed, ${d.couldntTell} couldn't tell — pass rate ${pct(d.passRate)}">` +
          `<div class="hy-stack">` +
          (total
            ? `<span class="hy-seg bad" style="height:${h(d.failed)}%"></span><span class="hy-seg warn" style="height:${h(d.couldntTell)}%"></span><span class="hy-seg good" style="height:${h(d.passed)}%"></span>`
            : "") +
          `</div><div class="hy-lbl">${esc(d.day.slice(5))}</div><div class="hy-rate">${pct(d.passRate)}</div></div>`
        );
      })
      .join("");
    return `<h3>Last ${days.length} days</h3><div class="hy-trend">${bars}</div><p class="sx-sub">Green passed · amber couldn't tell · red failed. The figure under each day is its pass rate ("—" when nothing was judged that day).</p>`;
  }

  function runsHtml(runs) {
    if (!runs?.length) return `<p class="sx-sub">No runs yet for this client.</p>`;
    const rows = runs
      .map((r) => {
        const st = STATUS[r.status] || [r.status || "—", "idle"];
        const res = r.results || {};
        return (
          `<tr><td>${esc(fmtDate(r.startedAt))}</td><td>${esc(runWhat(r))}</td>` +
          `<td><span class="sx-badge ${st[1]}">${esc(st[0])}</span></td>` +
          `<td>${res.passed ?? 0} passed · ${res.failed ?? 0} failed · ${res.couldntTell ?? 0} couldn't tell</td>` +
          `<td>${r.durationMs ? `${Math.round(r.durationMs / 1000)} s` : "—"}</td>` +
          `<td>${CV.detailsHtml([
            { label: "Run id", value: r.id, kind: "code" },
            { label: "Started by", value: `${r.trigger}${r.triggerBasis === "inferred" ? " (inferred)" : ""}` },
            { label: "Code version", value: (r.spineGitSha || "").slice(0, 8), kind: "code" },
          ])}</td></tr>`
        );
      })
      .join("");
    return `<h3>Recent runs</h3><table class="hy-table"><thead><tr><th>When</th><th>What ran</th><th>Result</th><th>Checks</th><th>Took</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function recordsHtml(rec) {
    if (!rec || rec.database === false) return "";
    const byState = Object.entries(rec.byState || {}).map(([k, v]) => `${v} ${k}`).join(" · ");
    const rows = (rec.rows || [])
      .slice(0, 15)
      .map(
        (x) =>
          `<tr${x.namedAsTest ? "" : ' class="hy-warnrow"'}><td>${esc(x.type)}</td><td>${esc(x.title || "—")}</td><td>${esc(fmtDate(x.createdAt))}</td><td>${esc(x.cleanupState)}</td>` +
          `<td>${CV.detailsHtml([
            { label: "Procol id", value: x.procolUuid || x.procolId || "", kind: "code" },
            { label: "Created by run", value: x.createdByRun || "", kind: "code" },
          ])}</td></tr>`,
      )
      .join("");
    return (
      `<h3>What spine.ai created on UAT for this client</h3>` +
      `<p class="sx-sub">${rec.total} test record(s) — ${esc(byState || "none")}. Every one is a test record (events named QA_Platform_… / API_Test_…, QA vendors only); a row in amber would be one that is not named as a test.</p>` +
      `<table class="hy-table"><thead><tr><th>Kind</th><th>Title</th><th>Created</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  async function renderCompany(id) {
    const el = q("#hy-detail");
    if (!el) return;
    el.innerHTML = `<div class="loading">Loading this client's history…</div>`;
    const [runs, trend, rec] = await Promise.all([
      getJson(`/api/data/companies/${id}/runs?limit=40`).catch(() => null),
      getJson(`/api/data/trend?c=${id}&days=14`).catch(() => null),
      getJson(`/api/data/test-records?c=${id}&limit=15`).catch(() => null),
    ]);
    if (!runs || runs.database === false) {
      el.innerHTML = `<div class="sx-error">History is unavailable — spine.ai's database did not answer.</div>`;
      return;
    }
    el.innerHTML = trendHtml(trend?.days) + runsHtml(runs.runs) + recordsHtml(rec);
  }

  async function render() {
    if (busy) return;
    busy = true;
    const r = root();
    if (!r) return;
    r.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const j = await getJson("/api/data/companies");
      if (j.database === false) {
        r.innerHTML = `<div class="sx-error">History is unavailable — spine.ai's database did not answer.</div>`;
        return;
      }
      const cards = (j.companies || [])
        .filter((c) => c.runs > 0)
        .map((c) => {
          const l = c.last30Days || {};
          const judged = (l.passed || 0) + (l.failed || 0) + (l.couldntTell || 0);
          return (
            `<button class="hy-card${picked === c.procolCompanyId ? " on" : ""}" data-c="${c.procolCompanyId}">` +
            `<div class="hy-name">${esc(c.name)}${c.isPrimary ? ' <span class="sx-badge good">primary</span>' : ""}</div>` +
            `<div class="hy-num">${c.runs} runs · last ${esc(fmtDate(c.lastRunAt))}</div>` +
            `<div class="hy-num">Last 30 days: ${l.passed || 0} passed · ${l.failed || 0} failed · ${l.couldntTell || 0} couldn't tell${judged ? ` (${Math.round(((l.passed || 0) / judged) * 100)}% passed)` : ""}</div>` +
            `<div class="hy-num">${c.testRecords} test records on UAT · ${c.defects} bug occurrences</div>` +
            `</button>`
          );
        })
        .join("");
      r.innerHTML = `<div class="hy-cards">${cards || '<p class="sx-sub">No runs recorded yet.</p>'}</div><div id="hy-detail"></div>`;
      r.querySelectorAll(".hy-card").forEach((b) =>
        b.addEventListener("click", () => {
          picked = Number(b.dataset.c);
          r.querySelectorAll(".hy-card").forEach((x) => x.classList.toggle("on", x === b));
          renderCompany(picked);
        }),
      );
      const first = picked ?? (j.companies || []).find((c) => c.isPrimary)?.procolCompanyId;
      if (first) {
        picked = first;
        r.querySelector(`.hy-card[data-c="${first}"]`)?.classList.add("on");
        renderCompany(first);
      }
    } catch {
      r.innerHTML = `<div class="sx-error">Could not load the history.</div>`;
    } finally {
      busy = false;
    }
  }

  const active = () => (location.hash.replace(/^#\/?/, "") || "").split("/")[0] === "history";
  window.addEventListener("hashchange", () => active() && render());
  if (active()) render();
})();
