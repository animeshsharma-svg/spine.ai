import { test, expect } from '@playwright/test';
import { config } from './fixtures/config';
import { state } from './fixtures/state';
import {
  fxResponseSchema,
  workflowRunSchema,
  viewRecordsSchema,
  responseDetailSchema,
  automationTriggerSchema,
  validateSchema,
} from './fixtures/schemas';
import { callApi, assertCommon, findField, findColumnIndex, qs, assertFieldTouched } from './fixtures/api-helpers';

// Playwright port of Decathlon_3Way_Match.postman_collection.json.
// Same 20 steps, same order, same 4 assertion categories per step:
//   1. status code   2. response time   3. schema validation   4. data validation
//
// This MUST run as one strict serial chain -- step N's request body depends on step N-1's
// captured uuid, exactly like the Postman collection's Runner order.
test.describe.serial('Decathlon 3-Way Match: PO -> GRN -> Invoice -> Bill', () => {
  // ---------------- 1. PURCHASE ORDER ----------------

  test('1. Create PO (header)', async ({ request }) => {
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_responses/create_row`,
      { datasource_uuid: 'UWdrWlo=', responses: [] }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: create_row response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });

    state.poUuid = body.response.uuid;

    await test.step('data: po_uuid captured', () => {
      expect(state.poUuid, 'po_uuid should be set').toBeTruthy();
    });
  });

  test('2. Set PO Vendor (required for the matching automations)', async ({ request }) => {
    // cFpna2dk = 'Vendor GST', an external_relation field. Setting it alone cascades server-side
    // and auto-fills the other vendor fields (Vendor Name, Address, Email, Supplier Third
    // number) from the same external vendor record -- confirmed from the HAR response.
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.poUuid}`,
      {
        datasource_uuid: 'UWdrWlo=',
        responses: [{ field_uuid: 'cFpna2dk', value: config.vendorRelationUuid }],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Vendor GST relation persisted correctly', () => {
      const fr = findField(body, 'cFpna2dk');
      expect(fr, 'field_response for cFpna2dk should exist').toBeTruthy();
      expect(fr.value?.record_uuid).toBe(config.vendorRelationUuid);
    });
  });

  test('3. Create PO Line Item', async ({ request }) => {
    // RGNRa2dk = 'Purchase Order' relation field, links this line item back to the PO header.
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_responses/create_row`,
      { datasource_uuid: 'ZERrWlo=', responses: [{ field_uuid: 'RGNRa2dk', value: state.poUuid }] }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: create_row response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });

    state.poLineUuid = body.response.uuid;

    await test.step('data: po_line_uuid captured', () => {
      expect(state.poLineUuid, 'po_line_uuid should be set').toBeTruthy();
    });
  });

  test('4. Set PO Qty & Unit Price', async ({ request }) => {
    // RGNna2dk=Qty, a2REa2dk=Unit Price, a1FRa2dk=Base Price (formula qty*unit_price),
    // a2RYa2dk=Tax Amount, RGdja2dk=Total Amount. With poQty=1 (default), Base Price ==
    // poUnitPrice == "PO Amt" in the scenario table.
    const poBasePrice = config.poQty * config.poUnitPrice;
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.poLineUuid}`,
      {
        datasource_uuid: 'ZERrWlo=',
        responses: [
          { field_uuid: 'RGNna2dk', value: String(config.poQty) },
          { field_uuid: 'a2REa2dk', value: String(config.poUnitPrice) },
          { field_uuid: 'a1FRa2dk', value: poBasePrice },
          { field_uuid: 'a2RYa2dk', value: 0 },
          { field_uuid: 'RGdja2dk', value: poBasePrice },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Unit Price persisted correctly', () => {
      const fr = findField(body, 'a2REa2dk');
      expect(Number(fr?.value)).toBe(config.poUnitPrice);
    });
    await test.step('data: Base Price (Qty x Unit Price) persisted correctly', () => {
      const fr = findField(body, 'RGdja2dk');
      expect(Number(fr?.value)).toBe(poBasePrice);
    });
  });

  test('5. Set PO Submission-Required Fields', async ({ request }) => {
    // Replicates the COMPLETE field set filled right before a real, successful Submit in the
    // HAR (status 200, PO Status advanced, no errors) rather than chasing "X is required"
    // one at a time: Linked Cost Center, Buyer GST, Buyer Billing Address, GST Rate, GST input
    // eligibility, Additional email, Expected Delivery Date, Expense Period Start/End, Payment
    // Terms, Legistify contract number/date, and T&Cs (reusing an already-uploaded file
    // reference rather than uploading a new one).
    state.nowEpoch = String(Math.floor(Date.now() / 1000));
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.poUuid}`,
      {
        datasource_uuid: 'UWdrWlo=',
        responses: [
          { field_uuid: 'RHBYRFpw', value: config.costCenterUuid },
          { field_uuid: 'cHBka2dk', value: config.buyerGstUuid },
          {
            field_uuid: 'cGRka2dk',
            value:
              'Unit No. 1, 49A, Lodha Xperia Mall, Shil Phata Mahape Road, Lodha Xperia Palava, Dombivli, Kalyan, Thane, Maharashtra, 421204',
          },
          { field_uuid: 'a2tERGRY', value: '2' },
          { field_uuid: 'ZERwa1hw', value: '0' },
          { field_uuid: 'ZGtRa1hw', value: config.testEmail },
          { field_uuid: 'cGtYa2dk', value: state.nowEpoch },
          { field_uuid: 'cERra2dk', value: state.nowEpoch },
          { field_uuid: 'Tmdra2dk', value: state.nowEpoch },
          { field_uuid: 'ZE5Oa1hw', value: '1' },
          { field_uuid: 'ZE5na1hw', value: '123456' },
          { field_uuid: 'ZE5ra1hw', value: state.nowEpoch },
          {
            field_uuid: 'Y0RwRHBn',
            value: {
              type: 'UWdrWlo=',
              value: [
                {
                  name: 'MSDCL-_Utility_-Without_PO.pdf',
                  private_url:
                    'https://agribid-dev.s3.ap-south-1.amazonaws.com/trade_files/product_sheet/DECATHLON_SPORTS_INDIA_PRIVATE_LIMITED_57675/DECATHLON_SPORTS_INDIA_PRIVATE_LIMITED_1787655573_MSDCL-_Utility_-Without_PO.pdf',
                },
              ],
            },
          },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Cost Center field was touched by this PATCH', () => {
      // Doesn't compare against costCenterUuid -- live testing showed this field echoes back a
      // raw internal id here, not the record_uuid we sent (it resolves correctly on a later
      // GET). Comparing exact values would be asserting a response shape that isn't real.
      assertFieldTouched(body, 'RHBYRFpw', 'Cost Center');
    });
    await test.step('data: Buyer GST field was touched by this PATCH', () => {
      assertFieldTouched(body, 'cHBka2dk', 'Buyer GST');
    });
  });

  test('6. Submit PO (set PO Status)', async ({ request }) => {
    // cGdYa2dk = 'PO Status' -- a dropdown [Draft, In Approval, Submitted, Released,
    // Acknowledged, On Hold, On Hold for Revision, Closed, Short Closed, Cancelled], flagged
    // read_only in the UI config. We PATCH it to 2 ('Submitted') the way the real UI's Submit
    // button does, but live testing shows the backend auto-advances it based on field
    // completeness -- it can land on 3 ('Released') rather than literally 2. That's expected:
    // the assertion below only checks it moved off Draft, not that it equals a specific index.
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.poUuid}`,
      { datasource_uuid: 'UWdrWlo=', responses: [{ field_uuid: 'cGdYa2dk', value: 2 }] }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: PO Status advanced past Draft', () => {
      const fr = findField(body, 'cGdYa2dk');
      expect(fr, 'field_response for cGdYa2dk should exist').toBeTruthy();
      expect(fr.value, 'PO Status should have moved off Draft (0)').not.toBe('0');
    });
  });

  test('7. Run Workflow: PO -> Invoice (po_buyer_to_invoice_buyer)', async ({ request }) => {
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_workflows/run?workflow_key=po_buyer_to_invoice_buyer`,
      { fx_response_uuid: state.poUuid, datasource_uuid: 'UWdrWlo=' }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: workflow run response', () => {
      const { valid, errors } = validateSchema(workflowRunSchema, body);
      expect(valid, errors).toBe(true);
    });

    state.invoiceUuid = body.fx_response_uuid;
    state.invoiceDatasource = body.fx_datasource_id;

    await test.step('data: invoice_uuid captured', () => {
      expect(state.invoiceUuid, 'invoice_uuid should be set').toBeTruthy();
    });
    await test.step('data: workflow routed to the expected Invoice datasource', () => {
      expect(state.invoiceDatasource).toBe('Z2RrWmM=');
    });
  });

  test('8. Run Workflow: PO -> PO (po_to_po, sync/approve)', async ({ request }) => {
    // Seen in the captured flow right before GRN creation -- kept in the chain even for
    // quick tests.
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_workflows/run?workflow_key=po_to_po`,
      { fx_response_uuid: state.poUuid, datasource_uuid: 'UWdrWlo=' }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: workflow run response', () => {
      const { valid, errors } = validateSchema(workflowRunSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: workflow routed back to the PO datasource', () => {
      expect(body.fx_datasource_id).toBe('UWdrWlo=');
    });
  });

  // ---------------- 2. GOODS RECEIPT NOTE (GRN) ----------------

  test('9. Run Workflow: PO -> GRN (po_to_grn)', async ({ request }) => {
    // Auto-creates the GRN header AND a GRN Line Item mirrored from the PO line -- we don't
    // create the line ourselves.
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_workflows/run?workflow_key=po_to_grn`,
      { fx_response_uuid: state.poUuid, datasource_uuid: 'UWdrWlo=' }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: workflow run response', () => {
      const { valid, errors } = validateSchema(workflowRunSchema, body);
      expect(valid, errors).toBe(true);
    });

    state.grnUuid = body.fx_response_uuid;
    state.grnDatasource = body.fx_datasource_id;

    await test.step('data: grn_uuid captured', () => {
      expect(state.grnUuid, 'grn_uuid should be set').toBeTruthy();
    });
    await test.step('data: workflow routed to the expected GRN datasource', () => {
      expect(state.grnDatasource).toBe('a3BrWmM=');
    });
  });

  test('10. Find GRN Line Item uuid', async ({ request }) => {
    // WlFOa1hO = 'Goods Receipt Note' relation field on GRN Line Item, i.e. the parent link.
    // records[] is row-oriented; records[i][0] is the row's fx_response_uuid.
    const url = `${config.baseUrl}/api/fx_views/records?${qs({
      datasource_uuid: 'UURrTlg=',
      page: '1',
      'filters[0][field_uuid]': 'WlFOa1hO',
      'filters[0][operator]': 'eq',
      'filters[0][value]': state.grnUuid,
      'filters[0][data_type]': 'relational',
    })}`;
    const { response, elapsedMs, body } = await callApi(request, 'GET', url);

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: view records response', () => {
      const { valid, errors } = validateSchema(viewRecordsSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: GRN Line Item found for this grn_uuid', () => {
      expect(Array.isArray(body.records), 'records array should exist').toBe(true);
      expect(body.records.length, 'record count').toBeGreaterThan(0);
    });

    state.grnLineUuid = body.records[0][0];

    await test.step('data: grn_line_uuid captured', () => {
      expect(state.grnLineUuid, 'grn_line_uuid should be set').toBeTruthy();
    });
  });

  test('11a. Set GRN Qty Received', async ({ request }) => {
    // Wlhwa1hO=Qty Received. Sent as its own PATCH, BEFORE Accepted Qty -- the server validates
    // "Accepted Qty <= Qty Received" against whatever Qty Received is ALREADY SAVED, not
    // against a value arriving in the same request. Sending both together can 422 even when
    // the two numbers already agree (mirrors the real UI's own save order, per the HAR).
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.grnLineUuid}`,
      {
        datasource_uuid: 'UURrTlg=',
        responses: [{ field_uuid: 'Wlhwa1hO', value: String(config.grnReceivedQty) }],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Qty Received persisted correctly', () => {
      const fr = findField(body, 'Wlhwa1hO');
      expect(Number(fr?.value)).toBe(config.grnReceivedQty);
    });
  });

  test('11b. Set GRN Accepted Qty', async ({ request }) => {
    // WmRaa1hO=Accepted Qty (server-validated: cannot exceed Qty Received, saved in 11a).
    // Wlhja1hO=Rejected Qty, a formula field (received-accepted) -- computed and sent so it
    // doesn't sit stale. Unit Price/Line Total are left untouched: the GRN line item inherits
    // Unit Price from the PO automatically -- there's no separate "GRN Amount" field to set.
    if (config.grnAcceptedQty > config.grnReceivedQty) {
      console.warn(
        `*** BALANCE VIOLATION: Accepted Qty (${config.grnAcceptedQty}) > Qty Received (${config.grnReceivedQty}). The API will reject this. Raise GRN_RECEIVED_QTY first. ***`
      );
    }
    state.grnRejectedQty = String(config.grnReceivedQty - config.grnAcceptedQty);

    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.grnLineUuid}`,
      {
        datasource_uuid: 'UURrTlg=',
        responses: [
          { field_uuid: 'WmRaa1hO', value: String(config.grnAcceptedQty) },
          { field_uuid: 'Wlhja1hO', value: state.grnRejectedQty },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Accepted Qty persisted correctly', () => {
      const fr = findField(body, 'WmRaa1hO');
      expect(Number(fr?.value)).toBe(config.grnAcceptedQty);
    });
    await test.step('data: business rule -- Accepted Qty <= Qty Received', () => {
      expect(config.grnAcceptedQty, 'accepted qty should not exceed received qty').toBeLessThanOrEqual(
        config.grnReceivedQty
      );
    });
  });

  test('12. Set GRN Header required fields (Remarks + GRN Type)', async ({ request }) => {
    // a2Nra2dR='Remarks'. a2dka2dR='GRN Type' (dropdown_select) -- the matching automation
    // 422s with "GRN Type is required" without it; "0" is the value the real UI sent.
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.grnUuid}`,
      {
        datasource_uuid: 'a3BrWmM=',
        responses: [
          { field_uuid: 'a2Nra2dR', value: config.testRemarks },
          { field_uuid: 'a2dka2dR', value: '0' },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Remarks persisted correctly', () => {
      const fr = findField(body, 'a2Nra2dR');
      expect(String(fr?.value)).toBe(config.testRemarks);
    });
  });

  test('13. Trigger GRN Matching Automation', async ({ request }) => {
    // Fires the automation that syncs the GRN's accepted amount into the linked Invoice /
    // matching engine.
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_automations/trigger_automation?automation_uuid=${encodeURIComponent(
        'TlFjcFo='
      )}`,
      { fx_response_uuid: state.grnUuid, datasource_uuid: 'a3BrWmM=' }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: automation trigger response', () => {
      const { valid, errors } = validateSchema(automationTriggerSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: automation reports success', () => {
      expect(body.success).toBe(true);
    });
  });

  // ---------------- 3. INVOICE ----------------

  test('14. Find Invoice Line Item uuid', async ({ request }) => {
    // Tlhka2dk = 'Invoice' relation field on Invoice Line Item, i.e. the parent link.
    const url = `${config.baseUrl}/api/fx_views/records?${qs({
      datasource_uuid: 'UWtrWlo=',
      page: '1',
      'filters[0][field_uuid]': 'Tlhka2dk',
      'filters[0][operator]': 'eq',
      'filters[0][value]': state.invoiceUuid,
      'filters[0][data_type]': 'relational',
    })}`;
    const { response, elapsedMs, body } = await callApi(request, 'GET', url);

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: view records response', () => {
      const { valid, errors } = validateSchema(viewRecordsSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Invoice Line Item found for this invoice_uuid', () => {
      expect(Array.isArray(body.records), 'records array should exist').toBe(true);
      expect(body.records.length, 'record count').toBeGreaterThan(0);
    });

    state.invoiceLineUuid = body.records[0][0];

    await test.step('data: invoice_line_uuid captured', () => {
      expect(state.invoiceLineUuid, 'invoice_line_uuid should be set').toBeTruthy();
    });
  });

  test('15. Set Invoice Qty / Unit Price / Base Price', async ({ request }) => {
    // Invoice Line Item: Tlpka2dk='Invoice Qty', Tk5ra2dk='Unit Price', TkRka2dk='Base Price'
    // -- unlike the PO line item, Base Price here is a plain number field, NOT a formula, so
    // all three are independently editable and don't have to agree -- exactly what's needed to
    // force a mismatch. invoiceBasePrice is the "Invoice Amt" column in the scenario table.
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.invoiceLineUuid}`,
      {
        datasource_uuid: 'UWtrWlo=',
        responses: [
          { field_uuid: 'Tlpka2dk', value: String(config.invoiceQty) },
          { field_uuid: 'Tk5ra2dk', value: String(config.invoiceUnitPrice) },
          { field_uuid: 'TkRka2dk', value: String(config.invoiceBasePrice) },
          { field_uuid: 'TnBEa2dk', value: String(config.invoiceBasePrice) },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Unit Price persisted correctly', () => {
      const fr = findField(body, 'Tk5ra2dk');
      expect(Number(fr?.value)).toBe(config.invoiceUnitPrice);
    });
    await test.step('data: Base Price persisted correctly', () => {
      const fr = findField(body, 'TkRka2dk');
      expect(Number(fr?.value)).toBe(config.invoiceBasePrice);
    });
  });

  test('16. Set Invoice required fields', async ({ request }) => {
    // ZERra2dk='Remarks'. UURaa1hw='Invoice assignment date' (stamped with current time).
    // ZGdYa2dk='Category' ("0", the value the real UI sent). ZFpra2dk='Payment Terms' and
    // UWtja1hw='Whether covered under RCM?' -- neither present in either capture, "0" is a
    // best-guess default option index (same pattern as the other dropdowns here).
    state.nowEpoch = String(Math.floor(Date.now() / 1000));
    const { response, elapsedMs, body } = await callApi(
      request,
      'PATCH',
      `${config.baseUrl}/api/fx_responses/${state.invoiceUuid}`,
      {
        datasource_uuid: state.invoiceDatasource,
        responses: [
          { field_uuid: 'ZERra2dk', value: config.testRemarks },
          { field_uuid: 'UURaa1hw', value: state.nowEpoch },
          { field_uuid: 'ZGdYa2dk', value: '0' },
          { field_uuid: 'ZFpra2dk', value: '0' },
          { field_uuid: 'UWtja1hw', value: '0' },
        ],
      }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: PATCH response', () => {
      const { valid, errors } = validateSchema(fxResponseSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Remarks persisted correctly', () => {
      const fr = findField(body, 'ZERra2dk');
      expect(String(fr?.value)).toBe(config.testRemarks);
    });
  });

  test('17. Trigger Invoice Matching Automation', async ({ request }) => {
    // Fires the 3-way match automation on the Invoice (PO Amt vs GRN Amt vs Invoice Amt).
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_automations/trigger_automation?automation_uuid=${encodeURIComponent(
        'WHBjcFo='
      )}`,
      { fx_response_uuid: state.invoiceUuid, datasource_uuid: state.invoiceDatasource }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: automation trigger response', () => {
      const { valid, errors } = validateSchema(automationTriggerSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: automation reports success', () => {
      expect(body.success).toBe(true);
    });
  });

  // ---------------- 4. BILL + RESULT ----------------

  test('18. Run Workflow: Invoice -> Bill (decathlon_invoice_to_bill)', async ({ request }) => {
    const { response, elapsedMs, body } = await callApi(
      request,
      'POST',
      `${config.baseUrl}/api/fx_workflows/run?workflow_key=decathlon_invoice_to_bill`,
      { fx_response_uuid: state.invoiceUuid, datasource_uuid: state.invoiceDatasource }
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs, true));
    await test.step('schema: workflow run response', () => {
      const { valid, errors } = validateSchema(workflowRunSchema, body);
      expect(valid, errors).toBe(true);
    });

    state.billUuid = body.fx_response_uuid;
    state.billDatasource = body.fx_datasource_id;

    await test.step('data: bill_uuid captured', () => {
      expect(state.billUuid, 'bill_uuid should be set').toBeTruthy();
    });
    await test.step('data: workflow routed to the expected Bill datasource', () => {
      expect(state.billDatasource).toBe('Z3BrWmM=');
    });
  });

  test('19. Check Result: GET GRN (Matching Status / Unmatched Amount)', async ({ request }) => {
    const { response, elapsedMs, body } = await callApi(
      request,
      'GET',
      `${config.baseUrl}/api/fx_responses/${state.grnUuid}?`
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: view records response', () => {
      const { valid, errors } = validateSchema(responseDetailSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: GRN record found', () => {
      expect(body.records?.length, 'record count').toBeGreaterThan(0);
    });
    await test.step('data: GRN Matching Status', () => {
      const idx = findColumnIndex(body.headers, 'a1pYa2dR');
      expect(idx, 'Matching Status column should exist in headers').toBeGreaterThan(-1);
      const value = body.records[0][idx];
      console.log('GRN Matching Status ->', value);
      state.lastMatchingStatus = String(value);
    });
  });

  test('20. Check Result: GET Bill (Matching Status)', async ({ request }) => {
    const { response, elapsedMs, body } = await callApi(
      request,
      'GET',
      `${config.baseUrl}/api/fx_responses/${state.billUuid}?`
    );

    await test.step('status + response time', () => assertCommon(response, elapsedMs));
    await test.step('schema: view records response', () => {
      const { valid, errors } = validateSchema(responseDetailSchema, body);
      expect(valid, errors).toBe(true);
    });
    await test.step('data: Bill record found', () => {
      expect(body.records?.length, 'record count').toBeGreaterThan(0);
    });
    await test.step('data: Bill Matching Status', () => {
      const idx = findColumnIndex(body.headers, 'UU5RRGta');
      expect(idx, 'Matching Status column should exist in headers').toBeGreaterThan(-1);
      const value = body.records[0][idx];
      console.log('Bill Matching Status ->', value);
      state.lastMatchingStatus = String(value);
    });
  });
});
