# Spine.ai — the pitch, slide by slide

Two presenters, **A** and **B**. About five minutes. One line per slide beat.

Rule for both of you: the slide carries the numbers, you carry the sentence. Never read a bullet. Pause where it says pause.

---

## Slide 1 — Title *(A, 20s)*

> We're Team Null State. This is Spine.ai.
>
> Give it your test cases. It rewrites its own automation, runs the real product, and writes the report.
>
> **Our target isn't fewer bugs. It's zero.**

## Slide 2 — What it delivers *(B, 30s)*

> Today a regression pass takes two to four days. Spine.ai does it in two to four hours.
>
> Dev and QA used to go back and forth ten to fifteen times a release. Now it's two or three, because the bug arrives with its own reproduction.
>
> Over a thousand cases already. Any client. Any URL. Any user.
>
> *(pause)* And to be clear: this speeds up regression. It doesn't replace a human exploring.

## Slide 3 — The problem *(A, 30s)*

> Look at this walk. Intake, purchase request, event, bidding, evaluation, negotiation, award, purchase order, delivery, finance.
>
> Nine stations. One engineer clicks every one. Then again for the next client configuration. Then types what broke into Excel.
>
> **That's not testing. That's a treadmill.**

## Slide 4 — The answer *(B, 30s)*

> Four parts. A library of cases filed by the buyer's journey, so you can see coverage. A runner that reshapes itself for the cases you pick, hitting the real API and real Chrome. A report anyone can read. And a memory, so every bug and every HubSpot ticket becomes a case it checks next time.
>
> **No more Excel. Not one cell.**

## Slide 5 — Dynamic automation *(A, 30s)*

> Here's the shift. You write a sentence. "A vendor cannot bid below the minimum decrement."
>
> Spine.ai works out what to build first, which endpoints and screens to hit, which client config applies, and what pass and fail look like. Then it runs only that.
>
> Before, a new case meant a new script and an engineer. **Now a new case is a sentence.**

## Slide 6 — The library *(B, 20s)*

> Seventeen modules, in the order a buyer walks the product. So an empty box is a gap you can see, not one you discover in production.
>
> A third of the cases are robustness. We throw rubbish at the API on purpose.

## Slide 7 — Run it *(A, 20s)* — switch to the live dashboard here

> Tick what you want. Press run. Watch it.
>
> Every step appears the moment it fires, with the word next to the colour. Nothing hides behind a spinner.

## Slide 8 — The report *(B, 40s)* — this is the moment. Slow down.

> This is what comes out. Not a log. A sequence.
>
> It signs in as the buyer. Creates the event. Adds the round. Publishes. Signs in as the vendor, with a real one-time code. Bids. Waits for the window to close. Awards. Submits for approval.
>
> **Fifteen steps, fifteen real requests, in the order a person does them. Nobody touched it.**
>
> Every step says what we expected, what the app replied, and what that means. Open one and you get the exact command to reproduce it.

## Slide 9 — Honest verdicts *(A, 25s)*

> Three words. Worked. Broken. Not checked.
>
> The third one matters most. When a feature is switched off for a client, or a login expires, it says "not checked" and why. It never says "passed" to make the page look green.
>
> **A report you can trust beats a report that looks good.**

## Slide 10 — Handoff *(B, 25s)* — open the bug sheet for the demo run

> The bug sheet writes itself. Same twelve columns QA keeps by hand today, filled in. Dev sets status and ETA, it flows back.
>
> Look at the first row. Create-event returns a 500 when you send it malformed line items. That's a crash, not a validation error, and it's a blocker. Spine.ai found it, grouped four cases into one row, and attached the exact request.
>
> Nobody asks "how do I see this?" again.

## Slide 11 — Memory *(A, 20s)*

> Every broken verdict, every HubSpot ticket, every case the team writes down — trained into the library, filed under its feature, with the setup it needs.
>
> **A bug fixed once stays fixed, because it's never forgotten.**

## Slide 12 — Any client, any URL, any user *(B, 20s)*

> Give it a company id and it reads that company's own configuration before it plans anything. Give it a URL and the same cases run there. Give it a role and it signs in as that user — on the login screen, phone and one-time code, like a person.
>
> Running on UAT today.

## Slide 13 — History *(A, 15s)*

> Over a hundred runs kept. Evidence doesn't vanish when the tab closes. You can open any of them right now.

## Slide 14 — Next *(B, 25s)*

> What's next is credible, not fantasy. Jira. CI on every deploy. Nightly runs with the report waiting in the morning.
>
> And the big one: hand it a PRD and a pull request, and it writes the cases itself. The map and the runner exist. Generation is the missing piece.

## Close *(both, 15s)*

**A:** Today, a release is tested by whoever has time.

**B:** With Spine.ai, a release is tested every time, the same way, all the way to the award.

**A:** Zero bugs is the target.

**Both:** **Spine.ai.**

---

## The demo run

Start this about **three minutes before slide 7**, so the wait step is over when you switch to it:

- Client: **PROCOL DEMO (198678)**
- Tick: **RFQ only · Publish event · Event validation · API hardening**
- Press **Run selected tests**

You get the 15-step journey on screen, then about 40 negative cases, and a bug sheet for the run with **two real defects**: the create-event 500 on malformed input (blocker) and a validation case the API accepts when it should refuse.

Keep a finished run open in a second tab as a fallback. Run `2026-09-18T10-25-03-151Z` has exactly this shape.

For the browser demo, run the **RFQ only** UI journey with **sign in on screen** ticked. Watching it type the phone number and the code is when people believe it.

## Three things to fix in the deck before you go on

1. **The case count disagrees with itself.** Slide 4 says 707 cases; slides 2 and 6 say 1k+. Pick one number and use it everywhere, or a judge will ask.
2. **Slide 8 shows the old report.** The live report now opens with the full journey (sign-in → award). Replace the mock-up with a screenshot of the demo run, or demo it live and skip the slide.
3. **Slide 13's headline is broken.** "106" is splitting the sentence into "1 runs s 0 aved and r 6 eplayable". Put the number on its own line.

## Stage notes

- Pause for two full seconds after "Nobody touched it" and after "It never says passed to make the page look green." Those are the two lines they'll remember.
- If asked **"is it real?"**: open the event id from the report in Procol. The bid, the proposal and the vendor are all there.
- If asked **"what if the product changes?"**: the PO → Bill journey. Procol added an invoice approval step last week; the journey now submits the approval, approves it, and says so in the trail. It adapted, and it told you.
- If asked **"why did it say 0 bugs?"**: a journey that works has no bugs to report. The negative cases are where the defects live, and they run after it. Tick Event validation and the sheet fills.
