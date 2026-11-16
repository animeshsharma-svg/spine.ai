#!/usr/bin/env python3
"""Template Studio execution report: merges the 116 written cases with the API
run (api-results.json) and the UI run (ui-results.json) into
  test-cases/Template_Studio_Execution_Results.xlsx   (Results, Bugs, Summary)
  test-cases/template-studio-results/index.html       (+ shots/*.png) for the artifact
"""
import html, json, importlib.util, shutil, io, contextlib
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
EVD = HERE.parent / "prototype" / "data" / "evidence" / "template-studio"
OUTDIR = HERE / "template-studio-results"
OUTDIR.mkdir(exist_ok=True)
(OUTDIR / "shots").mkdir(exist_ok=True)

spec = importlib.util.spec_from_file_location("cases", HERE / "build-template-studio-cases.py")
mod = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()):
    spec.loader.exec_module(mod)
CASES = {c["id"]: c for c in mod.C}

api = json.load(open(EVD / "api-results.json"))
ui = json.load(open(EVD / "ui-results.json"))
EXTRA_TITLES = {
    "TS_A01": ("O. Robustness", "API: an unknown template type is refused"),
    "TS_A02": ("O. Robustness", "API: 'forms' sent as an object instead of a list"),
    "TS_A03": ("O. Robustness", "API: opening a template that does not exist"),
    "TS_A04": ("N. Vendor Onboarding — Buyer Form", "API: buyer form without inline_components"),
    "TS_A05": ("A. Opening Manage Templates and the list", "API: deleting the same template twice"),
    "TS_039B": ("F. Short Text / Long Text / Number settings", "API: bank validation saved with the IFSC input empty"),
    "TS_075B": ("I. Logic tab (conditional fields)", "API: a rule pointing at a field that does not exist"),
    "TS_079B": ("K. Save, reopen and the saved data", "API: template name empty or only spaces"),
}
ORDER = {"Fail": 0, "Couldn't tell": 1, "Record": 2, "Pass": 3, "Not run": 4}

runs = {}
for r in api["rows"]:
    runs.setdefault(r["id"], []).append({**r, "layer": "API", "shots": []})
for r in ui["rows"]:
    runs.setdefault(r["id"], []).append({**r, "layer": "UI"})

def combined(rs):
    if not rs: return "Not run"
    vs = [r["verdict"] for r in rs]
    real = [v for v in vs if v != "Not run"] or vs
    return min(real, key=lambda v: ORDER[v])

ids = list(CASES.keys()) + [i for i in runs if i not in CASES]
results = []
for i in ids:
    c = CASES.get(i)
    rs = runs.get(i, [])
    area, title = (c["area"], c["scenario"]) if c else EXTRA_TITLES.get(i, ("Extra", rs[0]["title"] if rs else i))
    if not rs:
        hits = [(h, line) for h in ui["rows"] for line in h["checks"] if f"({i}" in line or f"{i})" in line or f"{i}:" in line]
        if hits:
            ok_all = all(line.startswith("✔") for _, line in hits)
            host = hits[0][0]
            rs = [{"layer": "UI", "verdict": "Pass" if ok_all else ("Fail" if host["verdict"] == "Fail" else "Record"),
                   "checks": [f"checked inside {host['id']}:"] + [line for _, line in hits], "shots": host.get("shots", []), "evidence": []}]
    v = combined(rs)
    if not rs:
        why = "Not executed in this pass: " + ("needs a vendor-side onboarding event (see TS_089–096 notes)" if i in ("TS_089","TS_090","TS_091","TS_092","TS_093","TS_094","TS_095","TS_096","TS_110") else "covered by a neighbouring case or not reachable with the given session")
        rs_note = why
    else:
        rs_note = ""
    bugs = [r["bug"] for r in rs if r.get("bug")]
    actual = []
    for r in rs:
        actual.append(f"[{r['layer']}] {r['verdict']} — " + " ".join(x for x in r["checks"]))
    shots = [s for r in rs for s in r.get("shots", [])]
    ev = [e for r in rs for e in r.get("evidence", [])]
    results.append(dict(id=i, area=area, title=title, case=c, verdict=v, layers="+".join(sorted({r["layer"] for r in rs})) or "—",
                        actual="\n".join(actual) or rs_note, bugs=bugs, shots=shots, evidence=ev,
                        p=(c["p"] if c else "P1"), sev=(c["sev"] if c else "High")))

# copy screenshots
for r in results:
    for s in r["shots"]:
        src = EVD / "ui" / s
        if src.exists(): shutil.copy(src, OUTDIR / "shots" / s)

# bug list — curated: one bug per problem, screen + API evidence together
ev_of = lambda *ids: [e for r in results if r["id"] in ids for e in r["evidence"]][:4]
sh_of = lambda *ids: [s for r in results if r["id"] in ids for s in r["shots"]][:3]
BUGS = [
 dict(sev="High", cases=["TS_019"], title="A section with no fields makes Save fail with 'Internal Server Error'",
      steps="Manage Templates → New Template → Vendor Onboarding. Name the template. Add one Short Text field in Section 1. Click '+ Section' (Section 2 stays empty). Click Save.",
      expected="The studio stops before saving and says which section is empty (or the server answers 'Invalid Form').",
      actual="The studio sends it; the server crashes (HTTP 500) and the user sees two red toasts 'Internal Server Error' and 'Failed to save template', with no hint that the empty Section 2 is the cause. Reproduced twice by API too."),
 dict(sev="High", cases=["TS_020"], title="A blank section name makes Save fail with 'Internal Server Error'",
      steps="New Template → Vendor Onboarding. Name the template, add one field, clear the section name box ('Section 1'). Click Save.",
      expected="'Section name is required' (studio) or a clear 422 from the server.",
      actual="The studio sends it; the server crashes (HTTP 500: the form check raises InvalidFormDataError, which is not rescued). The user sees 'Internal Server Error' + 'Failed to save template'."),
 dict(sev="High", cases=["TS_099", "TS_100"], title="'Generate with AI' never works — the AI endpoint does not exist on this backend",
      steps="New Template → on the Vendor Onboarding card click 'Generate with AI' → upload any valid PDF / JPG / Excel under 10 MB.",
      expected="'AI is reading your form…', then the editor opens with a drafted template.",
      actual="The studio posts to /ask_ai_chats/vendor_onboarding_template_draft and the backend behind console.ag-ri.in answers 404 'Route you are looking for doesn't exists'. The user sees 'Could not reach the AI service. Please try again.' for every file."),
 dict(sev="High", cases=["TS_039", "TS_039B"], title="Bank-account validation can be saved without an IFSC field",
      steps="Vendor Onboarding editor → Short Text 'Account number' → Validations → + External → Bank Account. Leave the 'ifsc' row empty. Save.",
      expected="Save is refused until both inputs (account number and IFSC) point at a field.",
      actual="'Template created successfully'. The stored rule is 'validation_type=bank#bank_account_no={{account_number}}&ifsc={{}}' — on the vendor form the bank check would run with no IFSC. The backend also accepts it."),
 dict(sev="Medium", cases=["TS_029"], title="The backend accepts two fields with the same key in one template",
      steps="POST /templates (vendor onboarding) with two fields both keyed 'pan_no' (Postman / any caller other than the studio).",
      expected="422 — keys must be unique, as the studio enforces ('Duplicate field key: pan_no').",
      actual="HTTP 200, saved. Only the studio's own check prevents it; any other caller can save a form whose answers overwrite each other."),
 dict(sev="Medium", cases=["TS_A01"], title="An unknown template type crashes the server",
      steps="POST /templates with template_for ['banana'].", expected="422 'invalid template type'.", actual="HTTP 500 Internal Server Error."),
 dict(sev="Medium", cases=["TS_A02"], title="'forms' sent as an object instead of a list crashes the server",
      steps="POST /templates with forms: { order: 1 } (an object).", expected="422 'Invalid Form'.", actual="HTTP 500 Internal Server Error."),
 dict(sev="Low", cases=["TS_079B"], title="The backend saves a template with an empty name or only spaces",
      steps="POST /templates with name '' and with name '   '.", expected="422 — the studio itself requires a name ('Template name is required').",
      actual="HTTP 200 both times; nameless templates would show as blank rows in Manage Templates."),
 dict(sev="Low", cases=["TS_A04"], title="A raw Ruby error text is shown to the caller",
      steps="POST /templates for a buyer form without widgets.inline_components.", expected="A readable 422 message.",
      actual="422 with the message 'no implicit conversion of nil into Array' (internal error text)."),
]
for n, b in enumerate(BUGS, 1):
    b["id"] = f"TSB-{n:02d}"; b["evidence"] = ev_of(*b["cases"]); b["shots"] = sh_of(*b["cases"]); b["text"] = b["title"]
bug_rows = BUGS
OBS = [r for r in results if r["verdict"] == "Record"]

tally = {}
for r in results: tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1

# ── Excel ──
wb = openpyxl.Workbook()
HDR = PatternFill("solid", fgColor="1F3A5F")
FILL = {"Pass": "D9F2E3", "Fail": "F8D7D3", "Record": "FFF1CC", "Couldn't tell": "E8E3F5", "Not run": "ECEFF1"}
ws = wb.active; ws.title = "Results"
hdr = ["Scenario ID", "Area", "Test Scenario", "Test Case Description", "Test Data", "Expected Result", "Priority", "Severity", "Status", "Run on", "Actual result (what happened)", "Bug", "Screenshots"]
ws.append(hdr)
for r in results:
    c = r["case"] or {}
    ws.append([r["id"], r["area"], r["title"], c.get("desc", ""), c.get("data", ""), c.get("expected", ""), r["p"], r["sev"], r["verdict"], r["layers"], r["actual"],
               "\n".join(f"{b['id']} {b['title']}" for b in bug_rows if r["id"] in b["cases"]), ", ".join(r["shots"])])
    ws.cell(ws.max_row, 9).fill = PatternFill("solid", fgColor=FILL.get(r["verdict"], "FFFFFF"))
for i, w in enumerate([11, 26, 40, 40, 34, 60, 8, 9, 12, 9, 80, 50, 24], 1): ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = HDR; cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
wb2 = wb.create_sheet("Bugs", 1); wb2.append(["Bug ID", "Severity", "Title", "Steps to reproduce", "Expected", "Actual", "Cases", "Screenshots", "API evidence"])
for b in bug_rows: wb2.append([b["id"], b["sev"], b["title"], b["steps"], b["expected"], b["actual"], ", ".join(b["cases"]), ", ".join(b["shots"]), "\n\n".join(b["evidence"])[:3000]])
for i, w in enumerate([9, 9, 46, 60, 40, 60, 14, 26, 80], 1): wb2.column_dimensions[get_column_letter(i)].width = w
for cell in wb2[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = HDR
for row in wb2.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
wo = wb.create_sheet("Observations", 2); wo.append(["Case", "What the app does (for product to decide)", "Screenshots"])
for r in OBS: wo.append([r["id"], r["title"] + "\n" + r["actual"], ", ".join(r["shots"])])
wo.column_dimensions["A"].width = 10; wo.column_dimensions["B"].width = 120; wo.column_dimensions["C"].width = 30
for cell in wo[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = HDR
for row in wo.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
s3 = wb.create_sheet("Summary", 0)
s3.append(["Template Studio — execution on console.ag-ri.in (Admin Controls → Manage Templates)"]); s3.append([])
s3.append(["Company", api.get("company")]); s3.append(["Backend", api.get("api")]); s3.append(["API run", api.get("at")]); s3.append(["UI run", ui.get("at")]); s3.append([])
for k in ["Pass", "Fail", "Record", "Couldn't tell", "Not run"]: s3.append([k, tally.get(k, 0)])
s3.append(["Total cases", len(results)]); s3.append(["Bugs", len(bug_rows)])
s3.append([]); s3.append(["'Record' = the app did something the written case left to product to decide; what it did is in 'Actual result'."])
s3.column_dimensions["A"].width = 30; s3.column_dimensions["B"].width = 60; s3["A1"].font = Font(bold=True, size=13)
XLSX = HERE / "Template_Studio_Execution_Results.xlsx"
wb.save(XLSX)

# ── HTML ──
esc = lambda s: html.escape(str(s)).replace("\n", "<br>")
def pill(v): return f'<span class="v v-{v.replace(chr(39),"").replace(" ","-").lower()}">{esc(v)}</span>'
bugs_html = "".join(
    f'<article class="bug"><header><span class="bid">{b["id"]}</span><span class="sev s-{b["sev"].lower()}">{b["sev"]}</span><b>{esc(b["title"])}</b><span class="cases">{", ".join(b["cases"])}</span></header>'
    f'<dl><dt>Steps</dt><dd>{esc(b["steps"])}</dd><dt>Expected</dt><dd>{esc(b["expected"])}</dd><dt>Actual</dt><dd>{esc(b["actual"])}</dd></dl>'
    + "".join(f'<a href="shots/{x}" target="_blank"><img src="shots/{x}" alt="{x}" loading="lazy"></a>' for x in b["shots"])
    + (f'<details><summary>API evidence</summary><pre>{esc(chr(10).join(b["evidence"])[:4000])}</pre></details>' if b["evidence"] else "")
    + "</article>" for b in bug_rows)
obs_html = "".join(f'<li><b>{esc(r["id"])} · {esc(r["title"])}</b><br><span class="sub">{esc(r["actual"][:600])}</span></li>' for r in OBS)
areas = []
for r in results:
    if r["area"] not in areas: areas.append(r["area"])
sec = ""
for a in areas:
    rs = [r for r in results if r["area"] == a]
    cnt = {k: sum(1 for r in rs if r["verdict"] == k) for k in ORDER}
    trs = ""
    for r in rs:
        c = r["case"] or {}
        thumbs = "".join(f'<a href="shots/{s}" target="_blank"><img src="shots/{s}" alt="" loading="lazy"></a>' for s in r["shots"][:3])
        ev = f'<details><summary>API evidence</summary><pre>{esc(chr(10).join(r["evidence"])[:5000])}</pre></details>' if r["evidence"] else ""
        trs += (f'<tr class="row-{r["verdict"].replace(chr(39),"").replace(" ","-").lower()}"><td class="id">{esc(r["id"])}<div class="lay">{esc(r["layers"])}</div></td>'
                f'<td><b>{esc(r["title"])}</b><div class="sub">{esc(c.get("desc",""))}</div><div class="exp"><b>Expected:</b> {esc(c.get("expected",""))}</div></td>'
                f'<td>{pill(r["verdict"])}</td><td class="act">{esc(r["actual"])}{ev}</td><td class="th">{thumbs}</td></tr>')
    summary = " · ".join(f"{v} {k}" for k, v in cnt.items() if v)
    sec += f'<details class="mod"{" open" if cnt["Fail"] else ""}><summary><span>{esc(a)}</span><span class="cnt">{len(rs)} cases · {summary}</span></summary><div class="tw"><table><thead><tr><th>ID</th><th>Case</th><th>Result</th><th>What happened</th><th>Screens</th></tr></thead><tbody>{trs}</tbody></table></div></details>'
facts = "".join(f'<div class="fact f-{k.replace(chr(39),"").replace(" ","-").lower()}"><b>{tally.get(k,0)}</b><span>{k}</span></div>' for k in ["Pass", "Fail", "Record", "Couldn't tell", "Not run"])
page = f"""<title>Template Studio Test Run</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: verdict strip, bugs with screenshots, then one collapsible table per area */
:root{{--bg:#f6f7f5;--paper:#fff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--soft:#eef2f7;--pass:#1d7a4f;--pass-bg:#e3f4ea;--fail:#b3261e;--fail-bg:#fbe5e2;--rec:#8a5a00;--rec-bg:#fff3d6;--ct:#5b4a9e;--ct-bg:#ece8f8;--nr:#5d6a63;--nr-bg:#eceff1;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--soft:#232b33;--pass:#7fd3a5;--pass-bg:#1d3a2b;--fail:#ff9a8f;--fail-bg:#45201c;--rec:#f3c66b;--rec-bg:#3d3018;--ct:#c4b5fd;--ct-bg:#2e2747;--nr:#a3ada7;--nr-bg:#2a3136;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--soft:#232b33;--pass:#7fd3a5;--pass-bg:#1d3a2b;--fail:#ff9a8f;--fail-bg:#45201c;--rec:#f3c66b;--rec-bg:#3d3018;--ct:#c4b5fd;--ct-bg:#2e2747;--nr:#a3ada7;--nr-bg:#2a3136;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.5;padding-block:28px;padding-inline:max(16px,3vw)}}
main{{max-width:1360px;margin:0 auto;display:grid;gap:22px}}
h1{{font-size:1.8rem;margin:0 0 6px}} h2{{font-size:1.2rem;margin:0 0 10px}}
.lead{{color:var(--muted);max-width:80ch;margin:0}} .eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:18px 20px}}
.facts{{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}} .fact{{border-radius:8px;padding:10px 16px;min-width:110px}} .fact b{{font-size:1.5rem;display:block;font-variant-numeric:tabular-nums}} .fact span{{font-size:.85rem}}
.f-pass{{background:var(--pass-bg);color:var(--pass)}} .f-fail{{background:var(--fail-bg);color:var(--fail)}} .f-record{{background:var(--rec-bg);color:var(--rec)}} .f-couldnt-tell{{background:var(--ct-bg);color:var(--ct)}} .f-not-run{{background:var(--nr-bg);color:var(--nr)}}
.bugs{{display:grid;gap:12px}} .bug{{border:1px solid var(--line);border-left:4px solid var(--fail);border-radius:8px;padding:12px 14px}} .bug header{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}} .bid{{font-family:var(--mono);font-weight:600}} .cases{{font-family:var(--mono);font-size:.8rem;color:var(--muted)}}
.bug p{{margin:6px 0}} .bug img{{max-width:min(420px,100%);border:1px solid var(--line);border-radius:6px;margin:4px 8px 0 0}}
.sev{{font-size:.75rem;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor}} .s-critical{{color:var(--fail)}} .s-high{{color:var(--rec)}} .s-medium{{color:var(--ct)}}
details.mod{{background:var(--paper);border:1px solid var(--line);border-radius:10px}} details.mod>summary{{cursor:pointer;padding:13px 18px;font-weight:600;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}} .cnt{{font-family:var(--mono);font-size:.8rem;color:var(--muted);font-weight:400}}
.tw{{overflow-x:auto;border-top:1px solid var(--line)}} table{{border-collapse:collapse;width:100%;min-width:1100px;font-size:.85rem}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}} th{{background:var(--soft)}}
td.id{{font-family:var(--mono);white-space:nowrap}} .lay{{font-size:.72rem;color:var(--muted)}} .sub{{color:var(--muted);font-size:.82rem;margin-top:3px}} .exp{{font-size:.82rem;margin-top:4px}}
td.act{{white-space:normal;font-size:.82rem;max-width:520px}} td.th img{{width:150px;border:1px solid var(--line);border-radius:4px;margin:0 4px 4px 0}}
.v{{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.78rem;font-weight:600;white-space:nowrap}} .v-pass{{background:var(--pass-bg);color:var(--pass)}} .v-fail{{background:var(--fail-bg);color:var(--fail)}} .v-record{{background:var(--rec-bg);color:var(--rec)}} .v-couldnt-tell{{background:var(--ct-bg);color:var(--ct)}} .v-not-run{{background:var(--nr-bg);color:var(--nr)}}
pre{{white-space:pre-wrap;font-family:var(--mono);font-size:.75rem;background:var(--soft);padding:8px;border-radius:6px;max-height:320px;overflow:auto}}
ul.tight{{margin:6px 0;padding-left:20px}} ul.obs{{margin:6px 0;padding-left:20px;display:grid;gap:8px}} dl{{display:grid;grid-template-columns:90px 1fr;gap:4px 12px;margin:8px 0}} dt{{font-weight:600;color:var(--muted)}} dd{{margin:0}} .bug header b{{flex:1 1 300px}}
</style>
<main>
<header>
  <div class="eyebrow">console.ag-ri.in · Admin Controls → Manage Templates · {esc(api.get('company'))} · backend {esc(api.get('api'))} · {esc(ui.get('at','')[:16].replace('T',' '))} UTC</div>
  <h1>Template Studio Test Run</h1>
  <p class="lead">The 116 Template Studio cases (Vendor Onboarding and Vendor Onboarding — Buyer Form) executed on the screen and against the API behind it, plus 8 API-only checks. Every template created by the run was named "QA_Platform TS…" and deleted at the end; nothing else in the company was changed.</p>
  <div class="facts">{facts}</div>
</header>
<section><h2>Bugs found ({len(bug_rows)})</h2><div class="bugs">{bugs_html}</div></section>
<section><h2>Observations for product ({len(OBS)})</h2><p class="lead">Not bugs until product decides — what the app does today where the case left the rule open.</p><ul class="obs">{obs_html}</ul></section>
<section><h2>How it was run</h2><ul class="tight">
<li><b>Screen:</b> Chromium (Playwright) signed in on console.ag-ri.in with the session provided, company {esc(api.get('company'))}; Admin Controls → Manage Templates, then every case by clicking as a user would. A screenshot per case.</li>
<li><b>API:</b> the same requests the studio sends (POST/PATCH/DELETE /templates, data sources, AI draft), each saved template read back field by field.</li>
<li><b>Record</b> = the app did something the case leaves to product (for example: no confirmation before deleting a section). <b>Not run</b> = needs something the session could not provide (a vendor filling the form on a live onboarding event, a read-only user, a v3 company).</li>
</ul></section>
{sec}
</main>
"""
(OUTDIR / "index.html").write_text(page)
print(f"{len(results)} cases {tally} · {len(bug_rows)} bugs → {XLSX.name}, {OUTDIR.name}/index.html")
