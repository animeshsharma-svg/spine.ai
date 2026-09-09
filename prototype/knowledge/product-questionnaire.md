# Product Knowledge Questionnaire — fill this to make the QA platform accurate

**Why:** Code tells the platform *what the system does*; you tell it *what "correct" means*
and *what matters*. Filling this feeds the platform's knowledge (RAG), so it plans smarter,
sets the right expectations (fewer false alarms), and prioritises like your team would.

**How to fill:** Replace the `> …` lines with your answers. Skip anything you're unsure of —
partial is fine. Anything you leave, the platform learns from the code + live behaviour instead.

---

## A · Scope & priorities (5 minutes, highest value)

**A1. Which flows matter MOST to test?** (rank the top 5)
> 1.
> 2.
> 3.
> 4.
> 5.

**A2. What are the "must NEVER break" behaviours?** (if these break, it's a P0)
> e.g. "a vendor must never see another vendor's bid"; "an awarded event must never lose line items"
>

**A3. Which clients / environments matter for testing right now?**
> e.g. PROCOL DEMO (198678) on UAT; add others?
>

**A4. What recently changed that we should regression-test?** (features, PRs, areas)
> e.g. "Add RFQ stage feature (#5670)", "BOQ MQCS", "approval flow filters"
>

---

## B · Per-flow correctness rules (the part code can't fully state)

For each flow you care about, tell us what SUCCESS means and the real rules.
(Copy the block per flow. Leave blank ones out.)

### Flow: __________ (e.g. Create & award an RFQ event)
- **Success looks like:**
  > e.g. event active, both stages saved, award proposal opened, notifications sent
- **Mandatory fields (must be rejected if missing):**
  > e.g. title, at least one line item, bid window
- **Validation rules that AREN'T obvious from the UI:**
  > e.g. "quantity must be > 0", "bid_end must be after bid_start", "phone must be 10 digits"
- **When is validation enforced — at draft/create, or at publish?**
  > e.g. "drafts allow incomplete data; validation happens at publish" ← this stops false alarms
- **Known quirks / accepted behaviours (don't flag these as bugs):**
  > e.g. "leading-zero phone is allowed"; "duplicate product names allowed"
- **Priority / severity if this flow breaks:**
  > P0 / P1 / P2

---

## C · Known issues & quirks (so we don't re-report them or mislabel them)

**C1. Known bugs already tracked** (we'll skip/expect these)
> e.g. "phone field accepts letters — JIRA-123, backend only checks length"
>

**C2. Behaviours that LOOK like bugs but are intended**
> e.g. "500 on invalid enum is known; being fixed to 400 in #xyz"
>

**C3. Fields with special/strict validation** (name the field + the real rule)
> e.g. "UOM is case-sensitive (KG not kg)"; "GSTIN format check"; "email must be corporate domain for onboarding"
>

---

## D · Non-functional expectations (targets we should hold the product to)

**D1. Performance targets** (what's "too slow"?)
> e.g. "events list must load under 3s"; "publish under 1s"

**D2. Security concerns to actively test**
> e.g. "vendor bid isolation", "SQL injection on all text fields", "file-upload type/size limits (reject .exe, >10MB)"

**D3. Data-integrity rules** (what must stay consistent in the DB)
> e.g. "PR→event must carry all line items"; "award must reference a real submitted bid"

---

## E · How you want the platform to behave

**E1. When it finds something ambiguous, should it:** flag as a bug / flag as "review" / stay silent?
> 

**E2. False positives vs. missed bugs — which is worse for you?**
> (testing platforms usually prefer "flag for review" over silence — your call)

**E3. Anything else the platform should know about the product or your team's expectations?**
> 

---

*After you fill this, the platform re-indexes it into its knowledge base (`npm run rag:build`)
and uses it to plan tests, set correct expectations, and prioritise findings.*
