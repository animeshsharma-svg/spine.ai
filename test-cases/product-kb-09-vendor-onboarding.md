# Product KB test cases — Vendor Onboarding

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How do I add Vendors to my Platform?

#### PRD-KBVON-001 — Invite a vendor via Tax ID

- **Why it matters.** Inviting is how a vendor gets Vendor Dashboard access and becomes invitable to RFQs, RFPs and Auctions.
- **Setup.** Buyer / Procurement Manager / Vendor Onboarding Team user signed in; vendor POC name and email to hand.
- **Steps.**
  1. Navigate to the Vendors page from the left navigation panel.
  2. Click the "+ **Invite Vendor**" button.
  3. In \* POC - Full Name, enter the full name of the vendor's person of contact.
  4. In Email, enter the email for communications and login.
  5. In "Choose vendor profile", choose Manufacture/Trader.
  6. In "Invite Vendor via", select **Tax ID**, select the Business Location (Country) and enter the Tax ID shown (e.g. GSTIN).
  7. Click the blue "**Next**" button and review the summary.
  8. Click the blue "Invite" button.
- **Expected.** A side drawer collects the vendor's details; a summary is shown before inviting; after Invite a success message confirms the invite has been sent.
- **Oracle.** Success message at the top of the screen confirming the invite was sent; the vendor appears on the Vendors page.
- **Trace.** P1 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-002 — Invite a vendor by entering details manually

- **Why it matters.** Alternate invite path for vendors without a Tax ID lookup; the article states three required fields.
- **Setup.** Buyer user on the Invite Vendor side drawer with POC name and email filled.
- **Steps.**
  1. In "Invite Vendor via", select Enter details manually.
  2. Enter Company Name, Address, and City (from the dropdown).
  3. Click "**Next**", review the summary and click "Invite".
- **Expected.** Company Name, Address and City are required; with them filled the invite is sent.
- **Oracle.** The three fields are shown for the manual option; success message after Invite.
- **Trace.** P1 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-003 — Business Location decides which Tax ID field is shown

- **Why it matters.** The tax identifier differs by country (VAT, GSTIN, etc.); the wrong field would capture the wrong identifier.
- **Setup.** Buyer user on the Invite Vendor side drawer.
- **Steps.**
  1. In "Invite Vendor via", select **Tax ID**.
  2. Select India as Business Location (Country) and note the Tax ID field.
  3. Change the Business Location to a VAT country and note the Tax ID field.
- **Expected.** The Tax ID field shown matches the selected country (e.g. GSTIN for India, VAT for a VAT country).
- **Oracle.** Tax ID field label changes with the country selection.
- **Trace.** P2 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-004 — Choose vendor profile Broker

- **Why it matters.** A Broker bids on the buyer's behalf for multiple sellers, unlike a Manufacture/Trader who sells directly.
- **Setup.** Buyer user on the Invite Vendor side drawer.
- **Steps.**
  1. In "Choose vendor profile", select **Broker**.
  2. Complete the remaining fields, click "**Next**" and "Invite".
- **Expected.** Both Manufacture/Trader and Broker are offered; the vendor is invited with the Broker profile.
- **Oracle.** Summary before Invite shows the Broker profile; invite success message.
- **Trace.** P2 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-005 — Vendor Code is optional at invite

- **Why it matters.** The article states Vendor Code is non-mandatory and can be updated later or via Onboarding with Integrations.
- **Setup.** Buyer user on the Invite Vendor side drawer.
- **Steps.**
  1. Fill the required fields and leave Vendor Code empty.
  2. Click "**Next**" and "Invite".
- **Expected.** The invite goes through without a Vendor Code.
- **Oracle.** Invite success message with Vendor Code blank.
- **Trace.** P2 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-006 — Categories are optional at invite

- **Why it matters.** The article states category mapping is non-mandatory at this stage and can be done later.
- **Setup.** Buyer user on the Invite Vendor side drawer.
- **Steps.**
  1. Fill the required fields without selecting any Categories; invite.
  2. Invite a second vendor and search and select one or more Categories.
- **Expected.** The invite succeeds with or without categories; selected categories map the vendor to them.
- **Oracle.** Both invites succeed; the second vendor shows the selected categories.
- **Trace.** P2 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-007 — POC - Full Name is marked required

- **Why it matters.** The field label carries a required marker (\*) in the article.
- **Setup.** Buyer user on the Invite Vendor side drawer.
- **Steps.**
  1. Look at the POC - Full Name field.
  2. Try to click "**Next**" with POC - Full Name empty.
- **Expected.** POC - Full Name is marked as required.
- **Oracle.** Required marker (\*) on the field; tester notes whether Next proceeds without it.
- **Trace.** P2 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-008 — Invited vendor receives a Vendor Dashboard link and logs in with the same email

- **Why it matters.** The invite email is how the vendor reaches trade.procol.in for the first time.
- **Setup.** A vendor just invited with an email the tester can read.
- **Steps.**
  1. Open the invited email's inbox.
  2. Follow the link to the vendor dashboard site.
  3. Log in using the same email used in the invite.
- **Expected.** The vendor receives a link to the vendor dashboard and can log in with the same email for the first time.
- **Oracle.** Invite email received; login with that email succeeds.
- **Trace.** P1 · manual · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-009 — Without Vendor Onboarding the invited vendor is directly Joined

- **Why it matters.** Vendor status after invite decides whether they can be invited to events right away.
- **Setup.** Buyer account with Vendor Onboarding not enabled.
- **Steps.**
  1. Invite a vendor (Vendors page › "+ Invite Vendor" › Next › Invite).
  2. Check the vendor's status on the Vendors page.
- **Expected.** The vendor is directly Joined.
- **Oracle.** Vendor status shows Joined.
- **Trace.** P1 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

#### PRD-KBVON-010 — With Vendor Onboarding the invited vendor becomes a prospect

- **Why it matters.** With onboarding enabled, an invited vendor is only a prospect and becomes Joined post-onboarding.
- **Setup.** Buyer account with Vendor Onboarding enabled.
- **Steps.**
  1. Invite a vendor.
  2. Open the Vendors page and check where the vendor is listed.
- **Expected.** The vendor is a prospect, not Joined, until onboarding is complete.
- **Oracle.** Vendor is listed in the Prospects tab and not as Joined.
- **Trace.** P1 · automate-later · `b4f92226c8b283d3a4e701a2eee1071e` · `how-do-i-add-vendors-to-my-platform` · Notion KB › Vendor Onboarding › How do I add Vendors to my Platform?

## 2. How do I Start Onboarding a Vendor?

#### PRD-KBVON-011 — Start onboarding for a prospect

- **Why it matters.** Starting onboarding sends the prospect the onboarding event; it is the gate between invited and Joined.
- **Setup.** Buyer / Vendor Onboarding Team user; Vendor Onboarding enabled; at least one prospect; a Vendor Onboarding template exists.
- **Steps.**
  1. Navigate to the Vendors page from the left navigation panel.
  2. Navigate to the Prospects Tab.
  3. Select the vendor to onboard.
  4. Click the blue "Start Onboarding" button.
  5. In the "Onboarding Prospects" side panel, select a template under "Onboarding Template".
  6. Confirm to send the prospect to the onboarding event.
- **Expected.** Onboarding starts for the prospect, who moves to the "Onboarding in Progress" tab.
- **Oracle.** Prospect listed under "Onboarding in Progress"; success state "You have successfully started the onboarding for a vendor!".
- **Trace.** P1 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-012 — Prospects tab lists invited but not onboarded vendors

- **Why it matters.** Prospects are defined as vendors invited but not onboarded yet.
- **Setup.** Onboarding enabled; one vendor invited and not onboarded, one vendor Joined.
- **Steps.**
  1. Open the Vendors page and the Prospects tab.
- **Expected.** The invited, not-yet-onboarded vendor is listed; the Joined vendor is not.
- **Oracle.** Prospects tab contents match the two vendors' states.
- **Trace.** P1 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-013 — Start onboarding for multiple prospects at once

- **Why it matters.** Batch onboarding; the button shows how many vendors are selected.
- **Setup.** Onboarding enabled; three or more prospects.
- **Steps.**
  1. In the Prospects tab, select three prospects.
  2. Read the number on the "Start Onboarding" button.
  3. Click "Start Onboarding", choose an Onboarding Template and review the Prospects listed in the side panel.
  4. Confirm.
- **Expected.** The button number equals the number selected; the side panel lists the selected prospects; all move to "Onboarding in Progress".
- **Oracle.** Count on button = 3; all three listed under "Onboarding in Progress".
- **Trace.** P2 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-014 — Schedule the onboarding event times

- **Why it matters.** Start time, duration and evaluation time bound when the vendor can submit and when evaluation begins.
- **Setup.** "Onboarding Prospects" side panel open with a template selected.
- **Steps.**
  1. Change the Start time.
  2. Change the Duration (End time).
  3. Change the Evaluation time.
  4. Confirm.
- **Expected.** The onboarding event is scheduled with the chosen times.
- **Oracle.** Onboarding Details on the vendor profile reflect the scheduled times.
- **Trace.** P2 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-015 — View vendor responses on the Onboarding Details tab

- **Why it matters.** The buyer reviews submitted onboarding responses here.
- **Setup.** A prospect in "Onboarding in Progress" who has submitted the onboarding form.
- **Steps.**
  1. In the "Onboarding in Progress" tab, click the prospect's company name.
  2. On the Vendor Profile Page, click the "Onboarding Details" tab.
- **Expected.** The Vendor Profile Page opens; Onboarding Details shows the vendor's responses once submitted.
- **Oracle.** Submitted answers are visible in Onboarding Details.
- **Trace.** P1 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-016 — Extend the vendor's submission time

- **Why it matters.** Gives a vendor more time to submit their onboarding response.
- **Setup.** A prospect in "Onboarding in Progress" with the submission time running.
- **Steps.**
  1. Open the prospect's Vendor Profile Page › "Onboarding Details".
  2. Extend the submission time.
- **Expected.** The submission time is extended, allowing the vendor more time to submit.
- **Oracle.** New submission end time is shown; the vendor can still submit after the original end time.
- **Trace.** P2 · automate-later · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

#### PRD-KBVON-017 — Un-onboarded vendors cannot participate in sourcing events

- **Why it matters.** The article states that when onboarding is enabled, vendors cannot participate in RFQs, RFPs or Auctions until onboarded — a compliance gate.
- **Setup.** Onboarding enabled; a prospect (invited, not onboarded) and a live RFQ.
- **Steps.**
  1. Try to have the prospect take part in the RFQ (repeat for an RFP and an Auction).
  2. Check the prospect's vendor portal.
- **Expected.** Until onboarded, the vendor cannot participate in the sourcing events.
- **Oracle.** The prospect cannot take part in the events; after onboarding the same vendor can.
- **Trace.** P0 · manual · `19d92226c8b2832b9839013a628d17ee` · `how-do-i-start-onboarding-a-vendor` · Notion KB › Vendor Onboarding › How do I Start Onboarding a Vendor?

## 3. How does a Vendor register and log in for the first time?

#### PRD-KBVON-018 — First-time vendor sign-in with email OTP and sign-up

- **Why it matters.** First login is how an invited vendor gets into the supplier portal to onboard and bid.
- **Setup.** Vendor invited by a buyer; access to the invited email's inbox; www.trade.procol.in open.
- **Steps.**
  1. Click Continue with email and enter the email the invitation was received on.
  2. Click the blue "Sent OTP" button.
  3. Enter the OTP received in the email.
  4. On the **Vendor Sign up** page, review the pre-filled details.
  5. Click the checkbox next to "I agree to the terms of use,…".
  6. Click the blue "Submit" button.
- **Expected.** The Vendor Sign up page shows details pre-filled by the inviting buyer; after Submit the vendor is logged into the platform.
- **Oracle.** Vendor dashboard is displayed after Submit.
- **Trace.** P1 · automate-later · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-019 — First login via the email invitation link

- **Why it matters.** The invitation email's login link is the primary entry for invited vendors.
- **Setup.** Vendor invited by a buyer; access to the invitation email.
- **Steps.**
  1. Open the invitation email and click the login link.
  2. Enter the details on the login / setup page.
- **Expected.** The link takes the vendor directly to the login or setup page where they enter their details.
- **Oracle.** Login / setup page opens from the link; completing it logs the vendor in.
- **Trace.** P1 · manual · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-020 — First login must use email, not phone

- **Why it matters.** The article states email must be used for the first login; phone is only for consecutive logins once added.
- **Setup.** Invited vendor who has never logged in.
- **Steps.**
  1. Go to www.trade.procol.in.
  2. Try to log in with a phone number.
  3. Log in with the invited email instead.
- **Expected.** First-time login is by email address; the phone-number route is not the way in for a first login.
- **Oracle.** Phone login does not complete a first login; email login does.
- **Trace.** P1 · manual · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-021 — Consecutive login with phone number once added

- **Why it matters.** Phone login is offered for later sign-ins when the phone number has been added.
- **Setup.** Vendor who completed first login and added a phone number.
- **Steps.**
  1. Sign out and go to www.trade.procol.in.
  2. Log in with the phone number.
- **Expected.** The vendor can log in with the phone number.
- **Oracle.** Vendor dashboard is displayed after phone login.
- **Trace.** P2 · manual · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-022 — Only buyer-invited users can access the vendor platform

- **Why it matters.** The article states only users invited by a buyer can access the platform.
- **Setup.** An email address that no buyer has invited.
- **Steps.**
  1. Go to www.trade.procol.in and click Continue with email.
  2. Enter the uninvited email and try to complete sign-in.
- **Expected.** The uninvited user cannot access the platform.
- **Oracle.** Sign-in does not reach the vendor dashboard for the uninvited email.
- **Trace.** P1 · manual · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-023 — Sign-up details editable except the email id

- **Why it matters.** Email is the invited identity; the article states it cannot be edited on the sign-up page.
- **Setup.** Invited vendor on the **Vendor Sign up** page after OTP.
- **Steps.**
  1. Edit a pre-filled detail (e.g. name).
  2. Try to edit the email id.
- **Expected.** Pre-filled details can be edited except the email id.
- **Oracle.** Other fields accept edits; email field is not editable.
- **Trace.** P1 · automate-later · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-024 — Contact phone number is optional at sign-up

- **Why it matters.** The article states adding a contact phone number is optional at this stage.
- **Setup.** Invited vendor on the **Vendor Sign up** page.
- **Steps.**
  1. Leave the contact phone number empty.
  2. Tick the terms checkbox and click "Submit".
- **Expected.** Sign-up completes without a phone number.
- **Oracle.** Vendor is logged in with no phone number set.
- **Trace.** P2 · automate-later · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-025 — Retry send OTP when not received or expired

- **Why it matters.** Vendors must be able to recover from a lost or expired OTP.
- **Setup.** Invited vendor at the OTP entry step.
- **Steps.**
  1. Wait for the OTP to expire (or do not use it).
  2. Retry "send OTP".
  3. Enter the new OTP.
- **Expected.** A new OTP can be requested and used to continue.
- **Oracle.** New OTP email arrives; entering it proceeds to the sign-up page.
- **Trace.** P2 · manual · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

#### PRD-KBVON-026 — After login with onboarding not initiated, no live events may show

- **Why it matters.** Sets the expectation of an empty dashboard before onboarding is initiated; no action is needed when onboarding is not enabled.
- **Setup.** Invited vendor whose buyer has not initiated onboarding and has no events for them.
- **Steps.**
  1. Complete first-time sign-in and Submit.
  2. View the vendor dashboard.
- **Expected.** The vendor is logged in and may see no live events; there is no further action to take when onboarding is not enabled.
- **Oracle.** Dashboard shows no live events.
- **Trace.** P2 · automate-later · `33492226c8b282cabede813d37d7678e` · `how-does-a-vendor-register-and-log-in-for-the-first-time` · Notion KB › Vendor Onboarding › How does a Vendor register and log in for the first time?

## 4. Onboarding as a Vendor

#### PRD-KBVON-027 — Vendor completes and submits the onboarding form

- **Why it matters.** Onboarding collects company, GST/PAN, banking and compliance details the buyer needs before events or POs.
- **Setup.** Vendor logged into the vendor portal; the buyer has started a Vendor Onboarding Event for them.
- **Steps.**
  1. Click the Vendor Onboarding Event card.
  2. On the Event Overview screen, click the blue **"I will participate"** button.
  3. Go to the tab next to "Event Overview" (if not taken there automatically).
  4. Fill the form, including all Mandatory fields across the sections.
  5. Scroll to the bottom and click "Submit".
- **Expected.** A confirmation appears at the top of the screen; the response is submitted and awaits evaluation by the buyer.
- **Oracle.** Top-of-screen confirmation; submitted state "You have successfully submitted your vendor onboarding form response!".
- **Trace.** P0 · automate-later · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-028 — "I will participate" records the vendor's willingness to participate

- **Why it matters.** The participation choice informs the buyer and opens the form.
- **Setup.** Vendor on the Event Overview screen of a Vendor Onboarding Event.
- **Steps.**
  1. Click the blue **"I will participate"** button.
- **Expected.** The buyer is informed of the vendor's willingness; the vendor moves on to the onboarding form tab.
- **Oracle.** Form tab next to "Event Overview" opens / becomes available.
- **Trace.** P1 · automate-later · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-029 — Reach the form via the tab next to Event Overview

- **Why it matters.** Fallback navigation when the portal does not switch tabs automatically.
- **Setup.** Vendor who clicked "I will participate" and was not taken to the next tab.
- **Steps.**
  1. Click the tab next to "Event Overview".
- **Expected.** The onboarding form is shown.
- **Oracle.** Form sections are visible.
- **Trace.** P3 · automate-later · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-030 — Mandatory fields must be filled before submitting

- **Why it matters.** The article tells vendors to be sure to fill all Mandatory fields; incomplete onboarding data defeats the compliance check.
- **Setup.** Vendor on the onboarding form of a template with mandatory questions.
- **Steps.**
  1. Leave a Mandatory field empty.
  2. Scroll to the bottom and click "Submit".
- **Expected.** Submission requires all Mandatory fields to be filled.
- **Oracle.** Response is not submitted while a Mandatory field is empty.
- **Trace.** P1 · manual · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-031 — Re-submit while the submission time is still running

- **Why it matters.** The article states vendors can change and re-submit their response while the submission time runs.
- **Setup.** Vendor who has submitted the onboarding form; submission time not yet expired.
- **Steps.**
  1. Reopen the onboarding form.
  2. Change an answer.
  3. Click "Submit" again.
- **Expected.** The changes are accepted and the response is re-submitted.
- **Oracle.** Confirmation after re-submit; buyer's Onboarding Details shows the changed answer.
- **Trace.** P1 · automate-later · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-032 — Vendor cannot access events or receive POs until onboarding is approved

- **Why it matters.** The article states that until onboarding is completed and approved by the buyer, the vendor cannot access events or receive POs.
- **Setup.** Vendor who has submitted onboarding but is not yet approved; a live event and a PO flow on the buyer side.
- **Steps.**
  1. As the buyer, try to include the vendor in an event and raise a PO to them.
  2. As the vendor, check the portal for the event / PO.
  3. Approve the onboarding and repeat.
- **Expected.** Before approval the vendor cannot access events or receive POs; after approval they can.
- **Oracle.** Event / PO not available to the vendor before approval; available after.
- **Trace.** P0 · manual · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

#### PRD-KBVON-033 — Onboarding form typically covers profile, tax, bank and compliance details

- **Why it matters.** Sets what an onboarding template usually collects.
- **Setup.** Vendor on the onboarding form of the buyer's standard onboarding template.
- **Steps.**
  1. Scroll through the form sections.
- **Expected.** The form typically includes company profile and contact information, GST and PAN details, banking information, and compliance documents or certificates.
- **Oracle.** Tester confirms these sections / questions are present for the template in use.
- **Trace.** P2 · manual · `ffc92226c8b2834c81b081636272fba5` · `onboarding-as-a-vendor` · Notion KB › Vendor Onboarding › Onboarding as a Vendor

## 5. Evaluating Vendor Onboarding Responses

#### PRD-KBVON-034 — Force start evaluation with Start Evaluation

- **Why it matters.** Lets the buyer begin evaluation before the submission time ends.
- **Setup.** Buyer / Vendor Onboarding Team user on a prospect's Vendor Profile › Onboarding Details, submission time still running, vendor has submitted.
- **Steps.**
  1. Click **"Start Evaluation"**.
- **Expected.** The evaluation time starts immediately.
- **Oracle.** Onboarding Details shows the evaluation stage with Approve / Reject available.
- **Trace.** P1 · automate-later · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-035 — Evaluation auto-starts when submission time expires

- **Why it matters.** Alternative to forcing evaluation; the article states evaluation time auto-starts on expiry.
- **Setup.** Prospect in onboarding with a short submission window.
- **Steps.**
  1. Do not click Start Evaluation; wait for the submission time to expire.
  2. Open the prospect's Onboarding Details.
- **Expected.** Evaluation time starts automatically.
- **Oracle.** Onboarding Details shows the evaluation stage after expiry.
- **Trace.** P1 · manual · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-036 — Jump Section while reviewing responses

- **Why it matters.** Navigation aid for long onboarding forms.
- **Setup.** Buyer on Onboarding Details of a response with several sections.
- **Steps.**
  1. Click "Jump Section".
  2. Select a section.
- **Expected.** The view jumps to the selected section.
- **Oracle.** Selected section is scrolled into view.
- **Trace.** P3 · automate-later · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-037 — Approve the onboarding response and send for approval

- **Why it matters.** Approval routes the prospect through the approval workflow that makes them a Joined vendor.
- **Setup.** Buyer on a prospect's Onboarding Details in the evaluation stage; an approval workflow configured.
- **Steps.**
  1. Review the response and click **Approve**.
  2. In the send for Approval tab, fill the Buyer Added Attributes form if shown, then click "**Next**".
  3. On the Vendor/Prospect summary, add a Category and Location and press "**Next**".
  4. Add remarks, observe the approval workflow to be triggered, and click **Continue**.
- **Expected.** The prospect is sent for approval.
- **Oracle.** Confirmation "The prospect has been sent for Approval".
- **Trace.** P0 · automate-later · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-038 — Approver approves and the vendor becomes Joined

- **Why it matters.** Final approval makes the vendor onboarded and eligible for any event.
- **Setup.** A prospect sent for approval (PRD-KBVON-037); approver user in the workflow.
- **Steps.**
  1. Sign in as the approver.
  2. **Approve** the prospect from the approver's account.
  3. As the buyer, check the vendor's status.
- **Expected.** The vendor is onboarded, placed into **"Joined"** status, and eligible to be invited to any event.
- **Oracle.** Vendor status shows Joined; vendor can be invited to an event.
- **Trace.** P0 · automate-later · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-039 — Evaluator rejects the vendor's onboarding response

- **Why it matters.** Reject is the other evaluation outcome the article offers; a rejected vendor must not become Joined.
- **Setup.** Buyer on a prospect's Onboarding Details in the evaluation stage.
- **Steps.**
  1. Review the response and click **Reject**.
  2. Check the vendor's status.
- **Expected.** The vendor is rejected (the article does not describe the resulting status).
- **Oracle.** Vendor is not in Joined status; tester records the status shown.
- **Trace.** P0 · manual · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-040 — Approver rejects the prospect sent for approval

- **Why it matters.** The approver can Approve or Reject; a rejection must stop the vendor from being onboarded.
- **Setup.** A prospect sent for approval; approver user in the workflow.
- **Steps.**
  1. Sign in as the approver.
  2. **Reject** the prospect from the approver's account.
  3. As the buyer, check the vendor's status.
- **Expected.** The prospect is not onboarded (the article does not describe the resulting status).
- **Oracle.** Vendor is not in Joined status; tester records the status shown.
- **Trace.** P0 · manual · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-041 — Buyer Added Attributes form appears only when the integration feature is enabled

- **Why it matters.** Integration-based attributes must be captured on approval where enabled, and not block others.
- **Setup.** Two accounts / configurations: Buyer Added Attributes enabled and not enabled; a prospect in evaluation in each.
- **Steps.**
  1. In each configuration, click **Approve** on the prospect.
  2. Look at the send for Approval tab.
- **Expected.** With Buyer Added Attributes enabled, a form for the buyer to fill is shown; without it, no such form.
- **Oracle.** Presence / absence of the Buyer Added Attributes form per configuration.
- **Trace.** P2 · manual · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

#### PRD-KBVON-042 — Add Category and Location on the approval summary

- **Why it matters.** Category / location mapping is set for the vendor during approval.
- **Setup.** Buyer on the Vendor/Prospect summary step of send for Approval.
- **Steps.**
  1. Add a Category and a Location.
  2. Press "**Next**", add remarks and click **Continue**.
  3. After final approval, open the vendor's profile.
- **Expected.** The Category and Location are added for the vendor.
- **Oracle.** Vendor profile shows the added Category and Location.
- **Trace.** P2 · automate-later · `08392226c8b283faa386016ad30b6678` · `evaluating-vendor-onboarding-responses` · Notion KB › Vendor Onboarding › Evaluating Vendor Onboarding Responses

## 6. How to Bulk Upload Vendors?

#### PRD-KBVON-043 — Bulk upload vendors from the Excel template

- **Why it matters.** Adds many vendors at once instead of one by one.
- **Setup.** Buyer user; vendor details for several vendors.
- **Steps.**
  1. Go to the **Vendors tab** using the left navigation panel.
  2. Click **Bulk Upload** at the top-right, next to Save as Excel.
  3. On the Bulk Upload page, click **New Upload** at the top-right.
  4. Download the **Sample Template** and fill in the vendor details as per the format.
  5. Upload the completed Excel sheet.
  6. Press **OK**.
- **Expected.** Once the upload is processed successfully, all the vendors appear in the **Prospects tab**.
- **Oracle.** Each uploaded vendor is listed in the Prospects tab.
- **Trace.** P1 · automate-later · `c5092226c8b283158c3301791b339247` · `how-to-bulk-upload-vendors` · Notion KB › Vendor Onboarding › How to Bulk Upload Vendors?

#### PRD-KBVON-044 — Bulk Upload page shows past upload history

- **Why it matters.** Users check earlier uploads here.
- **Setup.** Buyer user; at least one previous bulk upload.
- **Steps.**
  1. On the Vendors page click **Bulk Upload**.
- **Expected.** The Bulk Upload page shows a history of past bulk uploads.
- **Oracle.** The previous upload is listed on the page.
- **Trace.** P2 · automate-later · `c5092226c8b283158c3301791b339247` · `how-to-bulk-upload-vendors` · Notion KB › Vendor Onboarding › How to Bulk Upload Vendors?

#### PRD-KBVON-045 — Sample Template is downloadable from New Upload

- **Why it matters.** The upload must follow the template's format.
- **Setup.** Buyer on the Bulk Upload page.
- **Steps.**
  1. Click **New Upload**.
  2. Download the **Sample Template**.
- **Expected.** The Sample Template Excel sheet downloads.
- **Oracle.** Downloaded file opens as an Excel sheet with the vendor-detail columns.
- **Trace.** P2 · automate-later · `c5092226c8b283158c3301791b339247` · `how-to-bulk-upload-vendors` · Notion KB › Vendor Onboarding › How to Bulk Upload Vendors?

## 7. Pre-Qualification (PQ) Score

#### PRD-KBVON-046 — Score a vendor with an Evaluation Matrix

- **Why it matters.** The PQ Score is the numerical rating buyers use for risk assessment before onboarding or awarding business.
- **Setup.** Buyer user; a vendor whose onboarding response is on the Onboarding Details tab; an evaluation matrix exists.
- **Steps.**
  1. Go to the **Vendors** tab, open the vendor profile and click **Onboarding Details**.
  2. Click **Start Evaluation** (top-right).
  3. Scroll to the **Evaluation Matrix Type** dropdown and choose the relevant matrix.
  4. For each question in the sections that appear, enter a response and assign a score.
- **Expected.** Selecting a matrix shows multiple sections and questions; responses and scores can be entered for each question.
- **Oracle.** Sections and questions render after matrix selection; entered scores are shown.
- **Trace.** P0 · automate-later · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-047 — Section scores are auto-summed

- **Why it matters.** Section totals feed the overall vendor score.
- **Setup.** Buyer scoring a vendor with a selected Evaluation Matrix.
- **Steps.**
  1. Assign scores to every question in one section.
  2. Look at the top of that section.
- **Expected.** The section's scores are auto-summed at the top of the section.
- **Oracle.** Section total equals the sum of the question scores entered.
- **Trace.** P1 · automate-later · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-048 — Example question max scores: Active years in business

- **Why it matters.** Each answer band has a maximum score; scoring above the band max would inflate the PQ Score.
- **Setup.** Evaluation matrix containing the *Active years in business* question as in the article.
- **Steps.**
  1. Answer 7+ years and assign the score.
  2. Answer 5–7 years and assign the score.
  3. Answer 3–5 years and assign the score.
- **Expected.** Max score is 5 for 7+ years, 3 for 5–7 years, 2 for 3–5 years.
- **Oracle.** The score allowed for each answer does not exceed its stated max.
- **Trace.** P1 · manual · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-049 — Question types Yes/No, MCQ and Binary

- **Why it matters.** Matrices mix question types; each must be answerable and scorable.
- **Setup.** Evaluation matrix with Yes/No, Multiple Choice and Binary questions.
- **Steps.**
  1. Answer and score one question of each type.
- **Expected.** Each question type can be answered and scored.
- **Oracle.** Responses and scores are recorded for all three types.
- **Trace.** P2 · manual · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-050 — Send the scored vendor for approval

- **Why it matters.** The PQ evaluation goes through the approval workflow before the score is generated.
- **Setup.** Buyer who has completed scoring; approval workflow with an approver.
- **Steps.**
  1. Click **Approve** at the bottom.
  2. In the **Send for Approval** side panel, add **Category** and **Location** if needed and click Next.
  3. Review the approval workflow, add remarks, and select an approver.
  4. Click **Continue**.
- **Expected.** The vendor is submitted for approval.
- **Oracle.** Send for Approval completes; the item is pending with the selected approver.
- **Trace.** P0 · automate-later · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-051 — Total Vendor Score generated after approval

- **Why it matters.** The Total Vendor Score is the PQ outcome buyers compare vendors on.
- **Setup.** A scored vendor sent for approval (PRD-KBVON-050).
- **Steps.**
  1. Approver approves.
  2. Open the vendor's profile / Onboarding Details.
- **Expected.** The system generates a **Total Vendor Score** with a colour label (e.g. 95, Green - High Quality).
- **Oracle.** Total Vendor Score value and colour are displayed.
- **Trace.** P0 · automate-later · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-052 — PQ Score colour coding Green / Yellow / Red

- **Why it matters.** The colour is the at-a-glance risk signal: good choice, caution, or high-risk.
- **Setup.** Three vendors scored and approved with totals of about 75, 50 and 25.
- **Steps.**
  1. Open each vendor's Total Vendor Score.
- **Expected.** Above 60 shows Green (good choice); 40–60 shows Yellow (average, caution advised); below 40 shows Red (high-risk).
- **Oracle.** Colours: 75 Green, 50 Yellow, 25 Red.
- **Trace.** P1 · automate-later · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score

#### PRD-KBVON-053 — PQ Score colour at the 40 and 60 boundaries

- **Why it matters.** The stated bands are "Above 60" Green, "40–60" Yellow, "Below 40" Red, so exactly 40 and exactly 60 should be Yellow; an off-by-one would mislabel risk.
- **Setup.** Vendors scored and approved with totals of exactly 60, exactly 40, 61 and 39.
- **Steps.**
  1. Open each vendor's Total Vendor Score.
- **Expected.** 60 and 40 are Yellow; 61 is Green; 39 is Red.
- **Oracle.** Colour shown for each boundary value.
- **Trace.** P1 · manual · `de692226c8b283afb03c8136ece9e277` · `pre-qualification-pq-score` · Notion KB › Vendor Onboarding › Pre-Qualification (PQ) Score
