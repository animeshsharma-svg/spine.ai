# Screen: project-id-id (/project/UWRnY2Rk/Z2Nra1Fr)

Captured 2026-10-29 on company 198678, with the event in state "live". 19 controls, 0 with a known effect, 7 test cases written from it.

## How to reach the project-id-id screen

Plan steps: open_prepared {"screen":"summary"}. Path: `/project/UWRnY2Rk/Z2Nra1Fr`.
Headings on it: spine-API-automation-14371789 | 1h : 30m : 28s.
It shows: No bids placed yet.Click hereto view response template..

## What each control on project-id-id does

## Test cases written from the project-id-id screen

- GEN-SCR-414: Click here opens the response template. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "RFQ" Click "Responses" Click "Click here" Expected: The response template opens. Record the fields and values shown in the response template. [plan: partial]
- GEN-SCR-415: Overview shows the project identifier and creation details. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "Overview" Expected: The Overview page shows "Project ID" as "#<refId>", "Created at" as the project's date and time, and "Open Tender Event" as "Yes". [plan: none]
- GEN-SCR-416: Participants shows response count tags for the line items and vendors. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "Project Details" Click "Participants" Expected: The line-item and participant panel headers show count tags. With no bids or participant responses, the displayed response counts are 0. Record any difference in the header wording or count. [plan: partial]
- GEN-SCR-417: Overview shows the project ID, created date and open tender status when enabled. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "Project Details" Click "Overview" Expected: The Overview shows Project ID as the project reference preceded by #, Created at as a date and time, and Open Tender Event: Yes. [plan: partial]
- GEN-SCR-418: Overview does not show the open tender status when the setting is disabled. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "Project Details" Click "Overview" Expected: The Overview shows Project ID as the project reference preceded by # and Created at as a date and time. Open Tender Event is not shown. [plan: none]
- GEN-SCR-419: Line Items and Participants show response count tags. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "Project Details" Expected: The Line Items and Participants panel headers each show a count tag. With no bids or responses, the response counts are 0. [plan: none]
- GEN-SCR-420: Click here opens the response template from the no-bids message. Steps: Log in to Procol (buyer side) with the buyer user Open the live project Click "RFQ" Click "Responses" Click "Click here" Expected: The response template opens. The no-bids message is replaced by, or the browser navigates to, the response-template view. [plan: partial]
