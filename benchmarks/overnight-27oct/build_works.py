"""What spine.ai can test on Procol today — one page, by type of case (Aanya, 27 Oct 2026: "i want to show how many
cases and what type are working absolutely fine right now, make it a understandable doc").

    python3 build_report.py > report.html    # writes rows.json
    python3 build_works.py > works.html

"Works" means the case passed its latest run AND Procol's own records agree (the report's verdicts). A Procol bug is a
case that ran fine but caught Procol doing something wrong; it is listed, not counted as working.
"""
import html
import json
from pathlib import Path

HERE = Path(__file__).parent
ROWS = {r["id"]: r for r in json.loads((HERE / "rows.json").read_text())}
h = lambda s: html.escape(str(s if s is not None else ""))

# Each type: what a tester can ask, in their words, and the cases that prove it (screen, API).
TYPES = [
    ("Buying events", [
        ("Surrogate bid: the buyer bids for a vendor", "“Publish an RFQ, invite 2 vendors and place a surrogate bid of 100 for each”",
         ["SB01", "SB02", "SB03", "SB05", "SB06", "SB14"], ["API-SB01", "API-SB02"]),
        ("Surrogate bid on an event that already exists", "“On a live RFQ, place a surrogate bid for a vendor who has not bid”", ["SB04"], []),
        ("Surrogate technical response (RFP)", "“Publish a technical-only event and submit a surrogate technical response”", ["SB08"], ["API-SB05"]),
        ("Procol refuses a bad surrogate bid", "“Try a bid with no price / a negative price / a second bid / after bidding ended / after withdrawal”",
         ["SB07", "SB09", "SB10", "SB12", "WD09"], ["API-SB03", "API-SB04", "API-WD04"]),
        ("Counter offer is greyed out on a surrogate bid", "“After a surrogate bid, check Counter Offer is not offered”", ["SB11"], []),
        ("Revise a surrogate bid on an auction", "“Place 100, then revise it to 90 for the same vendor”", ["SB13"], []),
    ]),
    ("Vendor portal beside the buyer", [
        ("A vendor bids from the vendor portal, the buyer sees it", "“Invite 2 vendors, surrogate bid for one, the other bids from the vendor portal; the buyer sees both”",
         ["VB01", "VB02", "VB07", "VB10"], []),
        ("…on an RFP, an RFP + RFQ, an auction, an RFQ then auction", "“Same, on a technical-only RFP / two-stage / auction / RFQ converted to auction”",
         ["VB03", "VB04", "VB05", "VB06"], []),
        ("Ranks across a surrogate and a portal bid", "“Surrogate 120, portal 100: Master QCS ranks the 100 first”", ["VB08"], []),
        ("Counter offer across the two tabs", "“The vendor bids, the buyer counters 90, the vendor accepts in the portal, the buyer sees it”", ["VB09"], []),
    ]),
    ("Withdraw", [
        ("Withdraw the project or one stage, at any phase", "“Withdraw the event: live / after a bid / one stage / two-stage / auction / from a PR / after bidding ended”",
         ["WD01", "WD02", "WD03", "WD06", "WD07", "WD08", "WD10"], ["API-WD01", "API-WD02", "API-WD05"]),
        ("A remark or reason is required", "“Try to withdraw with no remark”", ["WD04", "WD05"], ["API-WD03"]),
        ("A withdrawn project's menu", "“After withdrawing, check Withdraw Project is gone”", ["WD11"], []),
    ]),
    ("Price cap", [
        ("Add a price cap and read it back", "“Add a price cap of 100 for the vendor”", ["PC01"], ["API-PC01"]),
        ("The cap limits the bids", "“Cap 100: a bid of 120 is refused, 90 is accepted, 100 is …”", ["PC02", "PC03", "PC04", "PC05"], ["API-PC02", "API-PC03", "API-PC04"]),
        ("A cap must be entered and positive", "“Try an empty cap / a cap of -10”", ["PC06", "PC07"], []),
    ]),
    ("Event menus", [
        ("Open any Settings or ⋮ item", "“Open Order Activity / Shared With / Send Reminders / Rejected Bids / Edit Evaluation Time / Extend Submission Time / Convert to Auction”",
         ["MN01", "MN02", "MN03", "MN04", "MN07", "MN08", "MN09"], []),
        ("An item is greyed out when it should be", "“With no bids, Send Bulk Counter Offer is greyed out; Recreate Order is greyed out”", ["MN05", "MN06"], []),
    ]),
]

WORKS, BUG, YOU, NOT = "PASS", "FINDING", "NEEDS_JUDGEMENT", ("NOT_TESTED", "GAP")


def tally(ids):
    rows = [ROWS[i] for i in ids if i in ROWS]
    ran = [r for r in rows if r["v"] not in NOT]
    return {
        "n": len(rows), "ran": len(ran), "ok": sum(r["v"] == WORKS for r in rows), "bug": sum(r["v"] == BUG for r in rows),
        "you": sum(r["v"] == YOU for r in rows), "fail": sum(r["v"] in ("FAIL", "FALSE_PASS") for r in rows),
        "not": sum(r["v"] in NOT for r in rows), "ids": ids,
    }


def status(t):
    if not t["n"]:
        return ("—", "none")
    if not t["ran"]:
        return ("Not run yet", "grey")
    if t["ok"] == t["n"]:
        return ("Works", "ok")
    if t["ok"] and t["fail"] == 0 and t["you"] == 0 and t["not"] == 0:
        return ("Works · Procol bug found", "warn")
    if t["ok"]:
        return ("Mostly works", "part")
    return ("Procol bug" if t["bug"] else "Needs you" if t["you"] else "Not yet", "bad" if t["fail"] or t["bug"] else "grey")


def cell(t):
    if not t["n"]:
        return "<td class=none>—</td>"
    extra = []
    if t["bug"]:
        extra.append(f"{t['bug']} Procol bug")
    if t["you"]:
        extra.append(f"{t['you']} needs you")
    if t["fail"]:
        extra.append(f"{t['fail']} failed")
    if t["not"]:
        extra.append(f"{t['not']} not tested")
    tip = " ".join(t["ids"])
    em = f"<em>{h(', '.join(extra))}</em>" if extra else ""
    return f"<td title='{h(tip)}'><b>{t['ok']}</b><span>/{t['n']}</span>{em}</td>"


all_ui = [i for _, items in TYPES for it in items for i in it[2]]
all_api = [i for _, items in TYPES for it in items for i in it[3]]
T_ui, T_api = tally(all_ui), tally(all_api)
types_total = sum(len(items) for _, items in TYPES)
types_work = sum(1 for _, items in TYPES for it in items if status(tally(it[2] + it[3]))[1] in ("ok", "warn"))
cases_ok = T_ui["ok"] + T_api["ok"]
cases_n = T_ui["n"] + T_api["n"]
bugs = [r for r in ROWS.values() if r["v"] == BUG]
yous = [r for r in ROWS.values() if r["v"] == YOU]
nots = [r for r in ROWS.values() if r["v"] in NOT]
fails = [r for r in ROWS.values() if r["v"] in ("FAIL", "FALSE_PASS")]

body = []
for area, items in TYPES:
    rows = []
    for name, example, ui, api in items:
        t_ui, t_api, t_all = tally(ui), tally(api), tally(ui + api)
        word, tone = status(t_all)
        rows.append(f"<tr><td><b class=name>{h(name)}</b><span class=ex>{h(example)}</span></td>{cell(t_ui)}{cell(t_api)}<td><span class='st {tone}'>{h(word)}</span></td></tr>")
    body.append(f"<section><h2>{h(area)}</h2><div class=tw><table><thead><tr><th>Type of case · what you can ask</th><th>On screen</th><th>API</th><th>Today</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>")

def short(text, n=280):
    t = " ".join(str(text or "").split())
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


li = lambda rs: "".join(f"<li><b>{h(r['id'])}</b> — {h(short(r['note']))}</li>" for r in rs) or "<li>None.</li>"

print(f"""<title>What spine.ai Tests Today</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
:root {{ color-scheme:light; --page:#f4eee1; --card:#fcf9f2; --border:#e9e1cf; --chip-bg:#ebe2cf; --tint-bg:#f2ebdc;
  --text-strong:#1f1c17; --text:#4a453b; --text-2:#6e685b; --primary:#1375e4; --primary-text:#0e58ab;
  --ok-bg:#d1fae5; --ok-text:#065f46; --ok-dot:#10b981; --bad-bg:#fee2e2; --bad-text:#991b1b; --bad-dot:#ef4444;
  --warn-bg:#ffedd5; --warn-text:#9a3412; --warn-dot:#fb923c;
  --sans:'Geist',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; --mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace; }}
body {{ background:var(--page); color:var(--text); font:15px/1.55 var(--sans); }}
.wrap {{ max-width:980px; margin:0 auto; padding-block:32px 56px; padding-left:max(16px, env(safe-area-inset-left,0px)); padding-right:max(16px, env(safe-area-inset-right,0px)); display:grid; grid-template-columns:minmax(0,1fr); gap:26px; }}
.eyebrow {{ font:500 11px var(--mono); letter-spacing:1.5px; text-transform:uppercase; color:var(--text-2); margin:0 0 6px; }}
h1 {{ margin:0; font:600 30px/1.15 var(--sans); color:var(--text-strong); letter-spacing:-.01em; text-wrap:balance; }}
header p {{ margin:10px 0 0; max-width:68ch; }}
h2 {{ margin:0 0 10px; font:600 18px/1.3 var(--sans); color:var(--text-strong); }}
.big {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:10px; }}
.big div {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }}
.big b {{ display:block; font:600 32px/1.1 var(--sans); color:var(--text-strong); }} .big b small {{ font-size:15px; font-weight:500; color:var(--text-2); }}
.big span {{ font-size:13px; color:var(--text-2); }}
.big .ok {{ border-top:3px solid var(--ok-dot); }} .big .warn {{ border-top:3px solid var(--warn-dot); }}
.tw {{ overflow-x:auto; background:var(--card); border:1px solid var(--border); border-radius:12px; }}
table {{ width:100%; border-collapse:collapse; min-width:620px; font-size:14px; }}
th {{ text-align:left; font:500 11px var(--mono); letter-spacing:1px; text-transform:uppercase; color:var(--text-2); padding:10px 14px; background:var(--tint-bg); }}
td {{ padding:12px 14px; border-top:1px solid var(--border); vertical-align:top; }}
td:first-child {{ width:56%; }}
.name {{ display:block; color:var(--text-strong); font-weight:600; }} .ex {{ display:block; color:var(--text-2); font-size:13px; margin-top:2px; }}
td b {{ font-size:17px; color:var(--text-strong); }} td span {{ color:var(--text-2); }} td em {{ display:block; font-style:normal; font-size:12px; color:var(--warn-text); }}
td.none {{ color:var(--text-2); }}
.st {{ display:inline-block; padding:3px 10px; border-radius:999px; font:500 12.5px var(--sans); white-space:nowrap; }}
.st.ok {{ background:var(--ok-bg); color:var(--ok-text); }} .st.warn {{ background:var(--warn-bg); color:var(--warn-text); }}
.st.part {{ background:var(--warn-bg); color:var(--warn-text); }} .st.bad {{ background:var(--bad-bg); color:var(--bad-text); }} .st.grey {{ background:var(--chip-bg); color:var(--text); }}
.cols {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:12px; }}
.box {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; min-width:0; }}
.box h3 {{ margin:0 0 8px; font:600 15px var(--sans); color:var(--text-strong); }} .box ul {{ margin:0; padding-left:18px; display:grid; gap:6px; font-size:13.5px; }}
.how {{ font-size:13.5px; color:var(--text-2); max-width:75ch; }}
footer {{ color:var(--text-2); font-size:12.5px; }}
</style>
<div class=wrap>
<header><div class=eyebrow>spine.ai on Procol · PROCOL DEMO (UAT) · 27 Oct 2026</div>
<h1>What spine.ai tests today</h1>
<p>Each row is a type of test case you can type in plain words. The numbers are cases that passed their latest run, with Procol's own records agreeing, on screen and through the API.</p></header>
<div class=big>
<div class=ok><b>{cases_ok}<small> / {cases_n}</small></b><span>cases working end to end</span></div>
<div class=ok><b>{types_work}<small> / {types_total}</small></b><span>types of case that work</span></div>
<div><b>{T_ui['ok']}<small> / {T_ui['n']}</small></b><span>on screen (browser)</span></div>
<div><b>{T_api['ok']}<small> / {T_api['n']}</small></b><span>through the API</span></div>
<div class=warn><b>{len(bugs)}</b><span>cases that caught a Procol bug</span></div>
</div>
{''.join(body)}
<section class=cols>
<div class=box><h3>Caught a Procol bug</h3><ul>{li(bugs)}</ul></div>
<div class=box><h3>Waiting for your decision</h3><ul>{li(yous)}</ul></div>
<div class=box><h3>Not working yet</h3><ul>{li(fails + nots)}</ul></div>
</section>
<p class=how><b>How to read it.</b> “Works” means every case of that type passed. “Works · Procol bug found” means the test ran fine and caught Procol doing something wrong. The full run, step by step, is in the overnight report.</p>
<footer>spine.ai · built from the runs' own records and Procol's database (read-only).</footer>
</div>""")
