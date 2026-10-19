import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { reportsService } from "@/server/services/reports.service";
import { accountBalance } from "@/server/accounting-engine/posting";
import { findDuplicateInvoiceGroups } from "./duplicates";

/**
 * The copilot's window into org data. Every executor takes organizationId
 * from the authenticated context — the model can never choose the tenant.
 * Read-heavy by design; the single write (categorize_transaction) stages
 * data for review and can't post to the ledger.
 */

export interface ToolContext {
  organizationId: string;
}

const isoDay = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_report",
    description:
      "Financial statements computed from posted entries. income-statement and cash-flow need from+to; balance-sheet and trial-balance need asOf. Call twice with different periods to compare (e.g. to explain expense changes month-over-month).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income-statement", "balance-sheet", "cash-flow", "trial-balance"] },
        from: isoDay,
        to: isoDay,
        asOf: isoDay,
      },
      required: ["type"],
    },
  },
  {
    name: "list_accounts",
    description: "Chart of accounts with current posted balances. Optionally filter by type.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] },
      },
      required: [],
    },
  },
  {
    name: "list_journal_entries",
    description:
      "Journal entries with their debit/credit lines, newest first. Filter by entryNumber to explain a specific entry, or by date range.",
    input_schema: {
      type: "object",
      properties: {
        entryNumber: { type: "integer" },
        from: isoDay,
        to: isoDay,
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  {
    name: "list_transactions",
    description: "Bank transactions. Useful for finding uncategorized items to categorize.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["UNCATEGORIZED", "CATEGORIZED", "MATCHED", "RECONCILED", "EXCLUDED"] },
        from: isoDay,
        to: isoDay,
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },
  {
    name: "categorize_transaction",
    description:
      "Assign an expense/revenue category (by account code) to a bank transaction. This stages the categorization — nothing posts to the ledger without human review. Confirm the account code exists via list_accounts first.",
    input_schema: {
      type: "object",
      properties: {
        transactionId: { type: "string" },
        accountCode: { type: "string" },
      },
      required: ["transactionId", "accountCode"],
    },
  },
  {
    name: "list_documents",
    description: "Uploaded documents with status/type/amount. q searches filenames.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["UPLOADED", "OCR_PROCESSING", "EXTRACTING", "NEEDS_REVIEW", "APPROVED", "POSTED", "REJECTED", "FAILED"],
        },
        type: {
          type: "string",
          enum: ["INVOICE", "RECEIPT", "BILL", "BANK_STATEMENT", "CHECK", "FINANCIAL_STATEMENT", "PURCHASE_ORDER", "OTHER"],
        },
        q: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  {
    name: "find_duplicate_invoices",
    description: "Scan all invoices for likely duplicates (same vendor+number, or same vendor+amount+date).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

const at = (day: string) => new Date(`${day}T00:00:00Z`);

type ToolInput = Record<string, unknown>;

export async function executeTool(name: string, input: ToolInput, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "get_report": {
      const type = input.type as string;
      if (type === "income-statement" || type === "cash-flow") {
        if (!input.from || !input.to) throw new Error(`${type} requires from and to (YYYY-MM-DD)`);
        const from = at(input.from as string);
        const to = at(input.to as string);
        return type === "income-statement"
          ? reportsService.incomeStatement(ctx.organizationId, from, to)
          : reportsService.cashFlow(ctx.organizationId, from, to);
      }
      if (!input.asOf) throw new Error(`${type} requires asOf (YYYY-MM-DD)`);
      const asOf = at(input.asOf as string);
      return type === "balance-sheet"
        ? reportsService.balanceSheet(ctx.organizationId, asOf)
        : reportsService.trialBalance(ctx.organizationId, asOf);
    }

    case "list_accounts": {
      const [accounts, sums] = await Promise.all([
        prisma.account.findMany({
          where: { organizationId: ctx.organizationId, ...(input.type ? { type: input.type as never } : {}) },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, type: true, isActive: true },
        }),
        prisma.journalLine.groupBy({
          by: ["accountId"],
          where: { journalEntry: { organizationId: ctx.organizationId, status: { in: ["POSTED", "REVERSED"] } } },
          _sum: { debit: true, credit: true },
        }),
      ]);
      const sumsById = new Map(sums.map((s) => [s.accountId, s._sum]));
      return accounts.map((a) => {
        const s = sumsById.get(a.id);
        return {
          code: a.code,
          name: a.name,
          type: a.type,
          isActive: a.isActive,
          balance: accountBalance(a.type, s?.debit?.toString() ?? 0, s?.credit?.toString() ?? 0).toFixed(2),
        };
      });
    }

    case "list_journal_entries": {
      const entries = await prisma.journalEntry.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.entryNumber ? { entryNumber: input.entryNumber as number } : {}),
          ...(input.from || input.to
            ? {
                date: {
                  ...(input.from ? { gte: at(input.from as string) } : {}),
                  ...(input.to ? { lte: at(input.to as string) } : {}),
                },
              }
            : {}),
        },
        orderBy: { entryNumber: "desc" },
        take: Math.min((input.limit as number) ?? 10, 50),
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      });
      return entries.map((e) => ({
        entryNumber: e.entryNumber,
        date: e.date.toISOString().slice(0, 10),
        memo: e.memo,
        status: e.status,
        sourceType: e.sourceType,
        lines: e.lines.map((l) => ({
          account: `${l.account.code} ${l.account.name}`,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          memo: l.memo,
        })),
      }));
    }

    case "list_transactions": {
      const transactions = await prisma.transaction.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.status ? { status: input.status as never } : {}),
          ...(input.from || input.to
            ? {
                date: {
                  ...(input.from ? { gte: at(input.from as string) } : {}),
                  ...(input.to ? { lte: at(input.to as string) } : {}),
                },
              }
            : {}),
        },
        orderBy: { date: "desc" },
        take: Math.min((input.limit as number) ?? 25, 100),
        include: { categoryAccount: { select: { code: true, name: true } }, bankAccount: { select: { name: true } } },
      });
      return transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        description: t.description,
        amount: t.amount.toFixed(2),
        direction: t.direction,
        status: t.status,
        bankAccount: t.bankAccount.name,
        category: t.categoryAccount ? `${t.categoryAccount.code} ${t.categoryAccount.name}` : null,
      }));
    }

    case "categorize_transaction": {
      const transaction = await prisma.transaction.findFirst({
        where: { id: input.transactionId as string, organizationId: ctx.organizationId },
      });
      if (!transaction) throw new Error("Transaction not found in this organization");
      if (transaction.status === "RECONCILED") throw new Error("Reconciled transactions can't be recategorized");

      const account = await prisma.account.findUnique({
        where: { organizationId_code: { organizationId: ctx.organizationId, code: input.accountCode as string } },
      });
      if (!account || !account.isActive) throw new Error(`No active account with code ${input.accountCode}`);

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { categoryAccountId: account.id, status: "CATEGORIZED" },
      });
      return {
        categorized: true,
        transactionId: transaction.id,
        description: transaction.description,
        category: `${account.code} ${account.name}`,
        note: "Staged for review — posting to the ledger still requires human approval.",
      };
    }

    case "list_documents": {
      const documents = await prisma.document.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.status ? { status: input.status as never } : {}),
          ...(input.type ? { type: input.type as never } : {}),
          ...(input.q ? { filename: { contains: input.q as string, mode: "insensitive" } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min((input.limit as number) ?? 15, 50),
        include: { vendor: { select: { name: true } } },
      });
      return documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        type: d.type,
        status: d.status,
        vendor: d.vendor?.name ?? null,
        totalAmount: d.totalAmount?.toFixed(2) ?? null,
        documentDate: d.documentDate?.toISOString().slice(0, 10) ?? null,
        aiConfidence: d.aiConfidence,
      }));
    }

    case "find_duplicate_invoices": {
      const invoices = await prisma.invoice.findMany({
        where: { organizationId: ctx.organizationId, status: { not: "VOID" } },
        include: { vendor: { select: { name: true } }, document: { select: { filename: true } } },
      });
      const groups = findDuplicateInvoiceGroups(
        invoices.map((i) => ({
          id: i.id,
          vendorName: i.vendor?.name ?? null,
          invoiceNumber: i.invoiceNumber,
          totalAmount: i.totalAmount.toFixed(2),
          issueDate: i.issueDate?.toISOString().slice(0, 10) ?? null,
          filename: i.document?.filename ?? null,
        }))
      );
      return { duplicateGroups: groups, groupCount: groups.length };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
