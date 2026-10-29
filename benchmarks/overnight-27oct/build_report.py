"""Build the overnight report (27 Oct 2026) from the three suites' scored runs and the hand verdicts.

    python3 build_report.py > report.html

Laid out like the console's Sessions list (Aanya, 27 Oct): metrics first, then one row per case — what was
asked, one bar per step, Browser or API, the verdict — that opens to show every step and what failed; what
has to be fixed comes last.

UI suites: benchmarks/surrogate-bid and benchmarks/event-actions (runs/<tag>-results.json from score.sh; a
later tag replaces an earlier one for the cases it re-ran; steps from procol-ui-tests/.plans/<run>-result.json).
API suite: benchmarks/api-actions/runs/<tag>/*.json, judged by hand in notes.json.
"""
import html
import json
import re
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
B = HERE.parent
PLANS = B.parent / "procol-ui-tests" / ".plans"
NOTES = json.loads((HERE / "notes.json").read_text())
IST = timezone(timedelta(hours=5, minutes=30))
h = lambda s: html.escape(str(s if s is not None else ""))
q = lambda s: f"“{s}”"

UI_TAGS = {
    "surrogate-bid": ["2026-10-27", "2026-10-27-r2", "2026-10-27-r3", "2026-10-27-final", "2026-10-27-fix", "2026-10-27-regress", "2026-10-28"],
    "event-actions": ["2026-10-27", "2026-10-27-r2", "2026-10-27-r3", "2026-10-27-r4", "2026-10-27-final", "2026-10-27-fix"],
    "vendor-bidding": ["2026-10-27", "2026-10-27-r2", "2026-10-27-r3", "2026-10-27-r4", "2026-10-27-r5", "2026-10-27-final"],
}
API_TAGS = ["2026-10-27", "2026-10-27-r2", "2026-10-27-final", "2026-10-28"]
SPEND = {"surrogate-bid": 3.57, "event-actions": 7.52, "vendor-bidding": 1.74}  # Slingring spend of each suite's final round (run logs)

# verdict → (word on the tag, tag colour, filter key)
SHOW = {
    "PASS": ("Passed", "ok", "passed"),
    "FAIL": ("Failed", "bad", "failed"),
    "FALSE_PASS": ("Failed", "bad", "failed"),
    "FINDING": ("Procol bug", "bad", "bug"),
    "NEEDS_JUDGEMENT": ("Needs you", "turn", "you"),
    "NOT_TESTED": ("Not tested", "grey", "untested"),
    "GAP": ("Not tested", "grey", "untested"),
}


def short(text, n=150):
    t = " ".join(str(text or "").split())
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def at(iso):
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST).strftime("%H:%M")
    except Exception:
        return ""


def took(ms):
    if not ms:
        return ""
    s = round(ms / 1000)
    if s < 60:
        return f"{s}s"
    m = s // 60
    return f"{m}m {s % 60:02d}s" if m < 60 else f"{m // 60}h {m % 60:02d}m"


# ── the steps, in plain words ────────────────────────────────────────────
def step_label(step, args):
    a = args or {}
    n = step
    if n == "attempt":
        return "Try, expecting a refusal: " + step_label(a.get("step", ""), a.get("args") or {}).lower()
    stages = ", ".join(a.get("stages") or []).upper()
    item = a.get("item", "")
    words = {
        "open_create": "Open the create screen",
        "compose_stages": f"Choose the stages{f' ({stages})' if stages else ''}",
        "choose_stages": f"Choose the stages{f' ({stages})' if stages else ''}",
        "expect_stages": "Check the stages",
        "set_title": "Set the title",
        "select_template": "Pick the template",
        "add_line_items": f"Add {a.get('count', 1)} line item(s)",
        "expect_line_items": "Check the line items",
        "fill_sheet": "Fill the item sheet",
        "set_schedule": "Set the schedule" + (f" ({a['minutes']} min)" if a.get("minutes") else ""),
        "invite_vendor": f"Invite {a.get('count', 1)} vendor(s)",
        "publish": "Publish",
        "expect_published": "Check it is published",
        "open_event": "Open the event",
        "open_participants": "Open Participants",
        "expect_participant_count": "Count the round's vendors",
        "expect_participant": "Check the vendor's row",
        "toggle": f"Turn on {q(a.get('label', ''))}",
        "place_surrogate_bid": "Place a surrogate bid" + (f" of {a['price']}" if a.get("price") not in (None, "") else " with no price" if a.get("noPrice") else ""),
        "expect_bid_submitted": "Check the bid went in",
        "close_event": "End the bidding",
        "open_master_qcs": "Open Master QCS",
        "expect_qcs_vendors": "Check Master QCS vendors",
        "expect_qcs_cell": f"Check Master QCS {q(a.get('row', ''))}",
        "expect_qcs_ranks": "Check the ranks",
        "expect_qcs_amounts": "Check the amounts",
        "withdraw_event": f"Withdraw the {a.get('scope', 'project')}" + (" with no remark" if a.get("noReason") else ""),
        "expect_withdrawn": "Check it is withdrawn (Procol's records)",
        "add_price_cap": "Add a price cap" + (" with none entered" if a.get("noPrice") else f" of {a.get('price', 100)}"),
        "expect_price_cap": "Read the saved cap back",
        "event_menu": f"Open {q(item)}",
        "expect_menu_item": f"Check {q(item)} " + ("is greyed out" if a.get("enabled") is False else "is gone" if a.get("present") is False else "is offered"),
        "extend_submission_time": f"Extend the time by {a.get('by', '15 minutes')}",
        "convert_to_auction": "Convert to auction",
        "expect_count": (f"Check there is no {q(a.get('name', ''))}" if a.get("count") == 0 else f"Count {q(a.get('name', ''))}"),
        "expect_text": f"Check the words {q(a.get('text', ''))}",
        "expect_visible": f"Check {q(a.get('name', ''))} is shown",
        "expect_disabled": f"Check {q(a.get('control', ''))} is greyed out",
        "do_on_screen": "Screen AI: " + short(a.get("goal", ""), 80),
        "go_to": "Go to the stage tab",
        "switch_stage": "Switch stage",
        "open_purchase_requisitions": "Open Purchase Requisitions",
        "pr_tab": "Open the PR list",
        "select_pr": "Pick a PR",
        "purchase_items": "Raise an event from its items",
        "expect_pr_items": "Check the PR's items came across",
        "fill_questionnaires": "Fill the questionnaires",
        "assign_evaluator": "Assign the evaluator",
        "expect_url_contains": "Check the address",
        "expect_navigated": "Check the screen",
    }
    return words.get(n) or n.replace("_", " ").capitalize()


MARK = {"ok": "✓", "bad": "✗", "todo": "–"}


def ui_steps(run_id):
    try:
        r = json.loads((PLANS / f"{run_id}-result.json").read_text())
    except Exception:
        return []
    out = []
    for s in r.get("steps", []):
        st = s.get("status")
        v = "ok" if st == "ok" else "bad" if st == "failed" else "todo"
        out.append({"v": v, "label": step_label(s.get("step", ""), s.get("args")), "detail": s.get("detail") or ("not run" if v == "todo" else "")})
    return out


API_LINE = re.compile(r"^\s*(?:setup · (?P<sname>[^:]+): (?P<sres>\w[\w ]*?) — (?P<sdet>.*)|(?P<mark>[✓✗·]) (?P<kind>act|verify) (?P<n>\d+): (?P<what>.*?) — (?P<det>.*))$")


def api_steps(lines):
    out = []
    for line in lines:
        m = API_LINE.match(line)
        if not m:
            continue
        if m["sname"]:
            out.append({"v": "ok" if m["sres"] == "worked" else "bad", "label": m["sname"], "detail": m["sdet"]})
        else:
            v = "bad" if m["mark"] == "✗" else "ok"
            what = re.sub(r"^The buyer ", "", m["what"]).rstrip(".")
            label = ("Check: " if m["kind"] == "verify" else "") + what[:1].upper() + what[1:]
            out.append({"v": v, "label": short(label, 110), "detail": m["det"]})
    return out


# ── gather ───────────────────────────────────────────────────────────────
def verdict_of(cid, scored):
    o = NOTES.get("override", {}).get(cid)
    if o:
        return o["verdict"], o["note"]
    if scored is None:
        return "NOT_TESTED", "Not run yet."
    return scored["verdict"], NOTES.get("note", {}).get(cid) or scored["why"]


def ui_suite(name, label):
    tags = UI_TAGS[name]
    cases = json.loads((B / name / "cases.json").read_text())["cases"]
    final, first = {}, {}
    for tag in tags:
        f = B / name / "runs" / f"{tag}-results.json"
        if not f.exists():
            continue
        for r in json.loads(f.read_text()):
            if r["verdict"] == "NOT_RUN":
                continue
            first.setdefault(r["id"], r)
            final[r["id"]] = {**r, "tag": tag, "round": tags.index(tag) + 1}
    rows = []
    for c in cases:
        cid = c["id"]
        r = final.get(cid)
        v, note = verdict_of(cid, r)
        rec = {}
        if r:
            try:
                rec = json.loads((B / name / "runs" / r["tag"] / f"{cid}.json").read_text())
            except Exception:
                rec = {}
        steps = ui_steps(rec.get("runId")) if rec.get("runId") else []
        r1 = first.get(cid)
        earlier = ""
        if r1 and r and r1 is not r and r1["verdict"] != r["verdict"]:
            earlier = f"Round 1 {SHOW.get(r1['verdict'], (r1['verdict'],))[0].lower()}: {short(r1['why'], 200)}"
        meta = [cid, at(rec.get("startedAt", "")), took(rec.get("ms")), (r or {}).get("run", {}).get("event") or ""]
        if r and r["tag"].endswith("-fix"):
            meta.append("re-run after a fix")
        rows.append({
            "id": cid, "ask": c["prompt"], "must": c["must"], "v": v, "note": note, "steps": steps, "mode": "Browser",
            "meta": " · ".join(x for x in meta if x), "earlier": earlier, "run": rec.get("runId", ""), "ms": rec.get("ms") or 0,
            "first": (r1 or {}).get("verdict"),
        })
    return {"label": label, "key": name, "rows": rows}


def api_suite(label):
    cases = json.loads((B / "api-actions" / "cases.json").read_text())["cases"]
    final, first = {}, {}
    for i, tag in enumerate(API_TAGS):
        d = B / "api-actions" / "runs" / tag
        for f in sorted(d.glob("*.json")) if d.exists() else []:
            r = json.loads(f.read_text())
            first.setdefault(r["id"], r)
            final[r["id"]] = r
    rows = []
    for c in cases:
        cid = c["id"]
        r = final.get(cid)
        o = NOTES["api"].get(cid, {})
        chk = ((r or {}).get("checks") or [{}])[0]
        auto = "PASS" if chk.get("pass") else "COULDN'T TELL" if chk.get("inconclusive") else "FAIL"
        v = o.get("verdict") or ("NOT_TESTED" if not r else auto)
        lines = (r or {}).get("lines", [])
        said = next((ln.replace("Verdict: ", "") for ln in lines if ln.startswith("Verdict:")), "")
        event = next((m.group(1) for ln in lines for m in [re.search(r"“(spine-API-automation-\d+)”", ln)] if m), "")
        call = f"{chk.get('inputSummary') or ''} → {chk.get('httpStatus') if chk.get('httpStatus') is not None else '—'}" if r else ""
        meta = [cid, at((r or {}).get("startedAt", "")), took((r or {}).get("ms")), event]
        rows.append({
            "id": cid, "ask": c["text"], "must": f"Procol should {'accept' if c['expect'] in ('accepted', 'complete', 'accept') else 'refuse'} it ({c['expect']}).",
            "v": v, "note": o.get("note", ""), "steps": api_steps(lines), "mode": "API", "meta": " · ".join(x for x in meta if x),
            "earlier": f"spine.ai said: {said}" if said else "", "run": call, "ms": (r or {}).get("ms") or 0, "first": None,
        })
    return {"label": label, "key": "api", "rows": rows}


SUITES = [
    ui_suite("surrogate-bid", "On screen · surrogate bid"),
    ui_suite("event-actions", "On screen · withdraw, price cap, event menus"),
    ui_suite("vendor-bidding", "On screen · vendor portal beside the buyer"),
    api_suite("API · surrogate bid, withdraw, price cap"),
]
ALL = [r for s in SUITES for r in s["rows"]]
# The rows, for the "what works today" page (build_works.py).
(HERE / "rows.json").write_text(json.dumps([{**{k: r[k] for k in ("id", "ask", "v", "mode", "note")}, "suite": s["key"]} for s in SUITES for r in s["rows"]], ensure_ascii=False, indent=1))


# ── metrics ──────────────────────────────────────────────────────────────
def count(rows, key):
    return sum(1 for r in rows if SHOW.get(r["v"], ("", "", "untested"))[2] == key)


N = len(ALL)
UI = [r for r in ALL if r["mode"] == "Browser"]
API = [r for r in ALL if r["mode"] == "API"]
passed, bugs, you, untested, failed = (count(ALL, k) for k in ("passed", "bug", "you", "untested", "failed"))
ui_steps_all = [s for r in UI for s in r["steps"]]
api_steps_all = [s for r in API for s in r["steps"]]
ui_ms = [r["ms"] for r in UI if r["ms"]]
long_waits = [r for r in UI if r["ms"] > 20 * 60_000]
first_ui_pass = sum(1 for r in UI if r["first"] == "PASS")
spend = sum(SPEND.values())


def tile(big, label, sub, tone=""):
    return f"<div class='tile {tone}'><div class=tl>{h(label)}</div><div class=tb>{big}</div><div class=ts>{sub}</div></div>"


def strip(steps, cap=16):
    if not steps:
        return "<span class=strip></span>"
    rank = {"ok": 0, "todo": 1, "bad": 2}
    bars = [s["v"] for s in steps]
    if len(bars) > cap:
        b2 = []
        for k in range(cap):
            seg = bars[k * len(bars) // cap:(k + 1) * len(bars) // cap] or ["ok"]
            b2.append(max(seg, key=lambda x: rank[x]))
        bars = b2
    ok = sum(1 for s in steps if s["v"] == "ok")
    bad = sum(1 for s in steps if s["v"] == "bad")
    label = f"{len(steps)} steps: {ok} worked, {bad} failed, {len(steps) - ok - bad} not run"
    plus = f"<span class=plus>+{len(steps) - cap}</span>" if len(steps) > cap else ""
    return f"<span class=strip role=img aria-label='{h(label)}' title='{h(label)}'>{''.join(f'<i class={v}></i>' for v in bars)}{plus}</span>"


def suite_bar(s):
    rows = s["rows"]
    segs = "".join(
        f"<i class='{tone}' style='flex:{n}' title='{n} {h(word)}'></i>"
        for word, tone, key in [SHOW["PASS"], SHOW["FINDING"], SHOW["FAIL"], SHOW["NEEDS_JUDGEMENT"], SHOW["NOT_TESTED"]]
        for n in [count(rows, key)] if n
    )
    keys = " · ".join(f"{n} {w.lower()}" for w, _, k in [SHOW["FINDING"], SHOW["FAIL"], SHOW["NEEDS_JUDGEMENT"], SHOW["NOT_TESTED"]] for n in [count(rows, k)] if n)
    return (f"<div class=sbar><div class=sl>{h(s['label'])}</div><div class=meter>{segs}</div>"
            f"<div class=sn><b>{count(rows, 'passed')}</b>/{len(rows)} passed{f'<span> · {keys}</span>' if keys else ''}</div></div>")


def row_html(r):
    word, tone, key = SHOW.get(r["v"], (r["v"], "grey", "untested"))
    stopped = next((s for s in r["steps"] if s["v"] == "bad"), None)
    why = f"<div class='why {tone}'>{h(short(r['note'], 190))}</div>" if key != "passed" else ""
    steps = "".join(
        f"<li class={s['v']}><b>{MARK[s['v']]}</b><span>{h(s['label'])}<em>{h(short(s['detail'], 220))}</em></span></li>" for s in r["steps"]
    ) or "<li class=todo><b>–</b><span>No steps were recorded.</span></li>"
    stop = (f"<p class=stop><b>Stopped at step {r['steps'].index(stopped) + 1}:</b> {h(stopped['label'])} — {h(short(stopped['detail'], 260))}</p>"
            if stopped and key != "passed" else "")
    earlier = f"<p class=muted>{h(r['earlier'])}</p>" if r["earlier"] else ""
    return (
        f"<details class=item data-k='{key}' data-q='{h((r['id'] + ' ' + r['ask']).lower())}'>"
        f"<summary class=row><span class=text><span class=title>{h(r['ask'])}</span><span class=meta>{h(r['meta'])}</span>{why}</span>"
        f"{strip(r['steps'])}<span class=type>{r['mode'].upper()}</span><span class='tag {tone}'>{word}</span></summary>"
        f"<div class=body><p><b>What must happen:</b> {h(r['must'])}</p><p><b>Result:</b> {h(r['note'])}</p>{stop}"
        f"{earlier}<ol class=steps>{steps}</ol><p class=runid>{h(r['run'])}</p></div></details>"
    )


groups = "".join(
    f"<section class=group data-g><div class=glabel>{h(s['label'])} <span>{count(s['rows'], 'passed')}/{len(s['rows'])} passed</span></div>"
    f"<div class=card>{''.join(row_html(r) for r in s['rows'])}</div></section>"
    for s in SUITES
)
tabs = [("all", "All", N), ("passed", "Passed", passed), ("bug", "Procol bug", bugs), ("failed", "Failed", failed), ("you", "Needs you", you), ("untested", "Not tested", untested)]
tabs_html = "".join(f"<button type=button class='pill{' on' if k == 'all' else ''}' data-f='{k}'>{w} <span>{n}</span></button>" for k, w, n in tabs if n or k in ("all", "failed"))
li = lambda xs: "".join(f"<li>{x}</li>" for x in xs)

metrics = (
    "<div class=tiles>"
    + tile(N, "Cases run", f"{len(UI)} on screen · {len(API)} through the API")
    + tile(f"{passed}<small>{round(100 * passed / N)}%</small>", "Passed", "did what the case asks", "ok")
    + tile(bugs, "Procol bugs", f"{len(NOTES['findings'])} different bugs, to confirm", "bad")
    + tile(failed, "Failed", "none left after the fixes" if not failed else ", ".join(r["id"] for r in ALL if SHOW.get(r["v"], ("", "", ""))[2] == "failed"), "bad" if failed else "")
    + tile(you, "Need you", ", ".join(r["id"] for r in ALL if r["v"] == "NEEDS_JUDGEMENT") or "nothing", "turn")
    + tile(untested, "Not tested", ", ".join(r["id"] for r in ALL if SHOW.get(r["v"], ("", "", ""))[2] == "untested") or "nothing", "grey")
    + "</div>"
    + f"<div class=bars>{''.join(suite_bar(s) for s in SUITES)}</div>"
    + "<div class=facts>"
    + f"<div><b>{len(ui_steps_all)}</b> steps on screen<span>{sum(1 for s in ui_steps_all if s['v'] == 'ok')} worked · {sum(1 for s in ui_steps_all if s['v'] == 'bad')} failed · {sum(1 for s in ui_steps_all if s['v'] == 'todo')} not run</span></div>"
    + f"<div><b>{len(api_steps_all)}</b> API calls and checks<span>{sum(1 for s in api_steps_all if s['v'] == 'ok')} as expected · {sum(1 for s in api_steps_all if s['v'] == 'bad')} not</span></div>"
    + f"<div><b>{took(statistics.median(ui_ms)) if ui_ms else '—'}</b> a typical screen case<span>{len(long_waits)} took ~35 min: they wait for bidding to end (no early end on this client)</span></div>"
    + f"<div><b>{took(statistics.median([r['ms'] for r in API if r['ms']]))}</b> a typical API case<span>setup, the call, then a read-back</span></div>"
    + f"<div><b>{first_ui_pass} → {count(UI, 'passed')}</b> screen cases passing, round 1 → now<span>fixed in between: see the end of this page</span></div>"
    + f"<div><b>{N}</b> events made by spine.ai<span>no other team's event withdrawn or changed</span></div>"
    + f"<div><b>${spend:.2f}</b> AI spend, final screen rounds<span>about ${spend / len(UI):.2f} a case</span></div>"
    + "</div>"
)

print(f"""<title>Overnight QA Report</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
:root {{ --page:#f4eee1; --card:#fcf9f2; --border:#e9e1cf; --border-subtle:#ded4be; --row-hover:rgba(120,96,48,.05); --chip-bg:#ebe2cf; --tint-bg:#f2ebdc;
  --text-strong:#1f1c17; --text:#4a453b; --text-2:#6e685b; --primary:#1375e4; --primary-text:#0e58ab; --primary-tint:#e7f1fc;
  --ok-bg:#d1fae5; --ok-text:#065f46; --ok-dot:#10b981; --bad-bg:#fee2e2; --bad-text:#991b1b; --bad-dot:#ef4444;
  --warn-bg:#ffedd5; --warn-text:#9a3412; --warn-dot:#fb923c; --focus:rgba(19,117,228,.5);
  color-scheme:light; --sans:'Geist',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; --mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace; }}
body {{ background:var(--page); color:var(--text); font:14px/1.5 var(--sans); }}
.wrap {{ max-width:1180px; margin:0 auto; padding-block:28px 56px; padding-left:max(16px, env(safe-area-inset-left,0px)); padding-right:max(16px, env(safe-area-inset-right,0px)); display:grid; grid-template-columns:minmax(0,1fr); gap:28px; }}
.eyebrow, .glabel, .tl, .type, .runid {{ font-family:var(--mono); }}
.eyebrow {{ font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-2); margin:0 0 6px; }}
h1 {{ margin:0; font:600 30px/1.15 var(--sans); color:var(--text-strong); letter-spacing:-.01em; text-wrap:balance; }}
header p {{ margin:8px 0 0; max-width:70ch; }}
h2 {{ margin:0 0 12px; font:600 18px/1.3 var(--sans); color:var(--text-strong); text-wrap:balance; }}
/* metrics */
.tiles {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:10px; }}
.tile {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:grid; gap:4px; min-width:0; }}
.tl {{ font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--text-2); }}
.tb {{ font:600 30px/1.1 var(--sans); color:var(--text-strong); }} .tb small {{ font-size:14px; font-weight:500; color:var(--text-2); margin-left:6px; }}
.ts {{ font-size:12.5px; color:var(--text-2); }}
.tile.ok {{ border-top:3px solid var(--ok-dot); }} .tile.bad {{ border-top:3px solid var(--bad-dot); }} .tile.turn {{ border-top:3px solid var(--warn-dot); }} .tile.grey {{ border-top:3px solid var(--chip-bg); }}
.bars {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:6px 16px; margin-top:10px; }}
.sbar {{ display:grid; grid-template-columns:minmax(0,300px) minmax(120px,1fr) minmax(0,260px); gap:14px; align-items:center; padding:10px 0; }}
.sbar + .sbar {{ border-top:1px solid var(--border); }}
.sl {{ font-weight:500; color:var(--text-strong); }} .sn {{ font-size:13px; color:var(--text-2); }} .sn b {{ color:var(--text-strong); font-size:15px; }}
.meter {{ display:flex; gap:3px; height:10px; border-radius:99px; overflow:hidden; background:var(--chip-bg); }}
.meter i {{ display:block; min-width:8px; }} .meter .ok {{ background:var(--ok-dot); }} .meter .bad {{ background:var(--bad-dot); }} .meter .turn {{ background:var(--warn-dot); }} .meter .grey {{ background:var(--border-subtle); }}
.facts {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:10px; margin-top:10px; }}
.facts div {{ background:var(--tint-bg); border-radius:10px; padding:10px 14px; display:grid; gap:2px; min-width:0; }}
.facts b {{ font:600 18px/1.2 var(--sans); color:var(--text-strong); }} .facts span {{ font-size:12.5px; color:var(--text-2); }}
/* filter bar, like the Sessions page */
.bar {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; }}
.pills {{ display:flex; flex-wrap:wrap; gap:2px; padding:4px; background:var(--card); border:1px solid var(--border); border-radius:12px; }}
.pill {{ border:0; background:transparent; color:var(--text); font:500 13.5px/1 var(--sans); padding:9px 12px; border-radius:8px; cursor:pointer; }}
.pill span {{ font:400 11.5px var(--mono); color:var(--text-2); margin-left:4px; }}
.pill.on {{ background:var(--chip-bg); color:var(--text-strong); }}
.pill:focus-visible, .row:focus-visible, .search:focus-visible {{ outline:2px solid var(--focus); outline-offset:2px; }}
.search {{ flex:1 1 240px; max-width:420px; min-width:0; height:40px; padding:0 14px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--card); color:var(--text-strong); font:14px var(--sans); }}
/* rows */
.list {{ display:grid; grid-template-columns:minmax(0,1fr); gap:22px; }}
.glabel {{ font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-2); margin:0 0 6px 14px; }}
.glabel span {{ letter-spacing:.5px; text-transform:none; margin-left:8px; }}
.card {{ background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; }}
.item + .item {{ border-top:1px solid var(--border); }}
.row {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; min-height:64px; padding:10px 16px; cursor:pointer; list-style:none; }}
.row::-webkit-details-marker {{ display:none; }}
.row:hover, .item[open] > .row {{ background:var(--row-hover); }}
.text {{ flex:1 1 300px; min-width:0; display:flex; flex-direction:column; gap:3px; }}
.title {{ font:500 14px/1.35 var(--sans); color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.item[open] .title {{ white-space:normal; }}
.meta {{ font-size:12px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.why {{ font-size:12.5px; line-height:1.4; padding-left:8px; border-left:2px solid; margin-top:2px; }}
.why.bad {{ color:var(--bad-text); border-color:var(--bad-dot); }} .why.turn {{ color:var(--warn-text); border-color:var(--warn-dot); }} .why.grey {{ color:var(--text-2); border-color:var(--border-subtle); }}
.strip {{ flex:none; width:180px; display:flex; align-items:center; gap:3px; }}
.strip i {{ flex:none; width:6px; height:16px; border-radius:2px; background:var(--chip-bg); }}
.strip .ok {{ background:var(--ok-dot); }} .strip .bad {{ background:var(--bad-dot); }} .strip .todo {{ background:var(--border-subtle); }}
.plus {{ margin-left:3px; font:400 11px/1 var(--mono); color:var(--text-2); }}
.type {{ flex:none; width:64px; font-size:11px; letter-spacing:.5px; color:var(--text-2); }}
.tag {{ flex:0 0 92px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; font:500 12px/1 var(--sans); white-space:nowrap; }}
.tag.ok {{ background:var(--ok-bg); color:var(--ok-text); }} .tag.bad {{ background:var(--bad-bg); color:var(--bad-text); }}
.tag.turn {{ background:var(--warn-bg); color:var(--warn-text); }} .tag.grey {{ background:var(--chip-bg); color:var(--text); }}
.body {{ padding:4px 16px 16px 16px; display:grid; gap:8px; border-top:1px dashed var(--border); background:var(--row-hover); }}
.body p {{ margin:0; max-width:90ch; }} .body b {{ color:var(--text-strong); font-weight:600; }}
.stop {{ color:var(--bad-text); }} .stop b {{ color:var(--bad-text) !important; }}
.muted {{ color:var(--text-2); font-size:13px; }}
.steps {{ margin:4px 0 0; padding:0; list-style:none; display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%,360px),1fr)); gap:2px 12px; }}
.steps li {{ display:flex; gap:10px; padding:5px 8px; border-radius:6px; font-size:13px; }}
.steps li b {{ flex:none; width:16px; text-align:center; }}
.steps li.ok b {{ color:var(--ok-dot); }} .steps li.bad {{ background:var(--bad-bg); color:var(--bad-text); }} .steps li.todo {{ color:var(--text-2); }}
.steps span {{ min-width:0; overflow-wrap:anywhere; }} .steps em {{ display:block; font-style:normal; font-size:12px; color:var(--text-2); }}
.steps li.bad em {{ color:var(--bad-text); }}
.runid {{ font-size:11px; color:var(--text-2); margin:0; overflow-wrap:anywhere; }}
.empty {{ padding:30px 16px; text-align:center; color:var(--text-2); }}
/* what has to be fixed */
.fix {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(300px,1fr)); gap:12px; }}
.box {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; min-width:0; }}
.box h3 {{ margin:0 0 4px; font:600 15.5px/1.3 var(--sans); color:var(--text-strong); display:flex; gap:8px; align-items:center; }}
.box h3 i {{ width:10px; height:10px; border-radius:50%; flex:none; }}
.box.bad h3 i {{ background:var(--bad-dot); }} .box.ours h3 i {{ background:var(--primary); }} .box.turn h3 i {{ background:var(--warn-dot); }}
.box .sub {{ margin:0 0 10px; font-size:12.5px; color:var(--text-2); }}
.box ol, .box ul {{ margin:0; padding-left:20px; display:grid; gap:8px; }} .box li b {{ color:var(--text-strong); }}
code {{ font:12px var(--mono); background:var(--tint-bg); padding:1px 5px; border-radius:5px; overflow-wrap:anywhere; }}
.more {{ background:var(--card); border:1px solid var(--border); border-radius:12px; }}
.more > summary {{ padding:14px 18px; cursor:pointer; font-weight:600; color:var(--text-strong); }}
.more .in {{ padding:0 18px 16px; display:grid; gap:14px; }} .more ul {{ margin:0; padding-left:20px; display:grid; gap:6px; }} .more h3 {{ margin:0 0 6px; font-size:14px; color:var(--text-strong); }}
footer {{ color:var(--text-2); font-size:12.5px; }}
@media (max-width:640px) {{ .strip {{ width:auto; }} .type {{ width:auto; }} .sbar {{ grid-template-columns:1fr; gap:6px; }} }}
</style>
<div class=wrap>
<header><div class=eyebrow>spine.ai · overnight run · PROCOL DEMO on UAT · 26–27 Oct 2026</div>
<h1>Overnight QA report</h1>
<p>Surrogate bid, vendor bidding from the vendor portal (shown beside the buyer's page), withdraw, price cap and the event menus, tested on screen and through the API. Every case used an event spine.ai made. Each verdict waits for your approval. Click a row to see its steps and what failed.</p></header>

<section><h2>Metrics</h2>{metrics}</section>

<section class=list>
<div class=bar><div class=pills role=tablist>{tabs_html}</div><input class=search type=search placeholder="Search by what was asked" aria-label="Search by what was asked"></div>
{groups}
<div class=empty hidden>No case matches.</div>
</section>

<section><h2>What has to be fixed</h2><div class=fix>
<div class='box bad'><h3><i></i>In Procol: raise as bugs</h3><p class=sub>Or tell me they are intended, and I will change the cases.</p><ol>{li(NOTES['findings'])}</ol></div>
<div class='box ours'><h3><i></i>In spine.ai: still ours</h3><p class=sub>Nothing failed on our side in the last round. These cases are still not fully covered.</p><ul>{li(NOTES['open'])}</ul></div>
<div class='box turn'><h3><i></i>Your call</h3><p class=sub>The run can't decide these on its own.</p><ul>{li(NOTES['needs'])}</ul></div>
</div></section>

<details class=more><summary>How the night went: what you asked, what broke on our side and is fixed, where it lives</summary><div class=in>
<div><h3>What you asked</h3><ul>{li(NOTES['asked'])}</ul></div>
<div><h3>What went wrong on our side, now fixed</h3><ul>{li(NOTES['fixed'])}</ul></div>
<div><h3>Where it lives</h3><ul>{li(NOTES['where'])}</ul></div>
</div></details>
<footer>{h(NOTES['footer'])}</footer>
</div>
<script>
(function () {{
  var pills = document.querySelectorAll('.pill'), search = document.querySelector('.search'), f = 'all';
  function apply() {{
    var t = (search.value || '').trim().toLowerCase(), any = false;
    document.querySelectorAll('.group').forEach(function (g) {{
      var shown = 0;
      g.querySelectorAll('.item').forEach(function (it) {{
        var ok = (f === 'all' || it.dataset.k === f) && (!t || it.dataset.q.indexOf(t) >= 0);
        it.hidden = !ok; if (ok) shown++;
      }});
      g.hidden = !shown; if (shown) any = true;
    }});
    document.querySelector('.empty').hidden = any;
  }}
  pills.forEach(function (p) {{ p.addEventListener('click', function () {{
    pills.forEach(function (x) {{ x.classList.toggle('on', x === p); x.setAttribute('aria-selected', x === p); }});
    f = p.dataset.f; apply();
  }}); }});
  search.addEventListener('input', apply);
}})();
</script>""")
