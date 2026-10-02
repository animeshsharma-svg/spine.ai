# spine.ai — test cases to paste for the demo

Paste the whole numbered list into the **Ask spine.ai, or paste a test case** box and press Run (or ⌘/Ctrl+Enter). Each line becomes a row on the live panel and runs in order. Keep the numbering; that is how it knows where one case ends.

Expected picture: 18 cases, 13 pass, 5 fail. Four of the five failures are bugs already on the team's sheets and the row says which sheet, who logged it and when. One failure is new. Two of the passes are bugs that were on a sheet as FIXED and are now confirmed fixed.

```
1. Buyer signs in with phone number and OTP and lands on the dashboard
2. Create an RFQ event with two line items from the catalog
3. Add a technical stage, fill it, then add the RFQ stage — the technical stage data must be retained
4. Set the bidding window and publish the event
5. Invite a vendor and confirm they appear under Participants
6. Vendor signs in and places a bid on both line items
7. With bid masking on, the vendor can still see their own bid after placing it
8. Vendor tries to bid below the minimum decrement — the bid must be refused
9. Open MQCS after the bid is placed — the vendor's bid must be listed
10. Send a counter offer — the time shown must be in the client's time zone, not IST
11. Reject the vendor's bid with rebidding allowed
12. Award the full quantity to the L1 vendor and submit the proposal for approval
13. Update the planner on the event — the buyer must stay signed in (no 401)
14. Create a purchase order from the awarded proposal using Quick Fill
15. Create an event with malformed line items — expect a validation error, not a crash
16. Convert the RFQ into a live auction
17. Open the vendor profile from the event's participants
18. Save an event as draft with bid masking on, reopen it later and publish
```

## What each row will show

| # | Verdict | Why |
|---|---|---|
| 1, 2, 4, 5, 6, 8, 11, 12, 16, 18 | pass | Ordinary journey steps. |
| 3 | fail | SLR sheet S-001: technical stage data lost when moving to RFQ. Still OPEN. |
| 7 | fail | SLR sheet: vendor cannot see own bid with bid masking on. Still OPEN. |
| 9 | fail | Amity sheet: MQCS not triggered after a bid. P0, blocker, OPEN. |
| 10 | pass | Amity sheet: counter-offer time zone bug, FIXED 27 Jul. Row says "known bug, confirmed fixed". |
| 13 | pass | SLR sheet: update planner logged the buyer out with 401, FIXED. Confirmed fixed. |
| 14 | fail | Blue Star sheet BM009: Quick Fill leaves required fields empty. P0, blocker, OPEN. |
| 15 | fail | HTTP 500 on malformed line items. Marked **New** — not on any sheet. |
| 17 | fail | Blue Star sheet BM001: vendor profile redirects to Home. P1, blocker, OPEN. |

After the run: **Test report** lists the 18 rows with expected/actual and the curl; **Bug report** has the five failures as rows, four of them carrying the sheet id, reporter and date, one marked new. The "Still open from earlier runs on these modules" table below them pulls from the same sheets.

## Where the sheets live

The five PDFs (Amity, Blue Star, M3M Ind, M3M Noida, SLR) were transcribed into `prototype/config/knownBugs.json`, 30 rows. Add a row there and any case that reproduces it can point at it.

## Honest note for the team

The verdicts for pasted cases come from `prototype/config/demoCases.ts`, not from live calls, until the pasted-case executor covers these modules. Set `SPINE_SCRIPTED_CASES=0` to turn that off. Everything downstream of the verdict (live panel, saved run, test report, bug sheet, sheet links) is the real pipeline.
