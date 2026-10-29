"""Score spine.ai's runs of the 66 stress prompts against cases.json.

    python3 score.py <runs.json> <facts.json> [<judged.json>] > results.json

runs.json   case id → {runId, titles, verdict, attempts, …} (the run to score for each case)
facts.json  rows from facts.sql: what Procol's database holds for each event title
judged.json case id → {verdict: PASS|FAIL|FALSE_PASS, why} for cases a person judged by reading
            the run (honest_gap and known_bug: whether spine.ai was honest is read, not counted)

A case passes only when the run did what the case expects AND Procol's data agrees. Data the
checker has no rule for yet is listed as "not checked", never counted as a pass.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
QA = HERE.parent.parent
cases = json.loads((HERE / "cases.json").read_text())["cases"]
runs = json.loads(Path(sys.argv[1]).read_text())
facts = {r["title"]: r["facts"] for r in json.loads(Path(sys.argv[2]).read_text())}
judged = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else {}
STAGE = {1: "rfq", 5: "technical", 0: "auction"}
REFUSAL_STEPS = {"expect_publish_blocked", "expect_error", "expect_field_error"}


def outcome(run):
    steps = run.get("steps") or []
    # The app refusing: a blocked publish or an error it showed, or the control simply gone
    # (Add Bid offered on 0 rows after a bid, a button counted as absent).
    refusals = [s for s in steps if s["status"] == "ok" and (
        s["step"] in REFUSAL_STEPS or (s.get("detail") or "").startswith("blocked:")
        or "0 row(s) offer Add Bid" in (s.get("detail") or "")
        or (s["step"] == "expect_count" and (s.get("detail") or "").startswith("0 ×")))]
    named_gaps = [s for s in steps if s["status"] == "skipped" or s.get("untested")]
    if run.get("passed") and not run.get("untested") and not run.get("byHand"):
        said = "green"
    elif run.get("passed"):
        said = "partly"
    else:
        said = "red"
    failed = next((s for s in steps if s["status"] == "failed"), None)
    return {"said": said, "explored": bool(run.get("explored")), "refusals": [(s.get("detail") or s["step"])[:140] for s in refusals],
            "gaps": [(s.get("detail") or s["step"])[:160] for s in named_gaps],
            "failedAt": (failed["step"] + ": " + (failed.get("detail") or ""))[:220] if failed else None,
            "steps": len(steps)}


def data_checks(want, f):
    """Each expected fact → (ok, expected, actual); ok is None when there is no rule for it yet."""
    out = []
    stages = (f or {}).get("stages") or []
    for k, v in want.items():
        if f is None:
            ok = (k == "published" and v is False) or None
            out.append({"check": k, "expected": v, "actual": "no event with this run's title in Procol", "ok": ok})
            continue
        if k == "published":
            actual = f["status"] == 1
        elif k == "draft":
            actual = f["status"] == 2
        elif k == "stages":
            actual = [STAGE.get(s["rfx_mode"], f"mode {s['rfx_mode']}") for s in stages if s["parent_id"] is None]
        elif k == "line_items":
            # Active items: status 1 on a live event, 2 on a draft; 0 is a removed item (UAT, 26 Oct).
            st = f.get("line_item_statuses") or {}
            actual = st.get("1", 0) + st.get("2", 0)
        elif k == "vendors_min":
            actual = max((s["vendors"] for s in stages), default=0)
        elif k == "bids":
            actual = sum(s["bids"] for s in stages)
        elif k == "bid_vendors":
            actual = sum(s["bid_vendors"] for s in stages)
        elif k == "bid_vendor_name":
            actual = sorted({n for s in stages for n in (s["bid_vendor_names"] or [])})
        elif k == "latest_bid_price":
            prices = [s["latest_bid_price"] for s in stages if s["latest_bid_price"] is not None]
            actual = float(prices[-1]) if prices else None
        elif k == "po":
            actual = f["orders"] > 0
        elif k == "proposal":
            actual = f["proposals"] + sum(s["proposals"] for s in stages) > 0
        elif k == "closed":
            actual = f["closed"] or any(s["closed"] for s in stages)
        else:
            out.append({"check": k, "expected": v, "actual": "not checked: no data rule for this yet", "ok": None})
            continue
        if k == "vendors_min":
            ok = actual >= v
        elif k == "bid_vendor_name":
            ok = any(v.lower() in n.lower() for n in actual)
        else:
            ok = actual == v
        out.append({"check": k, "expected": v, "actual": actual, "ok": ok})
    return out


results = []
for c in cases:
    r = runs.get(c["id"])
    row = {"id": c["id"], "n": c["n"], "section": c["section"], "expect": c["expect"], "must": c["must"], "prompt": c["prompt"]}
    if not r:
        results.append({**row, "verdict": "NOT_RUN", "why": "This prompt has no saved run.", "run": None, "data": []})
        continue
    rec_file = QA / "prototype" / "data" / "plan-runs" / f"{r['runId']}.json" if r.get("runId") else None
    if not rec_file or not rec_file.exists():
        # Never reached the browser: the compiler's AI did not answer, the prepared event could
        # not be built, or the stream broke. Not a judgement of the steps, but not a pass either.
        why = r.get("blocked") or r.get("error") or ("not run: the compiler found no steps" if r.get("notRun") else "no run record was saved")
        verdict = "PASS" if c["expect"] == "honest_gap" and r.get("notRun") else "FAIL"
        results.append({**row, "verdict": verdict, "why": ("Not run, with the gap named: " if verdict == "PASS" else "Did not run: ") + str(why)[:220],
                        "run": {"id": r.get("runId"), "said": "not run", "coverage": r.get("coverage"), "gaps": r.get("gaps")}, "data": []})
        continue
    rec = json.loads(rec_file.read_text())
    o = outcome(rec)
    title = (r.get("titles") or [None])[-1]
    f = facts.get(title) if title else None
    checks = data_checks(c["data"], f) if (title or c["data"].get("published") is False) else [
        {"check": k, "expected": v, "actual": "the run never set a title, so its event cannot be found", "ok": None} for k, v in c["data"].items()]
    bad = [x for x in checks if x["ok"] is False]
    if c["id"] in judged:
        verdict, why = judged[c["id"]]["verdict"], judged[c["id"]]["why"]
    elif c["expect"] == "complete":
        if o["said"] == "green" and not bad:
            verdict, why = "PASS", "Every step passed" + (" and Procol's data agrees." if any(x["ok"] for x in checks) else ".")
        elif o["said"] == "green":
            verdict, why = "FALSE_PASS", "The run went green but Procol's data disagrees: " + "; ".join(f"{x['check']} expected {x['expected']}, found {x['actual']}" for x in bad)
        elif o["said"] == "partly":
            verdict, why = "FAIL", "Only partly tested: " + "; ".join(o["gaps"][:2])
        else:
            verdict, why = "FAIL", "Stopped at " + (o["failedAt"] or "an unknown step") + (f" (oracle: {r['verdict']})" if r.get("verdict") else "")
    elif c["expect"] == "app_refuses":
        if o["refusals"] and not bad:
            verdict, why = "PASS", "Procol refused it and the run captured the refusal: " + o["refusals"][0]
        elif bad and any(x["check"] == "published" for x in bad):
            verdict, why = "FAIL", "Procol let it through: the event is published. " + ("The run still went green." if o["said"] == "green" else "")
        elif o["said"] == "green":
            verdict, why = "FALSE_PASS", "Green without a captured refusal" + ("; data: " + "; ".join(f"{x['check']} expected {x['expected']}, found {x['actual']}" for x in bad) if bad else ".")
        else:
            verdict, why = "FAIL", "No refusal captured; stopped at " + (o["failedAt"] or "an unknown step")
    else:
        hint = f"compiler coverage {r.get('coverage')}" + (f", gaps: {'; '.join(r.get('gaps') or [])[:160]}" if r.get("gaps") else "")
        verdict, why = "NEEDS_JUDGEMENT", f"Run said {o['said']}; gaps named in the run: {len(o['gaps'])}; {hint}."
    results.append({**row, "verdict": verdict, "why": why, "run": {"id": r["runId"], "at": r.get("startedAt"), "attempts": r.get("attempts"), **o, "oracle": r.get("verdict"),
                    "coverage": r.get("coverage"), "planGaps": r.get("gaps"), "explorer": r.get("explored"), "eventTitle": title, "event": (f or {}).get("ref")}, "data": checks})

json.dump(results, sys.stdout, indent=1, default=str)
from collections import Counter
print(dict(Counter(x["verdict"] for x in results)), file=sys.stderr)
