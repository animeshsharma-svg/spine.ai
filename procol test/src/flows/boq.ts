import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface BoqLineItem {
  product_uuid: string;
  quantity: { unitSymbol: string; value: number };
  product_quality_uuid?: string;
  line_item_no?: string;
  name?: string;
}

export interface BoqResult {
  templateUuid: string;
  templateName?: string;
  tabs: number;
  sections: number;
  lineItems: BoqLineItem[];
  eventGroupUuid: string;
  refUuid?: string;
  title: string;
}

/** Flatten the parsed product_sheet_params response (tabs → sections → line_items). */
function flattenBoq(validData: any[]): { lineItems: BoqLineItem[]; sections: number } {
  const lineItems: BoqLineItem[] = [];
  let sections = 0;
  for (const tab of validData ?? []) {
    for (const section of tab?.data ?? []) {
      sections++;
      for (const li of section?.line_items ?? []) {
        const p = li?.product;
        if (!p?.uuid) continue;
        const qtyRaw = li?.creator_quantity?.value;
        const unit = li?.creator_quantity?.configuration?.unit_type ?? "Unit";
        lineItems.push({
          product_uuid: p.uuid,
          product_quality_uuid: p?.variants?.[0]?.uuid,
          quantity: { unitSymbol: unit, value: Number(qtyRaw) || 1 },
          line_item_no: p?.line_item_no,
          name: p?.value,
        });
      }
    }
  }
  return { lineItems, sections };
}

/**
 * BOQ event flow (gated on boq_in_erfx_allowed):
 *   pick BOQ template → download its Excel → upload/parse via
 *   product_sheet_params → create a BOQ event group (config.boq_based_rfx)
 *   with the parsed line items.
 * The sample Excel the backend returns is already populated, so re-uploading it
 * parses cleanly — no Excel authoring needed for a first pass.
 */
export async function createBoqEvent(
  buyerApi: ApiClient,
  opts: { templateUuid?: string; title?: string } = {},
): Promise<BoqResult> {
  // 1) BOQ template
  let templateUuid = opts.templateUuid;
  let templateName: string | undefined;
  if (!templateUuid) {
    const list = await buyerApi.get<any>(Endpoints.templatesByType("boq"));
    const tpl = list.default?.[0] ?? list.saved?.[0];
    if (!tpl?.uuid) throw new Error("No BOQ template available for this client.");
    templateUuid = tpl.uuid;
    templateName = tpl.name;
  }

  // 2) download the (pre-filled) BOQ Excel template
  const ex = await buyerApi.get<{ excel_url?: string }>(Endpoints.boqExcelTemplate(templateUuid!));
  if (!ex.excel_url) throw new Error("BOQ excel_template returned no excel_url.");
  const excelBuf = Buffer.from(await (await fetch(ex.excel_url)).arrayBuffer());
  const excelBase64 = excelBuf.toString("base64");

  // 3) parse it into line items
  const parsed = await buyerApi.post<{ valid?: { data?: any[] }; in_valid?: unknown }>(
    Endpoints.productSheetParams(),
    { body: { template_uuid: templateUuid, excel_data: excelBase64, excel_type: "multistage" } },
  );
  const validData = parsed.valid?.data ?? [];
  if (validData.length === 0) {
    throw new Error(`BOQ parse produced no data (in_valid: ${JSON.stringify(parsed.in_valid)})`);
  }
  const { lineItems, sections } = flattenBoq(validData);
  if (lineItems.length === 0) throw new Error("BOQ parse produced no line items.");

  // 4) create the BOQ event group (draft) with config.boq_based_rfx
  const rawTitle = opts.title ?? `BOQ_${Date.now()}`;
  const title = rawTitle.startsWith("API_Test_") ? rawTitle : `API_Test_${rawTitle}`;
  const group = await buyerApi.post<{ uuid: string; ref_uuid?: string }>(Endpoints.eventGroups(), {
    body: {
      status: "draft",
      title,
      config: { boq_based_rfx: true },
      line_items: lineItems.map((li, i) => ({
        product_uuid: li.product_uuid,
        product_quality_uuid: li.product_quality_uuid,
        quantity: li.quantity,
        serial_number: i + 1,
      })),
    },
  });
  if (!group.uuid) throw new Error("BOQ event group create returned no uuid.");

  return {
    templateUuid: templateUuid!,
    templateName,
    tabs: validData.length,
    sections,
    lineItems,
    eventGroupUuid: group.uuid,
    refUuid: group.ref_uuid,
    title,
  };
}
