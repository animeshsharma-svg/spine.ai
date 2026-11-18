/**
 * HOME — TEST A WHOLE SHEET (#/home, below the request card).
 *
 * Drop a sheet of test cases, a PRD, or both. spine.ai then:
 *   1. reads the files (a PRD alone is first turned into cases — from the PRD only, never from the code);
 *   2. reads every case against the runner prompt and the PRD, and lists what cannot run here before it starts;
 *   3. runs the whole sheet one case at a time, module by module, in one browser (a sheet campaign);
 *   4. hands back one .xlsx: Test Cases with Status / Actual Result / Screenshots, and Bugs in the house format.
 *
 * Data: POST /api/home/upload, GET /api/home/job, POST /api/home/job/run|stop, /api/home/job/cases|report,
 * the live picture /api/sheets/campaign/frame and the live report /api/sheets/campaign/report (src/routes/home.ts).
 * Loaded after home.js; reads app.js's currentClient for the company.
 */
(function () {
  "use strict";
  const q = (s, el = document) => el.querySelector(s);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const SHEET = /\.(xlsx|xls|csv)$/i;
  const PRD = /\.(docx|pdf|md|markdown|txt)$/i;
  const DONE = ["done", "stopped", "failed"];
  const S = { files: [], autoRun: true, job: null, sending: false, why: "", timer: null, frameAt: 0 };

  const clientId = () => {
    try { const n = Number(currentClient); if (n > 0) return n; } catch {}
    const n = Number(q("#client")?.value);
    return n > 0 ? n : 198678;
  };
  const onHome = () => document.documentElement.dataset.view === "home";
  const kind = (f) => (SHEET.test(f.name) ? "sheet" : PRD.test(f.name) ? "prd" : "other");

  // ── picking files ─────────────────────────────────────────────────────────
  function add(list) {
    for (const f of list) {
      if (kind(f) === "other") { S.why = `"${f.name}" is not a sheet (.xlsx, .csv) or a PRD (.docx, .pdf, .md, .txt).`; continue; }
      // one sheet and one PRD: a second of the same kind replaces the first
      S.files = S.files.filter((x) => kind(x) !== kind(f)).concat(f);
      S.why = "";
    }
    paintPicked();
  }
  function paintPicked() {
    const el = q("#hu-picked");
    if (!el) return;
    el.hidden = !S.files.length && !S.why;
    const sheet = S.files.find((f) => kind(f) === "sheet"), prd = S.files.find((f) => kind(f) === "prd");
    const what = sheet && prd ? "Runs every case in the sheet, judged by the PRD." : sheet ? "Runs every case in the sheet, one by one." : prd ? "Writes the cases from the PRD only, then runs them." : "";
    el.innerHTML = `
      ${S.why ? `<p class="hu-msg bad">${h(S.why)}</p>` : ""}
      ${S.files.length ? `<ul class="hu-files">${S.files.map((f, i) => `<li><span class="hu-kind">${kind(f) === "sheet" ? "Sheet" : "PRD"}</span><span class="hu-name">${h(f.name)}</span><button type="button" class="hu-x" data-i="${i}" aria-label="Remove ${h(f.name)}">${icon("x")}</button></li>`).join("")}</ul>
      <div class="hu-go-row">
        <label class="hu-check"><input type="checkbox" id="hu-auto" ${S.autoRun ? "checked" : ""}> Start the run as soon as every case is read</label>
        <span class="hu-what">${h(what)}</span>
        <button type="button" class="home-start" id="hu-go" ${S.sending || busy() ? "disabled" : ""}>${S.sending ? "Uploading…" : "Test it"} <span class="home-start-arr" aria-hidden="true">→</span></button>
      </div>` : ""}`;
    el.querySelectorAll(".hu-x").forEach((b) => b.addEventListener("click", () => { S.files.splice(Number(b.dataset.i), 1); paintPicked(); }));
    q("#hu-auto", el)?.addEventListener("change", (e) => (S.autoRun = e.target.checked));
    q("#hu-go", el)?.addEventListener("click", send);
  }
  // a job that waits to be run ("ready") does not block a new upload; one that is working does
  const busy = () => S.job && !DONE.includes(S.job.stage) && S.job.stage !== "ready";

  async function b64(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function send() {
    if (!S.files.length || S.sending) return;
    S.sending = true; S.why = ""; paintPicked();
    try {
      const files = await Promise.all(S.files.map(async (f) => ({ name: f.name, data: await b64(f) })));
      const r = await fetch("/api/home/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files, companyId: clientId(), autoRun: S.autoRun }) }).then((x) => x.json()).catch(() => ({ why: "The upload did not reach the server." }));
      if (r.why) S.why = r.why;
      else { S.files = []; S.job = r.job; poll(); }
    } finally {
      S.sending = false; paintPicked(); paintJob();
    }
  }

  // ── the job ───────────────────────────────────────────────────────────────
  const STEPS = [
    ["reading", "Read the files"],
    ["writing", "Write cases from the PRD"],
    ["understanding", "Read every case"],
    ["running", "Run one by one"],
    ["done", "Report"],
  ];
  function stepState(job, key) {
    const idx = { reading: 0, writing: 1, understanding: 2, running: 3, done: 4 };
    if (key === "writing" && !job.written && job.stage !== "writing" && !(DONE.includes(job.stage) && !job.sheet)) return "skip";
    if (job.stage === "done") return "ok";
    const at = job.stage === "ready" ? 3 : DONE.includes(job.stage) ? (job.campaignId ? 3 : job.sheet ? 2 : 1) : idx[job.stage];
    const i = idx[key];
    if (i < at) return "ok";
    if (i > at) return "todo";
    return DONE.includes(job.stage) ? "bad" : job.stage === "ready" ? "todo" : "now";
  }
  const PILL = { Pass: "ok", Fail: "bad", "Partly checked": "warn", Blocked: "warn", "Not Run": "idle", "Couldn't tell": "idle" };

  function paintJob() {
    const el = q("#hu-job");
    if (!el) return;
    const j = S.job;
    el.hidden = !j;
    if (!j) return;
    const u = j.understood, run = j.run;
    const pct = run && run.total ? Math.round((run.done / run.total) * 100) : u && u.total ? Math.round((u.done / u.total) * 100) : 0;
    const title = j.stage === "failed" ? "It stopped with a problem" : j.stage === "stopped" ? "Stopped" : j.stage === "done" ? "Done" : j.stage === "ready" ? "Every case is read — ready to run" : j.stage === "running" ? `Running ${run ? `${Math.min(run.done + 1, run.total)} of ${run.total}` : ""}` : j.stage === "writing" ? "Writing cases from the PRD" : j.stage === "understanding" ? `Reading every case${u ? ` (${u.done} of ${u.total})` : ""}` : "Reading the files";
    const live = j.stage === "running";
    const opened = new Set([...el.querySelectorAll("details[open]")].map((d) => d.dataset.k));
    if (live && Date.now() - S.frameAt > 4000) S.frameAt = Date.now();
    el.innerHTML = `
      <div class="hu-head">
        <div class="hu-head-t"><b>${h(title)}</b><span>${h([j.sheet?.name, j.prd ? `PRD: ${j.prd.name}` : ""].filter(Boolean).join(" · "))}</span></div>
        <div class="hu-actions">
          ${j.stage === "ready" ? `<button type="button" class="home-start" id="hu-run">Run ${j.sheet?.count ?? ""} cases <span class="home-start-arr" aria-hidden="true">→</span></button>` : ""}
          ${!DONE.includes(j.stage) ? `<button type="button" class="hu-btn" id="hu-stop">Stop</button>` : ""}
          ${j.written ? `<a class="hu-btn" href="/api/home/job/cases?id=${encodeURIComponent(j.id)}">${icon("download")}Cases written</a>` : ""}
          ${run ? `<a class="hu-btn" href="${h(run.report)}" target="_blank" rel="noopener">Live report</a>` : ""}
          ${j.sheet && (run || j.stage === "ready") ? `<a class="hu-btn primary" href="/api/home/job/report?id=${encodeURIComponent(j.id)}">${icon("download")}Test cases + bugs (.xlsx)</a>` : ""}
          ${DONE.includes(j.stage) ? `<button type="button" class="hu-btn" id="hu-clear">New upload</button>` : ""}
        </div>
      </div>
      <ol class="hu-steps">${STEPS.map(([k, label]) => { const st = stepState(j, k); return st === "skip" ? "" : `<li class="is-${st}"><span class="hu-dot" aria-hidden="true"></span>${h(label)}</li>`; }).join("")}</ol>
      ${pct && (j.stage === "understanding" || j.stage === "running") ? `<div class="hu-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>` : ""}
      ${j.error ? `<p class="hu-msg bad">${h(j.error)}</p>` : ""}
      ${run ? `<div class="hu-counts">${Object.entries(run.counts).map(([k, v]) => `<span class="hu-pill ${PILL[k] || "idle"}">${v} ${h(k)}</span>`).join("")}${run.bugs ? `<span class="hu-pill bad">${run.bugs} bug${run.bugs === 1 ? "" : "s"}</span>` : ""}<span class="hu-sub">${run.done} of ${run.total} done</span></div>` : ""}
      ${live ? `<div class="hu-live"><img id="hu-frame" src="/api/sheets/campaign/frame?t=${S.frameAt}" alt="The browser the run is driving" onerror="this.hidden=true">${run?.current ? `<p><b>${h(run.current.caseId)}</b> ${h(run.current.title)}<span class="hu-sub">${h(run.current.module)}</span></p>` : ""}</div>` : ""}
      ${j.written ? `<p class="hu-sub">${j.sheet ? `${j.sheet.count} cases written` : "Cases"} for ${j.written.requirements} requirements, from the PRD only.${j.written.uncovered.length ? ` Not covered: ${h(j.written.uncovered.join("; "))}.` : ""}${j.written.questions.length ? ` ${j.written.questions.length} questions for the PM are in the cases file.` : ""}</p>` : ""}
      ${u?.blocked?.length ? `<details class="hu-list" data-k="blocked"><summary>${u.blocked.length} case${u.blocked.length === 1 ? "" : "s"} cannot run here — blocked</summary><ul>${u.blocked.map((b) => `<li><b>${h(b.id)}</b> ${h(b.title)}<span>${h(b.why)}</span></li>`).join("")}</ul></details>` : ""}
      ${u?.differs?.length ? `<details class="hu-list" data-k="differs"><summary>${u.differs.length} case${u.differs.length === 1 ? "" : "s"} differ from the PRD — judged by the PRD</summary><ul>${u.differs.map((b) => `<li><b>${h(b.id)}</b> ${h(b.title)}<span>${h(b.difference)}</span></li>`).join("")}</ul></details>` : ""}
      <ul class="hu-lines">${(j.lines || []).slice(-3).map((l) => `<li>${h(l)}</li>`).join("")}</ul>`;
    el.querySelectorAll("details").forEach((d) => (d.open = opened.has(d.dataset.k)));
    q("#hu-stop", el)?.addEventListener("click", async () => { await fetch("/api/home/job/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: j.id }) }); poll(); });
    q("#hu-run", el)?.addEventListener("click", async () => {
      const r = await fetch("/api/home/job/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: j.id }) }).then((x) => x.json()).catch(() => ({ why: "The server did not answer." }));
      if (r.why) { S.job = { ...j, error: r.why }; paintJob(); } else poll();
    });
    q("#hu-clear", el)?.addEventListener("click", () => { S.job = null; paintJob(); paintPicked(); });
  }

  async function poll() {
    clearTimeout(S.timer);
    const id = S.job?.id;
    const r = await fetch(`/api/home/job${id ? `?id=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.job) {
      // on first load, show the last upload only while it is going or for a day after it ended
      const fresh = id || !DONE.includes(r.job.stage) || Date.now() - Date.parse(r.job.endedAt || r.job.createdAt) < 86_400_000;
      if (fresh) S.job = r.job;
    }
    paintJob();
    paintPicked();
    // while a job runs, every 3 s; otherwise every 15 s, so a job started from another tab or the API shows up
    const wait = S.job && !DONE.includes(S.job.stage) ? 3000 : 15_000;
    S.timer = setTimeout(function again() { if (onHome() && document.visibilityState === "visible") poll(); else S.timer = setTimeout(again, wait); }, wait);
  }

  function init() {
    const drop = q("#hu-drop"), input = q("#hu-file");
    if (!drop || !input) return;
    input.addEventListener("change", () => { add([...input.files]); input.value = ""; });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (e) => add([...(e.dataTransfer?.files || [])]));
    poll();
    window.addEventListener("hashchange", () => { if (onHome()) poll(); });
  }
  init();
})();
