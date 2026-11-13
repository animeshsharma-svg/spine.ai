# 2. Write test cases (from the PRD alone)

The full prompt the platform uses: `prompt-test-case-writer.md` (beside this file). The rules in short:

## 2.1 Source

- The PRD only. Never the PR, the code or the running app — a case written from them inherits their mistakes.
- Every expected result comes from a PRD statement (quote or close paraphrase) and carries a **PRD Reference**
  (requirement id + the PRD's words).
- PRD silent or unclear → `Expected Result: Record what happens — the PRD does not say <what>` + a question for the
  product manager (sheet "Questions for the PM"). Never invent the rule.
- Implementation notes in a PRD (query counts, file names, deploy order) are not behaviour: no case.

## 2.2 Coverage

Read the PRD into numbered, observable requirements (R1, R2…). For each:

- **Positive** — the normal way.
- **Negative** — wrong user / not allowed / wrong input → what the PRD says happens (refusal text, hidden option).
- **Edge** — zero, one, many, the limit and one past it, empty list, long text, the second page, two records that
  differ in the one property that matters, the setting On and Off (two cases).

Plus, when the PRD touches them: one case per access group (who sees what), notifications (single and many, exact
words, who receives, where a click leads), existing data made before the change, and one regression case per
neighbouring flow. A requirement with only Positive cases is not tested. Review the set: drop true duplicates (same
user, same action, same outcome) but never a requirement's only Negative or Edge case.

## 2.3 The house columns (every generator, every sheet)

`Test Case ID | Module | Scenario | Test Case Title | User Role | Portal | Pre-conditions | Configs Needed | Test Data |
Test Steps | Expected Result | Priority | Test Type | Status` (+ `PRD Reference` for PRD-written cases).

- Plain English a new tester understands in one read; no code words.
- Title = what is checked, as a sentence. Steps = numbered actions, one per step, buttons/tabs/fields named exactly as
  on screen, in quotes, starting with the login.
- Expected = what the person sees, specific enough to mark at a glance: exact texts in quotes, counts, totals worked
  out (6 × 90 = 540). Never "works correctly".
- Pre-conditions = the starting state in words the runner can build: "a closed RFQ for 10 units where Vendor A quoted
  100 and Vendor B quoted 90", "a live RFQ with two line items", or a set-up case id (SRC-SET-001…011).
- Configs Needed = `setting_key = On|Off|value — what it does`, one per line, or `None`. The runner switches exactly
  these on PROCOL DEMO and back.
- Test Data = placeholders (PR-1, User A, Vendor B) or exact values; Priority Critical/High/Medium/Low; Test Type
  Positive/Negative/Edge.

Writing pre-conditions the runner can build is what makes a case runnable: say the state, the line count, the
quantity and each vendor's price in words (`sheetCases.ts shapeFromWords` reads them).

## 2.4 The platform's case writers

| Writer | Input | File |
|---|---|---|
| PRD → cases (PRD only) | a PRD upload | `prompts/test-case-writer.md`, `src/agents/prdCases.ts` (main checkout, 9 Nov) |
| Derive | a feature phrase / PRD text → permutation matrix grounded in rules, settings, RCA defects | `src/agents/deriveCases.ts`, `scripts/derive-cases.ts` |
| Screen → cases | a photographed screen | `src/agents/screenCases.ts` |
| Journey → cases | a typed journey read back | `src/agents/journeyCases.ts` |
| Flow exploration | important flows with each deciding setting switched | `src/checks/flowExplore.ts` |
| House style + examples | every writer | `src/agents/caseStyle.ts` (`STYLE_GUIDE`, `toSheetRow`) |
