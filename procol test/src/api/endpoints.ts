/**
 * All endpoint paths, mined from the app source + the Postman collection.
 * Paths are appended to the client baseURL (which already includes `/api`).
 */
export const Endpoints = {
  // ── auth ──
  generateOtp: () => "/v1/generate_otp",
  verifyOtp: () => "/v1/verify_otp",

  // ── reads / config ──
  dashboardConfiguration: () => "/v1/dashboard_configuration",
  recentAccountActivity: () => "/session/recent_account_activity",
  orders: () => "/orders",

  // ── event group (RFx container) ──
  eventGroups: () => "/event_groups",
  eventGroup: (uuid: string) => `/event_groups/${uuid}`,
  eventGroupLineItems: (uuid: string) => `/event_groups/${uuid}/get_line_items`,
  eventGroupAudience: (uuid: string) => `/event_groups/${uuid}/get_audience`,
  eventGroupCreateClone: (uuid: string) => `/event_groups/${uuid}/create_clone`,
  eventGroupParticipants: (uuid: string) => `/event_groups/${uuid}/participants`,
  eventGroupRejectParticipant: (uuid: string) => `/event_groups/${uuid}/reject_participant`,
  eventGroupChangeOwnership: (uuid: string) => `/event_groups/${uuid}/change_ownership`,
  updateEgli: () => "/event_groups/update_egli",

  // ── trade / stage ──
  createTrade: () =>
    "/trade/template_input?template_name=trade&additional_fields=order_details",
  tradeDetails: (tradeId: string) =>
    `/trade/${tradeId}?response_type=template&additional_fields=order_details`,
  tradeSchema: (tradeId: string) =>
    `/v1/trade/${tradeId}/schema?response_type=template&additional_fields=order_details`,
  eventIndicators: (tradeId: string) => `/v1/trade/${tradeId}/event_indicators`,
  moveToAuction: () => "/trade/move_to_auction",
  addAudience: (tradeId: string) => `/v1/trade/add_audience?id=${tradeId}`,

  // ── technical responses (vendor + surrogate) ──
  templateResponses: () => "/template_responses",
  createPageResponses: (respUuid: string) =>
    `/template_responses/${respUuid}/create_page_responses`,
  templateResponse: (respUuid: string) => `/template_responses/${respUuid}`,
  createSurrogateResponse: () => "/template_responses/create_surrogate_response",

  // ── bids ──
  createBid: () => "/v1/bids",
  createBidProducts: (bidUuid: string) => `/v1/bids/${bidUuid}/create_bid_products`,
  submitBid: (bidUuid: string) => `/v1/bids/${bidUuid}`,
  surrogateRfqBid: () => "/bids/template_input",

  // ── evaluation ──
  evaluations: () => "/evaluations",
  submitEvaluation: () => "/evaluations/submit",

  // ── feature flows ──
  itemVersions: () => "/item_versions",
  raiseAdditionalRequest: () => "/additional_request/raise_additional_request",

  // ── awarding ──
  proposal: () => "/proposal",
  proposalAddResponse: (proposalUuid: string, lotNo = "") =>
    `/proposal/${proposalUuid}/add_response?lot_no=${lotNo}`,
  proposalApprovalWorkflows: (proposalUuid: string) =>
    `/proposal/${proposalUuid}/approval_workflows`,
  proposalSubmit: (proposalUuid: string) => `/proposal/${proposalUuid}/submit`,
  proposalCreateContractForm: (proposalUuid: string) => `/proposal/${proposalUuid}/create_contract_form`,
  downloadAwardingSheet: (uuid: string) => `/reports/download_awarding_sheet/${uuid}`,

  // ── bids (extra authorization probes) ──
  bidFeedback: (bidId: string) => `/bids/${bidId}/feedback`,
  bidApprovalWorkflowsForSurrogate: () => "/bids/approval_workflows_for_surrogate_bid_create",
  tradeUploadBidExcel: (tradeId: string) => `/trade/${tradeId}/upload_bid_excel`,

  // ── company users ──
  getAllUsers: (filtersJson = '{"statuses":["active"]}') =>
    `/get_all_users?filters=${encodeURIComponent(filtersJson)}`,

  // ── catalog discovery (per-company, for building flows dynamically) ──
  productsSearch: (query: string) => `/products/search?query=${encodeURIComponent(query)}`,
  templatesByType: (typeIdentifier: string) =>
    `/templates?type_identifier=${typeIdentifier}&hide_onboarding_v2_templates=true`,
  templateDetails: (id: string) => `/templates/${id}`,
  // BOQ excel: download blank template + parse a filled one
  boqExcelTemplate: (templateId: string) =>
    `/templates/excel_template/${templateId}?sheet_type=boq_items_sheet`,
  productSheetParams: () => "/templates/product_sheet_params",
  buyerHubsAutocomplete: (query: string) =>
    `/buyer_hubs/autocomplete?query=${encodeURIComponent(query)}`,

  // ── purchase requisitions (PR) → event ──
  purchaseRequests: (page = 1) => `/purchase_requests?page=${page}`,
  purchaseRequest: (id: string) => `/purchase_requests/${id}`,
  priToDraftProject: (eventGroupUuid: string) =>
    `/event_groups/${eventGroupUuid}/pri_to_draft_project`,

  // ── master data (create + verify) ──
  productCategories: () => "/product_categories",
  productCategorySearch: (query = "") =>
    `/product_categories/search?query=${encodeURIComponent(query)}&show_in_active=true`,
  categoryChildren: (categoryId: string) =>
    `/product_categories/hierarchy/${categoryId}/childrens`,
  createProduct: () => "/products",
  getAllProducts: () => "/products/get_all_products",
  createBuyerHub: () => "/buyer_hubs/create",
  buyerHubsAll: () => "/buyer_hubs/all",
  citiesAutocomplete: (query: string) =>
    `/cities/autocomplete?query=${encodeURIComponent(query)}&additional_fields=countries`,
  createUser: () => "/users/create_user",
  createTeam: () => "/teams",
  teamAddMember: () => "/teams/add_member_dashboard",
  teamNames: () => "/teams/get_all?only_team_names=true",

  // ── vendor discovery ──
  vendorlistFiltered: () => "/companies/vendorlist_filtered",
  allVendors: (page: number) =>
    `/companies/all_vendors?search=${encodeURIComponent(
      JSON.stringify({ category: "name", value: "" }),
    )}&page=${page}&tab=unverified`,
} as const;
