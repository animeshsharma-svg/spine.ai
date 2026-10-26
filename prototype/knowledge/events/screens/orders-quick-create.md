# Screen: orders-quick-create (/orders/quick-create)

Captured 2026-10-26 on company 198678. 8 controls, 0 with a known effect, 4 test cases written from it.

## How to reach the orders-quick-create screen

Plan steps: (unknown). Path: `/orders/quick-create`.

## What each control on orders-quick-create does

## Test cases written from the orders-quick-create screen

- GEN-SCR-384: Ask Clara starts the AI RFP flow when line items exist. Steps: Click "Ask Clara". Inspect the network requests. Wait for the request to finish. Expected: The app sends POST /ask_ai_chats/rfp_questions and then GET /external_requests/:uuid. The AI RFP result or status is shown after the request completes. [plan: partial]
- GEN-SCR-385: Save as draft auto-generates an untouched project title. Steps: Click "Save as draft". Wait for the save to complete. Expected: The draft saves successfully. "Enter the title of the project" shows an auto-generated project title instead of remaining empty. [plan: partial]
- GEN-SCR-386: Whitespace-only project title is accepted past client validation. Steps: Click "Enter the title of the project". Enter one or more spaces. Click "Publish". Inspect the publish request. Expected: The app does not show "Please fill project title!". The publish flow proceeds to its next validation or request, and the request contains the whitespace title. [plan: partial]
- GEN-SCR-387: Events opens the events list. Steps: Click "Events". Expected: The app navigates away from orders-quick-create to the events list. [plan: full]
