import { UiFlowModule } from "./types.js";
import { erfxRfqFlow } from "../flows/erfxRfq.js";
import { rfpOnlyFlow, rfpRfqFlow, multiProductFlow, auctionRankFlow, rfqAuctionFlow, rfpAuctionFlow } from "../flows/events.js";
import { draftCreateFlow, scheduledEventFlow } from "../flows/lifecycle.js";
import { createTeamFlow, createLocationFlow, createUserFlow, createProductFlow } from "../flows/masterData.js";
import { showDraftTabFlow } from "../flows/display.js";
import { bidSubmitFlow } from "../flows/bid.js";
import {
  approvalsUserFlow,
  approvalsCompanyFlow,
  prReorderFlow,
  prListFlow,
  vendorManagementFlow,
  prBulkUploadFlow,
  userListFlow,
  userErpIdFlow,
  vendorOnboardingFlow,
  contractCreateFlow,
} from "../flows/navChecks.js";
import {
  singleStageRfqFlow,
  auctionPriceFlow,
  awardLotWiseFlow,
  awardLineItemWiseFlow,
  // Deferred (kept in code, not registered — verified they need extra config):
  //  - singleStageRfpFlow      : title-fill edge case; RFP covered by events.rfp_only
  //  - auctionTrafficLightFlow : needs a "specified range" config step before Save
} from "../flows/singleStage.js";
import { publishWithoutVendorFlow } from "../flows/validation.js";

/**
 * The master list of UI flows — the orchestra the AI orchestrator conducts.
 * Mirrors the API framework's REGISTRY. Add flows here as they are built.
 */
export const REGISTRY: UiFlowModule[] = [
  // events — eRFX (project) creation variants
  erfxRfqFlow,
  rfpOnlyFlow,
  rfpRfqFlow,
  multiProductFlow,
  auctionRankFlow,
  rfqAuctionFlow,
  rfpAuctionFlow,
  // events — single-stage (non-eRFX) + auction sub-types + awarding modes
  singleStageRfqFlow,
  auctionPriceFlow,
  awardLotWiseFlow,
  awardLineItemWiseFlow,
  // lifecycle — config-gated
  draftCreateFlow,
  scheduledEventFlow,
  // display / assertion — config-gated
  showDraftTabFlow,
  // bid — pure-UI vendor journey (keystone for awarding/eval)
  bidSubmitFlow,
  // pr / approvals / vendor — config-gated nav+assert
  prListFlow,
  prReorderFlow,
  prBulkUploadFlow,
  approvalsUserFlow,
  approvalsCompanyFlow,
  vendorManagementFlow,
  vendorOnboardingFlow,
  contractCreateFlow,
  // masterdata — config-gated nav+assert
  userListFlow,
  userErpIdFlow,
  // masterdata — create flows (full-field)
  createLocationFlow,
  createUserFlow,
  // validation — journeys that prove the console REFUSES something
  publishWithoutVendorFlow,
];

export function registryByCategory(): Record<string, UiFlowModule[]> {
  const out: Record<string, UiFlowModule[]> = {};
  for (const m of REGISTRY) (out[m.category] ??= []).push(m);
  return out;
}
