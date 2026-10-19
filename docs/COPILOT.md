# AI Copilot

Claude-powered assistant with function-calling RAG over the organization's
live financial data. No embeddings/vector store: bookkeeping questions are
precise and relational, so tools query Postgres directly and the model
grounds every number in tool results.

## Loop (`services/copilot/agent.ts`)

persist user msg → Claude + tools → execute tool_use blocks (org-scoped) →
feed tool_results back → repeat (≤8 iterations) → persist assistant msg with
its tool-call trace and token usage. Tool failures return as `is_error`
results so the model can self-correct (bad date, unknown account) instead of
failing the turn. History is capped at 20 messages; tool outputs at 30k chars.

## Tools

| Tool | Access |
|---|---|
| get_report (IS/BS/CF/TB) | read |
| list_accounts · list_journal_entries · list_transactions · list_documents | read |
| find_duplicate_invoices (vendor+number, vendor+amount+date) | read |
| categorize_transaction (by account code) | **staging write** — review still gates posting |

Tenancy: `organizationId` comes from the authenticated request context and is
injected into every executor — the model cannot address another tenant.
Ledger posting deliberately has no tool (asserted by a test).

## Example flows the system prompt teaches

- "Why did expenses increase?" → income statement for both months → per-account diff
- "Explain entry #12" → list_journal_entries{entryNumber} → line-by-line walk
- "Month-end report" → income statement + balance sheet + open items
- "Categorize my transactions" → list uncategorized → list_accounts → categorize each

## API / UI

`GET/POST /api/v1/copilot/chats`, `GET /chats/:id`,
`POST /chats/:id/messages` (20 req/min, 120s max duration).
UI: chat sidebar, suggestion prompts, tool-use chips on assistant messages,
"Checking the books…" progress state.
