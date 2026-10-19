import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { journalService } from "./journal.service";
import { buildDocumentEntryLines } from "@/server/accounting-engine/entry-builder";
import { SYSTEM_ACCOUNT_CODES } from "@/server/accounting-engine/default-chart";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { logger } from "@/lib/utils/logger";
import { webhookService } from "./webhook.service";

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * The human gate in the pipeline:
 *   NEEDS_REVIEW → (field corrections) → approve → journal entry → POSTED
 * Bank statements approve without an entry — their transactions post
 * individually through categorization.
 */
export const approvalService = {
  /** Reviewer corrections before approval. Marks fields as human-verified. */
  async correctFields(
    organizationId: string,
    userId: string,
    documentId: string,
    corrections: Array<{ key: string; value: string }>
  ) {
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new ApprovalError("Document not found", 404);
    if (document.status !== "NEEDS_REVIEW") {
      throw new ApprovalError("Only documents awaiting review can be corrected", 409);
    }

    await prisma.$transaction(async (tx) => {
      for (const c of corrections) {
        await tx.extractedField.upsert({
          where: { documentId_key: { documentId, key: c.key } },
          create: { documentId, key: c.key, value: c.value, isCorrected: true, confidence: 1 },
          update: { value: c.value, isCorrected: true, confidence: 1 },
        });
      }
      // Keep document rollups in sync with headline corrections.
      const rollups: Prisma.DocumentUpdateInput = {};
      for (const c of corrections) {
        if (["total", "amount", "closing_balance"].includes(c.key)) {
          const n = Number(c.value);
          if (Number.isFinite(n)) rollups.totalAmount = new Prisma.Decimal(c.value);
        }
        if (["issue_date", "date", "period_end"].includes(c.key) && /^\d{4}-\d{2}-\d{2}$/.test(c.value)) {
          rollups.documentDate = new Date(`${c.value}T00:00:00Z`);
        }
      }
      if (Object.keys(rollups).length > 0) {
        await tx.document.update({ where: { id: documentId }, data: rollups });
      }
    });

    await auditLogRepository.record({
      organizationId,
      actorUserId: userId,
      action: "document.fields_corrected",
      entityType: "Document",
      entityId: documentId,
      metadata: { keys: corrections.map((c) => c.key) },
    });
  },

  async approve(
    organizationId: string,
    userId: string,
    documentId: string,
    options?: { expenseAccountId?: string }
  ) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: { fields: true, vendor: { include: { defaultAccount: true } } },
    });
    if (!document) throw new ApprovalError("Document not found", 404);
    if (document.status !== "NEEDS_REVIEW") {
      throw new ApprovalError(`Document is not awaiting review (status: ${document.status})`, 409);
    }

    // Bank statements: approval accepts the import; no summary entry exists.
    if (document.type === "BANK_STATEMENT" || document.type === "FINANCIAL_STATEMENT" || document.type === "OTHER" || document.type === "PURCHASE_ORDER" || document.type === null) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "APPROVED", reviewedById: userId, reviewedAt: new Date() },
      });
      await auditLogRepository.record({
        organizationId,
        actorUserId: userId,
        action: "document.approved",
        entityType: "Document",
        entityId: documentId,
        metadata: { type: document.type, journalEntry: false },
      });
      return { documentId, journalEntryId: null };
    }

    const field = (key: string) => document.fields.find((f) => f.key === key)?.value ?? null;
    const total = document.totalAmount?.toString() ?? field("total") ?? field("amount");
    if (!total || !(Number(total) > 0)) {
      throw new ApprovalError("Document needs a positive total amount before approval — correct the fields first", 400);
    }
    const taxAmount = field("tax_amount");

    const accounts = await resolveAccounts(organizationId, document, options?.expenseAccountId);
    const isPayable = document.type === "INVOICE" || document.type === "BILL";

    const lines = buildDocumentEntryLines({
      kind: isPayable ? "PAYABLE" : "SPENT",
      total,
      taxAmount,
      expenseAccountId: accounts.expenseAccountId,
      taxAccountId: accounts.taxAccountId,
      creditAccountId: isPayable ? accounts.payableAccountId : accounts.bankAccountId,
      memo: buildMemo(document.type, document.vendor?.name, field("invoice_number") ?? field("check_number")),
      vendorId: document.vendorId,
    });

    const entryDate = (document.documentDate ?? new Date()).toISOString().slice(0, 10);

    const { entry } = await prisma.$transaction(async (tx) => {
      const created = await journalService.createEntry(
        organizationId,
        userId,
        { date: entryDate, memo: buildMemo(document.type, document.vendor?.name, field("invoice_number")), lines, sourceType: "DOCUMENT", post: true },
        tx
      );
      await tx.document.update({
        where: { id: documentId },
        data: { status: "POSTED", journalEntryId: created.id, reviewedById: userId, reviewedAt: new Date() },
      });
      if (document.type === "INVOICE" || document.type === "BILL") {
        await tx.invoice.updateMany({ where: { documentId }, data: { status: "OPEN" } });
      }
      return { entry: created };
    });

    await auditLogRepository.record({
      organizationId,
      actorUserId: userId,
      action: "document.approved",
      entityType: "Document",
      entityId: documentId,
      metadata: { entryNumber: entry.entryNumber, journalEntryId: entry.id },
    });
    logger.info({ documentId, entryNumber: entry.entryNumber }, "Document approved and posted");
    await webhookService.dispatch(organizationId, "document.posted", {
      documentId,
      journalEntryId: entry.id,
      entryNumber: entry.entryNumber,
    });
    return { documentId, journalEntryId: entry.id, entryNumber: entry.entryNumber };
  },

  async reject(organizationId: string, userId: string, documentId: string, reason?: string) {
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new ApprovalError("Document not found", 404);
    if (document.status !== "NEEDS_REVIEW") {
      throw new ApprovalError("Only documents awaiting review can be rejected", 409);
    }
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "REJECTED", reviewedById: userId, reviewedAt: new Date(), error: reason?.slice(0, 500) ?? null },
    });
    await auditLogRepository.record({
      organizationId,
      actorUserId: userId,
      action: "document.rejected",
      entityType: "Document",
      entityId: documentId,
      metadata: { reason: reason ?? null },
    });
  },
};

function buildMemo(type: string | null, vendorName?: string | null, refNumber?: string | null): string {
  return [type?.toLowerCase().replace(/_/g, " "), vendorName, refNumber ? `#${refNumber}` : null]
    .filter(Boolean)
    .join(" — ");
}

/** Resolve the accounts an approval entry needs, with sensible fallbacks. */
async function resolveAccounts(
  organizationId: string,
  document: {
    vendor: { defaultAccountId: string | null } | null;
    fields: Array<{ key: string; value: string }>;
  },
  explicitExpenseAccountId?: string
) {
  const byCode = async (code: string) => {
    const account = await prisma.account.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    });
    if (!account) throw new ApprovalError(`Chart of accounts is missing system account ${code}`, 400);
    return account.id;
  };

  let expenseAccountId = explicitExpenseAccountId ?? null;

  if (expenseAccountId) {
    const valid = await prisma.account.findFirst({
      where: { id: expenseAccountId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!valid) throw new ApprovalError("Selected expense account not found", 400);
  }

  // Priority: explicit choice → vendor default → AI-suggested category name → uncategorized.
  if (!expenseAccountId) expenseAccountId = document.vendor?.defaultAccountId ?? null;
  if (!expenseAccountId) {
    const suggested = document.fields.find((f) => f.key === "suggested_category")?.value;
    if (suggested) {
      const match = await prisma.account.findFirst({
        where: {
          organizationId,
          type: "EXPENSE",
          isActive: true,
          name: { contains: suggested, mode: "insensitive" },
        },
        select: { id: true },
      });
      expenseAccountId = match?.id ?? null;
    }
  }
  expenseAccountId ??= await byCode(SYSTEM_ACCOUNT_CODES.UNCATEGORIZED_EXPENSE);

  return {
    expenseAccountId,
    taxAccountId: await byCode(SYSTEM_ACCOUNT_CODES.SALES_TAX_RECOVERABLE),
    payableAccountId: await byCode(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE),
    bankAccountId: await byCode("1010"),
  };
}
