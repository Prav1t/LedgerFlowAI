import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { classifyDocument, extractFields } from "@/lib/ai/extraction";
import type { BankStatementExtraction, ExtractionResult } from "@/lib/ai/schemas";
import { flattenExtraction, primaryAmount, primaryDate, vendorNameOf } from "./extraction-helpers";
import { vendorService } from "./vendor.service";
import { transactionDedupeHash } from "@/lib/utils/hash";
import { SYSTEM_ACCOUNT_CODES } from "@/server/accounting-engine/default-chart";
import { logger } from "@/lib/utils/logger";
import { automationsQueue } from "@/lib/queue/queues";
import { QUEUE_NAMES } from "@/config/constants";
import { jobService } from "./job.service";
import { webhookService } from "./webhook.service";

const D = (v: number | string) => new Prisma.Decimal(v);

/**
 * Pipeline stage 2: classify → extract → persist.
 * Ends in NEEDS_REVIEW — a human always approves before anything posts.
 * All persistence happens in one transaction so a crash mid-way leaves
 * the document cleanly retryable rather than half-written.
 */
export async function runExtraction(documentId: string, organizationId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
  if (!document) throw new Error(`Document ${documentId} not found`);
  if (!document.ocrText) throw new Error("Document has no extracted text — OCR stage incomplete");

  await prisma.document.update({ where: { id: documentId }, data: { status: "EXTRACTING", error: null } });

  const classification = await classifyDocument(document.ocrText);
  logger.info({ documentId, type: classification.type, confidence: classification.confidence }, "Classified");

  const result = await extractFields(classification.type, document.ocrText);
  const fields = flattenExtraction(result);
  const aiConfidence = Math.min(classification.confidence, result.data.confidence);

  await prisma.$transaction(async (tx) => {
    const vendorName = vendorNameOf(result);
    const vendor = vendorName ? await vendorService.findOrCreate(tx, organizationId, vendorName) : null;

    await tx.extractedField.deleteMany({ where: { documentId } }); // idempotent re-runs
    if (fields.length > 0) {
      await tx.extractedField.createMany({
        data: fields.map((f) => ({
          documentId,
          key: f.key,
          value: f.value,
          normalizedValue: f.normalizedValue as Prisma.InputJsonValue,
          confidence: result.data.confidence,
        })),
      });
    }

    const amount = primaryAmount(result);
    const dateStr = primaryDate(result);
    await tx.document.update({
      where: { id: documentId },
      data: {
        type: classification.type,
        aiConfidence,
        status: "NEEDS_REVIEW",
        vendorId: vendor?.id ?? null,
        totalAmount: amount !== null ? D(amount) : null,
        documentDate: dateStr ? new Date(`${dateStr}T00:00:00Z`) : null,
        currency: "currency" in result.data ? (result.data.currency ?? undefined) : undefined,
      },
    });

    await persistTypedRecord(tx, organizationId, documentId, vendor?.id ?? null, result);

    await tx.notification.create({
      data: {
        organizationId,
        type: "DOCUMENT_READY_FOR_REVIEW",
        title: "Document ready for review",
        body: `${document.filename} was read as ${classification.type.toLowerCase().replace(/_/g, " ")} (${Math.round(aiConfidence * 100)}% confidence)`,
        href: `/documents/${documentId}`,
      },
    });
  });

  await webhookService.dispatch(organizationId, "document.review_ready", {
    documentId,
    type: classification.type,
    confidence: aiConfidence,
  });

  // Stage 3: automations sweep (duplicates, categorization, matching, recurring).
  const automationJob = await jobService.createStage({
    organizationId,
    documentId,
    queue: QUEUE_NAMES.AUTOMATIONS,
    name: "post-extraction",
  });
  const bullJob = await automationsQueue.add("post-extraction", {
    kind: "post-extraction",
    organizationId,
    documentId,
    jobId: automationJob.id,
  });
  await prisma.job.update({ where: { id: automationJob.id }, data: { bullJobId: bullJob.id } });

  return { type: classification.type, confidence: aiConfidence, fieldCount: fields.length };
}

/** Create/refresh the typed row (Invoice/Receipt/Check/BankStatement) for a document. */
async function persistTypedRecord(
  tx: Prisma.TransactionClient,
  organizationId: string,
  documentId: string,
  vendorId: string | null,
  result: ExtractionResult
): Promise<void> {
  switch (result.kind) {
    case "invoice": {
      const d = result.data;
      const data = {
        organizationId,
        vendorId,
        direction: "PAYABLE" as const, // uploaded supplier docs are payables; review can flip
        invoiceNumber: d.invoiceNumber,
        purchaseOrderNumber: d.purchaseOrderNumber,
        issueDate: d.issueDate ? new Date(`${d.issueDate}T00:00:00Z`) : null,
        dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00Z`) : null,
        subtotal: d.subtotal !== null ? D(d.subtotal) : null,
        taxAmount: d.taxAmount !== null ? D(d.taxAmount) : null,
        totalAmount: D(d.total),
        currency: d.currency ?? "CAD",
        lineItems: d.lineItems.length > 0 ? (d.lineItems as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      };
      await tx.invoice.upsert({
        where: { documentId },
        create: { ...data, documentId },
        update: data,
      });
      return;
    }
    case "receipt": {
      const d = result.data;
      const data = {
        organizationId,
        vendorId,
        merchantName: d.merchantName,
        date: d.date ? new Date(`${d.date}T00:00:00Z`) : null,
        amount: D(d.amount),
        taxAmount: d.taxAmount !== null ? D(d.taxAmount) : null,
        paymentMethod: d.paymentMethod,
      };
      await tx.receipt.upsert({ where: { documentId }, create: { ...data, documentId }, update: data });
      return;
    }
    case "check": {
      const d = result.data;
      const data = {
        organizationId,
        checkNumber: d.checkNumber,
        payee: d.payee,
        amount: D(d.amount),
        date: d.date ? new Date(`${d.date}T00:00:00Z`) : null,
        memo: d.memo,
      };
      await tx.check.upsert({ where: { documentId }, create: { ...data, documentId }, update: data });
      return;
    }
    case "bank_statement":
      return persistBankStatement(tx, organizationId, documentId, result.data);
    case "generic":
      return; // fields-only documents
  }
}

/**
 * Bank statements also materialize a BankAccount (found by masked number,
 * else created against the default chequing ledger account) and import
 * transactions idempotently via the dedupe hash unique constraint.
 */
async function persistBankStatement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  documentId: string,
  d: BankStatementExtraction
): Promise<void> {
  const masked = d.accountNumberMasked?.slice(-4) ?? null;
  const accountName = [d.institution ?? "Bank account", masked ? `••${masked}` : null]
    .filter(Boolean)
    .join(" ");

  let bankAccount = await tx.bankAccount.findFirst({
    where: { organizationId, name: accountName },
  });
  if (!bankAccount) {
    const chequing = await tx.account.findUnique({
      where: { organizationId_code: { organizationId, code: "1010" } },
    });
    const cash = await tx.account.findUnique({
      where: {
        organizationId_code: { organizationId, code: SYSTEM_ACCOUNT_CODES.UNDEPOSITED_FUNDS },
      },
    });
    const ledgerAccountId = chequing?.id ?? cash?.id;
    if (!ledgerAccountId) throw new Error("Chart of accounts missing bank ledger account");
    bankAccount = await tx.bankAccount.create({
      data: {
        organizationId,
        accountId: ledgerAccountId,
        name: accountName,
        institution: d.institution,
        currency: d.currency ?? "CAD",
      },
    });
  }

  const statement = await tx.bankStatement.upsert({
    where: { documentId },
    create: {
      organizationId,
      bankAccountId: bankAccount.id,
      documentId,
      periodStart: new Date(`${d.periodStart ?? d.transactions[0]?.date ?? "1970-01-01"}T00:00:00Z`),
      periodEnd: new Date(
        `${d.periodEnd ?? d.transactions.at(-1)?.date ?? d.periodStart ?? "1970-01-01"}T00:00:00Z`
      ),
      openingBalance: D(d.openingBalance ?? 0),
      closingBalance: D(d.closingBalance ?? 0),
    },
    update: {
      openingBalance: D(d.openingBalance ?? 0),
      closingBalance: D(d.closingBalance ?? 0),
    },
  });

  if (d.transactions.length > 0) {
    await tx.transaction.createMany({
      data: d.transactions.map((t) => ({
        organizationId,
        bankAccountId: bankAccount.id,
        statementId: statement.id,
        date: new Date(`${t.date}T00:00:00Z`),
        description: t.description,
        amount: D(t.amount),
        direction: t.direction,
        runningBalance: t.runningBalance !== null ? D(t.runningBalance) : null,
        dedupeHash: transactionDedupeHash({
          bankAccountId: bankAccount.id,
          date: t.date,
          amount: t.amount.toFixed(2),
          description: t.description,
        }),
      })),
      skipDuplicates: true, // unique(bankAccountId, dedupeHash) absorbs re-imports
    });
  }

  if (d.closingBalance !== null) {
    await tx.bankAccount.update({
      where: { id: bankAccount.id },
      data: { currentBalance: D(d.closingBalance), lastStatementAt: new Date() },
    });
  }
}
