import { API_VERSION } from "@/config/constants";

/**
 * OpenAPI 3.1 description of the public REST surface. Served at
 * /api/v1/openapi and rendered by Swagger UI at /api-docs.
 * Auth: Clerk session cookies (browser) — all routes are org-scoped
 * and permission-gated server-side.
 */
export function buildOpenApiSpec(baseUrl: string) {
  const envelope = (dataSchema: object) => ({
    type: "object",
    properties: { success: { type: "boolean", const: true }, data: dataSchema },
  });
  const errorResponse = {
    description: "Error",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean", const: false },
            error: {
              type: "object",
              properties: { message: { type: "string" }, code: { type: "string" } },
            },
          },
        },
      },
    },
  };
  const paginated = (itemRef: object) =>
    envelope({
      type: "object",
      properties: {
        items: { type: "array", items: itemRef },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
        hasMore: { type: "boolean" },
      },
    });

  return {
    openapi: "3.1.0",
    info: {
      title: "LedgerFlow AI API",
      version: API_VERSION,
      description:
        "AI-powered bookkeeping. Documents in → OCR → AI extraction → human review → double-entry ledger. " +
        "All endpoints are organization-scoped and permission-gated. Responses use a uniform envelope: " +
        "`{success, data}` or `{success:false, error:{message, code}}`.",
    },
    servers: [{ url: `${baseUrl}/api/${API_VERSION}` }],
    tags: [
      { name: "Documents" }, { name: "Accounting" }, { name: "Reports" },
      { name: "Transactions" }, { name: "Automations" }, { name: "Billing" }, { name: "Webhooks" },
    ],
    paths: {
      "/documents/upload-url": {
        post: {
          tags: ["Documents"],
          summary: "Create presigned upload URLs (max 20 files, 25 MB each)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    files: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          filename: { type: "string" },
                          mimeType: { type: "string", example: "application/pdf" },
                          sizeBytes: { type: "integer" },
                        },
                        required: ["filename", "mimeType", "sizeBytes"],
                      },
                    },
                  },
                  required: ["files"],
                },
              },
            },
          },
          responses: {
            "201": { description: "Upload slots", content: { "application/json": { schema: envelope({ type: "object" }) } } },
            "402": { ...errorResponse, description: "Plan limit reached or subscription inactive" },
            "422": errorResponse,
          },
        },
      },
      "/documents": {
        get: {
          tags: ["Documents"],
          summary: "List documents",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["UPLOADED", "OCR_PROCESSING", "EXTRACTING", "NEEDS_REVIEW", "APPROVED", "POSTED", "REJECTED", "FAILED"] } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Documents", content: { "application/json": { schema: paginated({ type: "object" }) } } } },
        },
      },
      "/documents/{id}": {
        get: { tags: ["Documents"], summary: "Document detail with extracted fields and a signed view URL", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Document" }, "404": errorResponse } },
        delete: { tags: ["Documents"], summary: "Delete a document (not allowed once POSTED)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" }, "409": errorResponse } },
      },
      "/documents/{id}/approve": {
        post: { tags: ["Documents"], summary: "Approve a reviewed document — generates and posts the journal entry", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Posted" }, "409": errorResponse, "422": errorResponse } },
      },
      "/documents/{id}/fields": {
        patch: { tags: ["Documents"], summary: "Correct extracted fields before approval", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Corrected" } } },
      },
      "/accounts": {
        get: { tags: ["Accounting"], summary: "Chart of accounts with posted balances", responses: { "200": { description: "Accounts" } } },
        post: { tags: ["Accounting"], summary: "Create an account", responses: { "201": { description: "Created" } } },
      },
      "/journal-entries": {
        get: { tags: ["Accounting"], summary: "List journal entries with lines", responses: { "200": { description: "Entries" } } },
        post: { tags: ["Accounting"], summary: "Create a manual or adjusting entry (must balance)", responses: { "201": { description: "Created" }, "422": { ...errorResponse, description: "Unbalanced or invalid entry" } } },
      },
      "/journal-entries/{id}/reverse": {
        post: { tags: ["Accounting"], summary: "Reverse a posted entry (the only correction path)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Reversal posted" }, "422": errorResponse } },
      },
      "/reports/{type}": {
        get: {
          tags: ["Reports"],
          summary: "trial-balance | balance-sheet (asOf) · income-statement | cash-flow (from,to)",
          parameters: [
            { name: "type", in: "path", required: true, schema: { type: "string", enum: ["trial-balance", "balance-sheet", "income-statement", "cash-flow"] } },
            { name: "asOf", in: "query", schema: { type: "string", format: "date" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Report" } },
        },
      },
      "/transactions": {
        get: { tags: ["Transactions"], summary: "Bank transactions", responses: { "200": { description: "Transactions" } } },
        patch: { tags: ["Transactions"], summary: "Set or clear a transaction's category", responses: { "200": { description: "Updated" } } },
      },
      "/automations/run": {
        post: { tags: ["Automations"], summary: "Queue a full automation sweep for the org", responses: { "200": { description: "Queued" } } },
      },
      "/billing/summary": { get: { tags: ["Billing"], summary: "Plan, status, usage", responses: { "200": { description: "Summary" } } } },
      "/webhook-endpoints": {
        get: { tags: ["Webhooks"], summary: "List outbound webhook endpoints with recent delivery health", responses: { "200": { description: "Endpoints" } } },
        post: {
          tags: ["Webhooks"],
          summary: "Register an https endpoint — the signing secret is returned once",
          description:
            "Deliveries are signed: X-LedgerFlow-Signature = hex(HMAC-SHA256(secret, `${X-LedgerFlow-Timestamp}.${body}`)). Events: document.review_ready, document.posted, document.failed.",
          responses: { "201": { description: "Created (includes secret)" } },
        },
      },
    },
  };
}
