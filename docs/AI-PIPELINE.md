# AI Extraction (pipeline stage 2)

```
ocrText ─▶ classifyDocument ─▶ extractFields(type) ─▶ transaction {
             fields · vendor · document rollups · typed record · notification
           } ─▶ NEEDS_REVIEW
```

## Structured outputs, never free text

Every model response is constrained twice:

1. **Provider-side** — OpenAI strict `json_schema` response format; on any
   OpenAI failure, Claude with `tool_choice: {type:"tool"}` forcing a tool
   call whose `input_schema` is the same JSON Schema.
2. **App-side** — the raw JSON is parsed by the originating Zod schema
   (`src/lib/ai/schemas.ts`). A response that doesn't parse is a failed
   extraction that retries; malformed data cannot reach the database.

Models are env-overridable: `OPENAI_MODEL` (default `gpt-5`),
`ANTHROPIC_MODEL` (default `claude-sonnet-4-6`).

## Extraction contracts

| Type | Fields |
|---|---|
| INVOICE / BILL / PO | vendor, invoice #, PO #, issue/due dates, currency, subtotal, tax (GST/HST), total, line items |
| RECEIPT | merchant, date, amount, tax, payment method, suggested category, currency |
| BANK_STATEMENT | institution, masked account (last 4 only — enforced in prompt + schema), period, opening/closing balances, transactions[date, description, amount, direction, running balance] |
| CHECK | check #, payee, amount, date, memo |
| other | summary + key/value fields |

`aiConfidence = min(classification confidence, extraction confidence)` —
the weakest link gates the document. Review is always required
(`NEEDS_REVIEW`); `REVIEW_CONFIDENCE_THRESHOLD` (0.92) is the bar future
auto-approval automations must clear.

## Persistence semantics

- ExtractedFields are replaced wholesale per run (idempotent re-runs);
  arrays (line items, transactions) persist as one JSON row for table
  rendering on the review screen.
- Vendors resolve by normalized name ("Shell Canada Ltd." ≡ "SHELL CANADA");
  new vendors are created inside the same transaction.
- Bank statements materialize a BankAccount (matched by name, else created
  against ledger 1010) and import transactions with `skipDuplicates` on the
  dedupe hash — re-uploading a statement can't double-import.
- Everything runs in a single Prisma transaction: a crash mid-persist
  leaves the document retryable, not half-written.
