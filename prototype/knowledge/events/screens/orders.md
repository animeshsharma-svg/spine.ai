# Screen: orders (/orders)

Captured 2026-10-29 on company 198678. 10 controls, 0 with a known effect, 4 test cases written from it.

## How to reach the orders screen

Plan steps: (unknown). Path: `/orders`.

## What each control on orders does

## Test cases written from the orders screen

- GEN-SCR-410: An invalid tab value opens the Live tab. Steps: Log in to Procol (buyer side) with the buyer user Open /orders?tab=INVALID in the browser Wait for the orders page to finish loading Expected: The orders page opens on the "Live 9354" tab, and the browser URL contains ?tab=live instead of ?tab=INVALID. [plan: full]
- GEN-SCR-411: Create Event M opens the old auction creation screen when eRFX is off. Steps: Log in to Procol (buyer side) with the buyer user Open the orders page Click "Create Event M" Expected: The old auction creation screen opens. The quick-create screen does not open. [plan: none]
- GEN-SCR-412: A Live search with no matches shows the filtered no-result state. Steps: Log in to Procol (buyer side) with the buyer user Open the orders page Click "Live 9354" Type "QA_NO_MATCH_987654" in "Search Title" Wait at least 1 second for the search to apply Expected: The Live list shows the app's filtered no-result copy. The unfiltered empty Live state is not shown, and the repeated "Create Event M" action is not shown as the empty-state replacement. [plan: full]
- GEN-SCR-413: Date range fields are disabled on History and their Live-tab state is recorded. Steps: Log in to Procol (buyer side) with the buyer user Open the orders page Confirm that "History 2077" is selected Check that "Starting from" is disabled Check that "Ending at" is disabled Click "Live 9354" Check the state of "Starting from" Check the state of "Ending at" Expected: "Starting from" and "Ending at" are disabled while "History 2077" is selected. After clicking "Live 9354", Record what happens to both fields, including whether either field becomes enabled. [plan: full]
