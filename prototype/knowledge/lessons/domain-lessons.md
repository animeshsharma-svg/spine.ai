# Domain lessons — hard-won rules about Procol events (spine.ai)

Each section is one rule learned by running spine.ai against Procol UAT, with where it is true. Codes, tokens and
OTP values are never written here.

### Lesson: the backend rewrites the phone number before an OTP login
For a phone login the backend always rewrites the phone parameter to `phone_prefix + "/" + phone` before looking the
user up (procol-backend params_auth.rb check_phone_and_prefix), and the users table stores phones as "+91/<number>".
So send the local number and the prefix separately; a user whose stored phone is malformed can never sign in by phone.
Where: procol test/src/auth/uatOtp.ts, procol test/src/auth/login.ts.

### Lesson: buyer (web console) users get login codes by phone only
On UAT a console (buyer) user is sent the one-time code by phone only. Asking for it by email is refused with code 5
"Not authorized" (check_otp_on_email_allowed). Vendors sign in by email. The UAT backend also accepts, besides the code
it sent: the user's company's own `uat_login_otp` (per company — PROCOL DEMO and Demo Account 2 differ), for a vendor
the codes of the buyers it deals with, and a master code when no user matches (app/models/otp.rb get_otp_for_uat).
The framework tries the tenant company's code first. Never print a code.

### Lesson: code 705 means the user has not accepted the Terms of Use
Code 705 "Please accept the Terms of Use and Privacy Policy to login" comes back when the OTP was right but the user
never accepted the current Terms of Use (users_controller verify_otp). spine.ai accepts the terms automatically ONLY
for its own test users `qa_…@example.com` (procol test/src/auth/login.ts QA_TEST_EMAIL); for a real person it stops and
says so.

### Lesson: the technical round may not end after the price round (712)
In an event with a technical round (RFP) and a price round (RFQ), the RFP bid end time must not be later than the RFQ
bid end time, else 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422). Checked when a stage is
added/edited (trade_controller_helper.rb:643-674 validate_rfp_rfq_bid_end_time) and when the event is published
(event_groups/update_service.rb:311). Skipped for draft rounds and when `from_mcp` is present.

### Lesson: evaluation scores come from the event's own score scale
An evaluator's score must be a key of the event's `evaluation_score_label_mapping` (the RFP's, else the company's) —
it is not a fixed 1–10. Demo Account 2 scores 0–5 (labels TNA … P1). Any other number is refused with 422 code 2
"Insufficient parameters" (evaluations/validate_service.rb valid_form?); a score of 0 needs a remark. Submitting
evaluations returns the proposal status "draft" when an approval flow applies, "selected" otherwise.
Where: src/checks/eventJourney.ts scoreScale, src/checks/biddingMatrix.ts.

### Lesson: only QA test vendors are ever invited
Tests invite ONLY QA test vendors (spine.ai table qa_vendors; procol test/src/flows/vendors.ts prefers them and throws
NoQaVendorError instead of falling back). Never a real supplier: earlier silent fallbacks invited real vendors to test
events (fixed 8e9ec0d, 8a1624f, 4171aa3). Real vendors only with SPINE_ALLOW_REAL_VENDORS=1. GMMCO has no QA vendors
by design (real customer tenant), so vendor steps there do not run. New users/emails are `qa_<stamp>@example.com`.

### Lesson: line-item units must be units the client really has
A line item's unit is looked up among the client's units (Unit.for_company); an unknown one is refused with 495
"The unit <x> is not present". GMMCO accepts only its own units (material codification on) — Procol-wide units such as
"unit", "litre", "metre" are refused, and 83 of its active products are linked to such units. Demo Account 2 has no
"KG" unit, yet its pricing templates default to KG, so an API call that keeps the template's default unit is refused
(495) while the screen works (it uses the product's unit). Where: src/model/snapshots/*.json findings.

### Lesson: never ask the wrong app — a buyer token on a vendor API signs the buyer out
Every request carries an app key (buyer web console = client_admin_dashboard, vendor website = agribid_website). The
backend checks the session, then the app's allow-list (api_auth.rb:11-12). A request the app may not make is answered
401 "This app is not authorized to use this API", and every 401 marks the session in_active (json_helpers.rb:31-35) —
the buyer is signed out of the platform run AND the real web console. One buyer call to POST /v1/bids (vendor-only)
made the next 45 cases answer "Authentication failed". All requests go through guarded senders (engine.ts apiAttempt,
apiPlanRunner.ts send) that consult src/checks/appAccess.ts (data/app-access.json).

### Lesson: per-client settings change event behaviour
The same test behaves differently per client because company settings switch features on and off (BOQ allowed, draft
projects, bid masking, buyer can edit bid, material codification, allowed vendor statuses, default units,
trade_config.default_* fields). spine.ai reads them per client (config/featureGates.json, src/checks/featureGates.ts,
src/model/snapshots) and greys out a case whose feature is off instead of failing it.

### Lesson: an untyped HTTP 500 is always a defect; "couldn't tell" is never a pass
A documented refusal carries a code and message from config/locales/en-IN.yml. An HTTP 500 without a typed error is
always a defect (render_error_json falls back to 500 only when no status is known, json_helpers.rb:19). A result the
automation could not judge — "couldn't tell" (inconclusive) — is never counted as pass, and never as a product failure.

### Lesson: a recorded failure is a bug only if it reproduces on its own fresh test event
About a quarter of recorded crashes (2026-10-01) were false alarms from a SHARED test event: one wrongly-typed update
leaves the event refusing every later update, and a failed withdraw makes the next correct withdraw answer 500. So
every failure is re-run on its own fresh test event before it is reported; the case runner rebuilds the shared copy
after a crash or withdraw (server.ts guardSandbox, eventJourney rebuildForCases) and runs destructive cases last.

### Lesson: every wait is bounded
A run once sat idle forever because one pre-case wait never settled. Every wait now has a time limit and a stated
fallback (bounded()); the Procol DB pool has connection and query timeouts.

### Lesson: how an event is built through the API
Event = event group (draft) → stages added with POST /trade/template_input: technical round = rfx_mode "rfp" with a
technical (type "rfi") template, price round = "rfq" with a pricing (type "trade") template, auctions. Then PATCH
/event_groups/:uuid with status "active" and draft_trade_request_uuids publishes it. Templates come from GET
/templates?type_identifier=<rfi|trade>&hide_onboarding_v2_templates=true → {default:[], saved:[]}; the old framework
silently took the first default template — the platform must choose one on purpose.

### Lesson: Procol itself is never changed by testing
Procol's database is read with SELECT only; no configuration changes, no deletes of real records, no emails or invites
to real addresses. Anything created on UAT is a test record named QA_Platform_… or API_Test_….
