import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface PrToEventResult {
  prUuid: string;
  prNo?: string;
  eventGroupUuid: string;
  refUuid?: string;
  title: string;
  prLineItemUuids: string[];
  lineItemIds: string[];
}

interface PrLine {
  uuid: string; // pr_line_item_uuid
  product_uuid?: string;
  quantity_requested?: number;
  data?: { quantity?: number; uom?: string };
}

/**
 * PR → Event: take an existing Purchase Requisition's line items and create an
 * event group (project) linked back to the PR (`purchase_request_uuid` +
 * `pr_line_item_uuid` on each line). This is the mainstream "convert a PR into
 * an event" path. Creating the PR itself is upstream (intake / ERP / bulk).
 */
export async function convertPrToEvent(buyerApi: ApiClient): Promise<PrToEventResult> {
  // 1) find a PR that has product line items
  const list = await buyerApi.get<any>(Endpoints.purchaseRequests(1));
  const prs: any[] = list.purchase_requests ?? list.data ?? [];
  const pr = prs.find(
    (p) => Array.isArray(p.line_items) && p.line_items.some((li: PrLine) => li?.uuid && li?.product_uuid),
  );
  if (!pr) throw new Error("No PR with product line items found to convert.");

  const lines: PrLine[] = (pr.line_items as PrLine[]).filter((li) => li?.uuid && li?.product_uuid);

  // 2) create the event group directly from the PR's line items, linked to the PR
  const title = `API_Test_PRtoEvent_${Date.now()}`;
  const group = await buyerApi.post<{ uuid: string; ref_uuid?: string; event_group_line_item_ids?: string[] }>(
    Endpoints.eventGroups(),
    {
      body: {
        status: "draft",
        title,
        purchase_request_uuid: pr.uuid,
        line_items: lines.map((li, i) => ({
          product_uuid: li.product_uuid,
          quantity: { unitSymbol: li.data?.uom ?? "Unit", value: li.quantity_requested ?? li.data?.quantity ?? 1 },
          serial_number: i + 1,
          pr_line_item_uuid: li.uuid,
        })),
      },
    },
  );
  if (!group.uuid) throw new Error("PR→event group create returned no uuid.");

  return {
    prUuid: pr.uuid,
    prNo: pr.data?.prNo,
    eventGroupUuid: group.uuid,
    refUuid: group.ref_uuid,
    title,
    prLineItemUuids: lines.map((l) => l.uuid),
    lineItemIds: group.event_group_line_item_ids ?? [],
  };
}
