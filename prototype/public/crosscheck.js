/**
 * UI vs API (Phase 5).
 *
 * A cross-check run opens an event's screens in a browser, records what the
 * backend sent each screen, and compares it with what the screen shows. This
 * view lists the runs, opens one (findings with "API says … / Screen shows …"
 * and the screenshot, the cases, the screens), and starts a new run.
 *
 *   #/crosscheck            the runs, and the Run form
 *   #/crosscheck/<runId>    one run
 *
 * Loaded after app.js; uses CaseView for pills and closed Details.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#xc-root");

  const VERDICT = { passed: "Passed", failed: "Failed", inconclusive: "Couldn't tell", "not-run": "Not run" };
  const SEV_CLS = { critical: "bad", high: "bad", medium: "warn", low: "idle", info: "idle" };

  function clientId() {
    const n = Number(q("#client")?.value);
    if (n > 0) return n;
    try {
      return typeof currentClient === "number" && currentClient ? currentClient : 198678;
    } catch {
      return 198678;
    }
  }

  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  const fileUrl = (runId, path) => `/api/crosscheck/file?id=${encodeURIComponent(runId)}&path=${encodeURIComponent(path)}`;
  const verdictPill = (v) => CV.verdictPill(VERDICT[v] || v);

  function route() {
    const m = location.hash.match(/^#\/crosscheck(?:\/(.+))?$/);
    if (!m) return;
    if (m[1]) showRun(decodeURIComponent(m[1]));
    else showList();
  }

  // ── the list + the Run form ───────────────────────────────────────────
  let polling = null; // {runId, timer}

  function formHtml() {
    return (
      `<div class="sx-card accent"><h3 class="sx-h3">Check an event</h3>` +
      `<p class="sx-sub">Opens the event's screens in the one shared browser (runs wait their turn) and compares every value with the API. Takes about a minute.</p>` +
      `<div class="sx-btnrow"><input id="xc-event" class="sx-input" placeholder="the event's id — e.g. 85305, or UWtYY3BO from its link" spellcheck="false" />` +
      `<button type="button" id="xc-run" class="run-btn primary small">▶ Run the check</button></div>` +
      `<div id="xc-status" class="sx-sub" aria-live="polite"></div></div>`
    );
  }

  async function showList() {
    const box = root();
    if (!box) return;
    box.innerHTML = formHtml() + `<div class="col-head" style="margin-top:16px"><h2>Runs</h2><span class="hint" id="xc-count"></span></div><div id="xc-runs"><div class="loading">Loading the runs…</div></div>`;
    q("#xc-run")?.addEventListener("click", startRun);
    q("#xc-event")?.addEventListener("keydown", (e) => e.key === "Enter" && startRun());
    if (polling) pollOnce(); // a run started earlier is still going: show it
    try {
      const j = await (await fetch("/api/crosscheck/runs")).json();
      const runs = j.runs || [];
      q("#xc-count").textContent = runs.length ? `${runs.length} kept, newest first` : "";
      const list = q("#xc-runs");
      if (!runs.length) {
        list.innerHTML = `<div class="empty">No cross-check has run yet. Enter an event above and run the check.</div>`;
        return;
      }
      const ev0 = runs[0]?.event;
      const inp = q("#xc-event");
      if (inp && !inp.value && ev0?.dbId) inp.placeholder = `the event's id — e.g. ${ev0.dbId}, or ${ev0.uuid} from its link`;
      list.innerHTML =
        `<table class="sx-table"><thead><tr><th>When</th><th>Event</th><th>Result</th><th>Summary</th><th>Findings</th></tr></thead><tbody>` +
        runs
          .map(
            (r) =>
              `<tr class="sx-click" data-run="${esc(r.runId)}">` +
              `<td data-k="When">${esc(when(r.finishedAt || r.startedAt))}</td>` +
              `<td data-k="Event"><b>${esc(r.event?.title || "")}</b><div class="sx-sub">${esc(r.event?.ref || "")}${r.companyId ? ` · company ${esc(r.companyId)}` : ""}</div></td>` +
              `<td data-k="Result">${verdictPill(r.verdict)}</td>` +
              `<td data-k="Summary">${esc(r.summary || "")}</td>` +
              `<td data-k="Findings">${r.findings ? `<span class="sx-badge bad">${r.findings}</span>` : `<span class="sx-badge good">0</span>`}</td></tr>`,
          )
          .join("") +
        `</tbody></table>`;
      for (const tr of list.querySelectorAll("tr[data-run]")) tr.addEventListener("click", () => (location.hash = `#/crosscheck/${encodeURIComponent(tr.dataset.run)}`));
    } catch (e) {
      q("#xc-runs").innerHTML = `<div class="sx-error">Could not load the runs: ${esc(e.message)}</div>`;
    }
  }

  async function startRun() {
    const event = (q("#xc-event")?.value || "").trim();
    const status = q("#xc-status");
    if (!event) {
      q("#xc-event")?.focus();
      if (status) status.textContent = "Enter the event's id first.";
      return;
    }
    const btn = q("#xc-run");
    if (btn) btn.disabled = true;
    if (status) status.textContent = "Starting…";
    try {
      const r = await fetch("/api/crosscheck/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: clientId(), event }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      polling = { runId: j.runId, timer: null, state: j.state };
      if (status) status.textContent = `Queued (${j.runId}) — waiting for the browser…`;
      polling.timer = setInterval(pollOnce, 3000);
    } catch (e) {
      if (status) status.innerHTML = `<span class="sx-error">Could not start: ${esc(e.message)}</span>`;
      if (btn) btn.disabled = false;
    }
  }

  async function pollOnce() {
    if (!polling) return;
    const status = q("#xc-status");
    const btn = q("#xc-run");
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(`/api/crosscheck/status?id=${encodeURIComponent(polling.runId)}`);
      const s = await r.json();
      if (!r.ok) throw new Error(s.error || `HTTP ${r.status}`);
      const word = { queued: "Waiting for the browser", running: "Running", finished: "Finished", failed: "Stopped" }[s.state] || s.state;
      if (status) status.innerHTML = `<b>${esc(word)}</b>${s.lastLine ? ` — ${esc(CV.scrub(s.lastLine))}` : ""}`;
      if (s.state === "finished" || s.state === "failed") {
        clearInterval(polling.timer);
        const id = polling.runId;
        polling = null;
        if (btn) btn.disabled = false;
        if (s.state === "finished") location.hash = `#/crosscheck/${encodeURIComponent(id)}`;
        else if (status) status.innerHTML = `<span class="sx-error">The run stopped without a result${s.error ? `: ${esc(s.error)}` : ""}.</span>`;
      }
    } catch (e) {
      if (status) status.innerHTML = `<span class="sx-error">Lost track of the run: ${esc(e.message)}</span>`;
      clearInterval(polling.timer);
      polling = null;
      if (btn) btn.disabled = false;
    }
  }

  // ── one run ───────────────────────────────────────────────────────────
  function findingHtml(runId, f) {
    const sev = f.severity || "medium";
    const thumb = f.screenshot ? `<img class="sx-thumb" loading="lazy" alt="Screenshot of the screen this was seen on" src="${esc(fileUrl(runId, f.screenshot))}" data-zoom="${esc(fileUrl(runId, f.screenshot))}" />` : "";
    const d = f.details || {};
    return (
      `<div class="sx-card ${SEV_CLS[sev] === "bad" ? "bad" : "warn"}"><div class="sx-xcfind"><div>` +
      `<div class="sx-row"><span class="sx-badge ${SEV_CLS[sev] || "idle"}">${esc(sev)}</span><b class="sx-grow">${esc(CV.scrub(f.title || ""))}</b></div>` +
      `<div class="sx-vs"><div><span class="sx-k" style="margin:0">API says</span>${esc(f.apiValue ?? "")}</div><div><span class="sx-k" style="margin:0">Screen shows</span>${esc(f.screenValue ?? "")}</div></div>` +
      CV.detailsHtml([
        { label: "Where on the screen", value: f.where || "" },
        { label: "Field", value: d.field || "" },
        { label: "Row", value: d.item || "" },
        { label: "Rule", value: d.rule || "" },
        { label: "Source of the API value", value: d.source || "", kind: "code" },
        { label: "Kind", value: f.kind || "" },
        { label: "Case", value: f.case || "", kind: "code" },
        { label: "Screen", value: f.screen || "", kind: "code" },
        { label: "Finding id", value: f.id || "", kind: "code" },
      ]) +
      `</div><div>${thumb}</div></div></div>`
    );
  }

  function caseRows(runId, cases) {
    return (
      `<table class="sx-table"><thead><tr><th>Test case</th><th>Result</th><th>Why</th></tr></thead><tbody>` +
      cases
        .map((c) => {
          const per = (c.results || []).map((r) => ({ label: r.screenTitle || r.screen, value: `${VERDICT[r.verdict] || r.verdict} — ${r.reason || ""}` }));
          const n = c.counts || {};
          return (
            `<tr><td data-k="Case"><b>${esc(c.title || c.case)}</b> <span class="cv-ref">${esc(c.case)}</span></td>` +
            `<td data-k="Result">${verdictPill(c.verdict)}</td>` +
            `<td data-k="Why">${esc(CV.scrub(c.reason || ""))}` +
            CV.detailsHtml([
              { label: "Values", value: n.checked != null ? `${n.checked} checked · ${n.passed} matched · ${n.failed} differed · ${n.skipped} skipped · ${n.unread} unread` : "" },
              { label: "Screens", value: (c.screens || []).join(", "), kind: "code" },
              ...per,
            ]) +
            `</td></tr>`
          );
        })
        .join("") +
      `</tbody></table>`
    );
  }

  function screensHtml(runId, screens) {
    if (!screens?.length) return "";
    return (
      `<div class="sx-shots">` +
      screens
        .map(
          (s) =>
            `<div class="sx-shot">${s.screenshot ? `<img class="sx-thumb" loading="lazy" alt="${esc(s.key)}" src="${esc(fileUrl(runId, s.screenshot))}" data-zoom="${esc(fileUrl(runId, s.screenshot))}" />` : ""}` +
            `<div><b>${esc(s.key)}</b></div><div>${s.responses ?? 0} API replies${s.failedResponses ? `, <span style="color:var(--bad)">${s.failedResponses} failed</span>` : ""}</div>` +
            (s.notArrived?.length ? `<div style="color:var(--warn)">${s.notArrived.length} expected repl${s.notArrived.length === 1 ? "y" : "ies"} never arrived</div>` : "") +
            CV.detailsHtml([
              { label: "Address", value: s.url || "", kind: "code" },
              { label: "Never arrived", value: (s.notArrived || []).join("\n"), kind: "block" },
            ]) +
            `</div>`,
        )
        .join("") +
      `</div>`
    );
  }

  async function showRun(runId) {
    const box = root();
    if (!box) return;
    box.innerHTML = `<button type="button" class="sx-back" id="xc-back">← All runs</button><div class="loading">Loading the run…</div>`;
    q("#xc-back")?.addEventListener("click", () => (location.hash = "#/crosscheck"));
    try {
      const r = await fetch(`/api/crosscheck/run?id=${encodeURIComponent(runId)}&items=0`);
      const run = await r.json();
      if (!r.ok || run.error) throw new Error(run.error || `HTTP ${r.status}`);
      const findings = run.findings || [];
      const cases = run.cases || [];
      const tally = cases.reduce((t, c) => ((t[c.verdict] = (t[c.verdict] || 0) + 1), t), {});
      box.innerHTML =
        `<button type="button" class="sx-back" id="xc-back">← All runs</button>` +
        `<div class="sx-card ${run.verdict === "passed" ? "good" : run.verdict === "failed" ? "bad" : "warn"}">` +
        `<div class="sx-row"><h3 class="sx-h3 sx-grow">${esc(run.event?.title || "Event")} <span class="sx-muted">${esc(run.event?.ref || "")}</span></h3>${verdictPill(run.verdict)}</div>` +
        `<p class="sx-p">${esc(run.summary || "")}</p>` +
        `<p class="sx-sub">Checked ${esc(when(run.startedAt))}${run.companyId ? ` · company ${esc(run.companyId)}` : ""}${run.event?.createdByThisRun ? " · the event was created by this run" : ""}</p>` +
        `<div class="sx-chips">${Object.entries(tally).map(([v, n]) => `<span class="sx-chip">${n} ${esc((VERDICT[v] || v).toLowerCase())}</span>`).join("")}</div>` +
        CV.detailsHtml([
          { label: "Run id", value: run.runId, kind: "code" },
          { label: "Event id", value: `${run.event?.uuid || ""} · database ${run.event?.dbId || ""}`, kind: "code" },
          { label: "Finished", value: when(run.finishedAt) },
        ]) +
        `</div>` +
        `<div class="col-head" style="margin-top:16px"><h2>Findings</h2><span class="hint">${findings.length ? `${findings.length} place${findings.length === 1 ? "" : "s"} where the screen and the API disagree` : ""}</span></div>` +
        (findings.length ? findings.map((f) => findingHtml(run.runId, f)).join("") : `<div class="empty done">The screens agreed with the API everywhere they were checked.</div>`) +
        ((run.notes || []).length ? `<div class="sx-banner info"><b>Notes:</b><ul class="sx-list">${run.notes.map((n) => `<li>${esc(typeof n === "string" ? n : n.plain || JSON.stringify(n))}</li>`).join("")}</ul></div>` : "") +
        `<div class="col-head" style="margin-top:16px"><h2>Test cases</h2><span class="hint">${cases.length} checked</span></div>` +
        caseRows(run.runId, cases) +
        `<div class="col-head" style="margin-top:16px"><h2>Screens</h2><span class="hint">tap a screenshot to enlarge it</span></div>` +
        screensHtml(run.runId, Array.isArray(run.screens) ? run.screens : []);
      q("#xc-back")?.addEventListener("click", () => (location.hash = "#/crosscheck"));
      for (const img of box.querySelectorAll("img[data-zoom]")) img.addEventListener("click", () => zoom(img.dataset.zoom));
    } catch (e) {
      box.innerHTML += `<div class="sx-error">Could not load this run: ${esc(e.message)}</div>`;
    }
  }

  function zoom(src) {
    const z = document.createElement("div");
    z.className = "sx-zoom";
    z.innerHTML = `<img alt="Screenshot, enlarged" src="${esc(src)}" />`;
    z.addEventListener("click", () => z.remove());
    document.addEventListener("keydown", function k(e) {
      if (e.key === "Escape") {
        z.remove();
        document.removeEventListener("keydown", k);
      }
    });
    document.body.appendChild(z);
  }

  window.addEventListener("hashchange", route);
  route();
})();
