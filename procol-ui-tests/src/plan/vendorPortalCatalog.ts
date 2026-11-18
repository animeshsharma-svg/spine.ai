import type { StepSpec } from "./steps.js";

/**
 * THE VENDOR PORTAL AS A SCREEN (2 Nov). Until now the only way into the supplier side was place_bid,
 * which signs a vendor in, bids and signs out again in one step; a case about what the vendor SEES
 * (UI-VBID: the event in their Live list, the line items and quantities, the bid sheet, a hidden rank,
 * a refused over-cap price) had no screen to stand on and was "not in the screen model yet".
 *
 * switch_portal opens a second browser context signed in as the event's QA vendor and makes it the
 * page every later step acts on — click, fill, expect_text, expect_count, the spotlight, all of it —
 * until switch_portal{to:"buyer"} hands the buyer's page back. vendor_open_event lands on this plan's
 * event in that portal. open_prepared{screen:"vendor"} is both in one: the screen-case runner's first
 * step for a vendor-side case.
 */
export const VENDOR_PORTAL_CATALOG: StepSpec[] = [
  {
    name: "switch_portal",
    purpose:
      "Change which side of Procol the next steps act on. to:\"vendor\" signs in to the SUPPLIER portal as the event's invited QA vendor (a second browser beside the buyer's, streamed and photographed like it) and every later generic step (click, fill, select, expect_text, expect_visible, expect_count, expect_value) acts there; to:\"buyer\" returns to the buyer's console on the page it was left at. Use for any case about what the vendor sees or can do.",
    args: { to: '"vendor" | "buyer"', vendor: 'the vendor to sign in as — an email or the name the case gives; N = the N-th bidder of this plan; "other" = a DIFFERENT vendor on the event this run has not used yet (for "check it in another vendor\'s own session"); optional: the event\'s QA vendor, or the one that bid in this plan' },
  },
  {
    // 18 Nov 2026 — the identity vault (In-Principle Approval on Amity University): the other people of the BUYER's company.
    name: "act_as",
    purpose:
      "The next steps are done by ANOTHER PERSON OF THE BUYER'S COMPANY, in a browser of their own signed in as them: an approver (\"Approver A\", \"Rohan Mehta\", \"Anita Rao (CFO)\", \"step 2 approver\"), a collaborator (\"Karthik Iyer\"), the new owner after Change owner (\"Karan Joshi\"), a view-only user (\"Neha\"), a user without sourcing rights (\"Sunil\"), an unrelated user. who = the case's own words for the person; they open on the page the buyer is on, then every later generic step (go_to, click, fill, hover, expect_text, expect_visible, attempt …) acts as them. who:\"buyer\" (or \"initiator\", \"event owner\") goes back to the buyer's page; a plan can go back and forth (raise as the buyer, approve as Approver A, approve as Approver B, read the result as the buyer). Use it for EVERY step the case gives to someone other than the buyer — never ask_tester for an approver's action. Never for a vendor (that is switch_portal). The run refuses anyone the company has no QA test user for (\"not checked\").",
    args: { who: 'the person as the case names them ("Approver A", "Anita Rao", "the view-only user"), or "buyer" to go back' },
  },
  {
    name: "vendor_open_event",
    purpose:
      "In the supplier portal (after switch_portal{to:\"vendor\"}), open THIS plan's event from the vendor's events list and land on its round: stage:\"pricing\" (default: the RFQ/auction bid sheet, with the Add Bid / bid form opened when the round offers it) or stage:\"technical\" (the RFP questionnaire), or overview:true to stay on the Event Overview. Fails as NOT INVITED when the event is not in the vendor's list — a finding, never covered by opening another event.",
    args: { stage: '"pricing" (default) | "technical"', overview: "true: stay on the event's overview instead of entering a round (optional)" },
  },
  {
    // 10 Nov 2026 — not yet exercised live. The bid sheet code is place_bid's (VendorPortalPage.fillBid / submitBid /
    // bidSubmitted); this step only separates "type and submit on the OPEN portal" from the sign-in, so a case can say
    // what the vendor types (-100, abc, 0, a price above the cap) and read what the portal did with it.
    name: "vendor_bid",
    purpose:
      "On the supplier portal that is already open (after switch_portal{to:\"vendor\"} + vendor_open_event, or open_prepared{screen:\"vendor\"}), type a price into every price cell of the bid sheet and press Submit Quote — the vendor's own bid, typed as a person would. price may be anything the case says: -100, 0, abc, 999999999.99, a price above the cap. Reports what the sheet kept and what the portal answered; a second vendor_bid on the same sheet is a revision. submit:false types without submitting (then read the sheet with expect_text / expect_value / expect_remembered). For a bid the portal must REFUSE write attempt{step:\"vendor_bid\", args:{price:-100}, expect:\"refused\"}: it passes only on a refusal message or a Submit that stays disabled, and fails if the quote goes through. Never place_bid after switch_portal — the vendor is already signed in.",
    args: { price: "what to type into the price cells (default 100)", submit: "false: fill the sheet only (optional)" },
  },
];
