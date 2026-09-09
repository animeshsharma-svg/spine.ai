import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { CONFIG } from "../config.js";
import {
  buildAwardResponseBody,
  buildAwardSubmitBody,
  buildProposalBody,
} from "./bodies.js";

/** create proposal [28]. */
export async function createProposal(buyerApi: ApiClient, eventGroupUuid: string) {
  const res = await buyerApi.post<{ uuid: string }>(Endpoints.proposal(), {
    body: buildProposalBody({ eventGroupUuid }),
  });
  return res.uuid;
}

/** read approval workflow for a proposal [30]. */
export async function getApprovalFlows(buyerApi: ApiClient, proposalUuid: string) {
  const flows = await buyerApi.get<any[]>(Endpoints.proposalApprovalWorkflows(proposalUuid));
  const approvalFlowUuid = flows[0]?.uuid;
  const approvers: string[] = [];
  (flows[0]?.steps || []).forEach((step: any) =>
    (step.approvers || []).forEach((a: any) => approvers.push(a.uuid)),
  );
  return { approvalFlowUuid, approvers };
}

/** add award response [29] — requires a submitted bid on the line item. */
export async function addAwardResponse(
  buyerApi: ApiClient,
  proposalUuid: string,
  lineItemUuid: string,
  vendorCompanyUuid: string = CONFIG.catalog.vendorBidCompanyUuid,
) {
  return buyerApi.post(Endpoints.proposalAddResponse(proposalUuid), {
    body: buildAwardResponseBody({
      vendorCompanyUuid,
      lineItemUuid,
      quantityValue: CONFIG.testData.quantityValue,
    }),
  });
}

/** submit proposal [31]. */
export async function submitProposal(
  buyerApi: ApiClient,
  proposalUuid: string,
  approvalFlowUuid: string,
) {
  const res = await buyerApi.post<{ success?: boolean }>(
    Endpoints.proposalSubmit(proposalUuid),
    { body: buildAwardSubmitBody({ approvalFlowUuid }) },
  );
  return res?.success !== false;
}

export interface AwardingResult {
  proposalUuid: string;
  approvalFlowUuid: string;
  approvers: string[];
  submitted: boolean;
}

/**
 * Full buyer awarding flow [28]→[31]. Requires a submitted vendor bid on the
 * line item (add_response). Use the granular functions above when you only
 * need the buyer-only steps (create proposal + read approval workflow).
 */
export async function runAwarding(
  buyerApi: ApiClient,
  eventGroupUuid: string,
  lineItemUuid: string,
  vendorCompanyUuid: string = CONFIG.catalog.vendorBidCompanyUuid,
): Promise<AwardingResult> {
  const proposalUuid = await createProposal(buyerApi, eventGroupUuid);
  await addAwardResponse(buyerApi, proposalUuid, lineItemUuid, vendorCompanyUuid);
  const { approvalFlowUuid, approvers } = await getApprovalFlows(buyerApi, proposalUuid);
  const submitted = await submitProposal(buyerApi, proposalUuid, approvalFlowUuid);
  return { proposalUuid, approvalFlowUuid, approvers, submitted };
}
