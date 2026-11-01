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
    args: { to: '"vendor" | "buyer"', vendor: "the vendor to sign in as — an email or the name the case gives (optional: the event's QA vendor, or the one that bid in this plan)" },
  },
  {
    name: "vendor_open_event",
    purpose:
      "In the supplier portal (after switch_portal{to:\"vendor\"}), open THIS plan's event from the vendor's events list and land on its round: stage:\"pricing\" (default: the RFQ/auction bid sheet, with the Add Bid / bid form opened when the round offers it) or stage:\"technical\" (the RFP questionnaire), or overview:true to stay on the Event Overview. Fails as NOT INVITED when the event is not in the vendor's list — a finding, never covered by opening another event.",
    args: { stage: '"pricing" (default) | "technical"', overview: "true: stay on the event's overview instead of entering a round (optional)" },
  },
];
