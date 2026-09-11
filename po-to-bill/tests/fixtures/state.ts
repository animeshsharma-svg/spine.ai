// Mutable state shared across the sequential test.describe.serial() steps in
// 3way-match.spec.ts -- the Playwright equivalent of the Postman environment's
// chained (non-business) variables: po_uuid, invoice_uuid, grn_uuid, etc.
export const state: Record<string, string> = {
  poUuid: '',
  poLineUuid: '',
  invoiceUuid: '',
  invoiceDatasource: '',
  invoiceLineUuid: '',
  grnUuid: '',
  grnDatasource: '',
  grnLineUuid: '',
  billUuid: '',
  billDatasource: '',
  grnRejectedQty: '0',
  nowEpoch: '',
  lastMatchingStatus: '',
};
